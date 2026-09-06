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
 * not game state, so it is tracked as database/seed/classes.json and
 * re-seeded here. Games, Players, Layers and Tiles are deliberately NOT
 * seeded - those are live state and belong only on the volume.
 */
const path = require('path');
const fs = require('fs');
const { Sequelize } = require('sequelize');
const initModels = require('../database/init-models.js');

const SEED = path.join(__dirname, '..', 'database', 'seed', 'classes.json');

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
    const classes = JSON.parse(fs.readFileSync(SEED, 'utf8'));
    await models.Classes.bulkCreate(classes);
    console.log(`[bootstrap] seeded ${classes.length} classes into ${storage}`);
  } finally {
    await sequelize.close();
  }
}

bootstrap().catch((err) => {
  console.error('[bootstrap] failed:', err);
  process.exit(1);
});
