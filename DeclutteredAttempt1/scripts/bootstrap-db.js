/**
 * First-run database bootstrap. Idempotent: safe to run on every container
 * start, does nothing once the database is populated.
 *
 * Why this exists: nothing in the app ever created the schema. The tables
 * and the 38 Classes rows only existed because database/database.db was
 * committed to git, so a deploy onto an empty volume produced a database
 * with no tables at all and a bot that crashed on its first query.
 *
 * Classes is reference data (the class definitions the game is built on),
 * not game state, so it is tracked as database/seed/classes.csv - a plain
 * spreadsheet, laid out like the class sheet linked in the README, so it
 * can be read and edited without wading through JSON. Games, Players,
 * Layers and Tiles are deliberately NOT seeded: those are live state and
 * belong only on the volume.
 */
const path = require('path');
const fs = require('fs');
const { Sequelize } = require('sequelize');
const initModels = require('../database/init-models.js');

const SEED = path.join(__dirname, '..', 'database', 'seed', 'classes.csv');

/** csv header -> Classes column. The header is the sheet's own wording. */
const COLUMNS = {
  id: 'Class_ID',
  class: 'Class_Name',
  ap: 'Start_AP',
  max_ap: 'Start_MAX_AP',
  hp: 'Start_HP',
  max_hp: 'Start_MAX_HP',
  range: 'Start_Range_',
  max_range: 'Start_MAX_Range_',
  damage: 'Start_Damage',
  max_damage: 'Start_MAX_Damage',
  color: 'Role_Color',
  description: 'Description',
};
const NUMERIC = new Set(['id', 'ap', 'max_ap', 'hp', 'max_hp', 'range', 'max_range', 'damage', 'max_damage']);

/**
 * RFC4180 CSV -> array of row arrays. Descriptions contain commas and
 * quotes, so a split(',') would corrupt them; this handles quoted fields,
 * doubled quotes inside them, and CRLF.
 */
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false, i = 0;
  const endField = () => { row.push(field); field = ''; };
  const endRow = () => { endField(); rows.push(row); row = []; };
  while (i < text.length) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        quoted = false; i++; continue;
      }
      field += ch; i++; continue;
    }
    if (ch === '"') { quoted = true; i++; continue; }
    if (ch === ',') { endField(); i++; continue; }
    if (ch === '\r') { i++; continue; }
    if (ch === '\n') { endRow(); i++; continue; }
    field += ch; i++;
  }
  if (field !== '' || row.length) endRow();
  return rows;
}

function readSeed() {
  const rows = parseCsv(fs.readFileSync(SEED, 'utf8')).filter((r) => r.some((c) => c !== ''));
  const header = rows.shift().map((h) => h.trim());
  const unknown = header.filter((h) => !(h in COLUMNS));
  if (unknown.length) throw new Error(`classes.csv: unknown column(s): ${unknown.join(', ')}`);
  return rows.map((cells, n) => {
    if (cells.length !== header.length) {
      throw new Error(`classes.csv line ${n + 2}: got ${cells.length} fields, expected ${header.length}`);
    }
    const out = {};
    header.forEach((h, c) => {
      const raw = cells[c];
      if (!NUMERIC.has(h)) { out[COLUMNS[h]] = raw; return; }
      const num = Number(raw);
      if (raw === '' || Number.isNaN(num)) {
        throw new Error(`classes.csv line ${n + 2}: column "${h}" is "${raw}", which is not a number`);
      }
      out[COLUMNS[h]] = num;
    });
    return out;
  });
}

async function bootstrap() {
  const storage = process.env.LEGACY_DB_STORAGE || './database/database.db';
  const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage,
    logging: process.env.LEGACY_DB_LOGGING === '0' ? false : console.log,
  });
  const models = initModels(sequelize);

  try {
    // creates any table that does not exist; never alters or drops one that
    // does, so an existing volume keeps its data untouched
    await sequelize.sync();

    const existing = await models.Classes.count();
    if (existing > 0) {
      console.log(`[bootstrap] ${existing} classes already present, nothing to seed`);
      return;
    }
    const classes = readSeed();
    await models.Classes.bulkCreate(classes);
    console.log(`[bootstrap] seeded ${classes.length} classes into ${storage}`);
  } finally {
    await sequelize.close();
  }
}

module.exports = { parseCsv, readSeed };

if (require.main === module) {
  bootstrap().catch((err) => {
    console.error('[bootstrap] failed:', err.message);
    process.exit(1);
  });
}
