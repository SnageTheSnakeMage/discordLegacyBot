/**
 * migrateGameFlags against a database in the shape the live volume is in: a
 * Games table with no flag columns and rows in the gamestates that became
 * them. sequelize.sync() never alters an existing table, so this is the only
 * thing that carries an existing game across.
 *
 * The old shape is built with raw SQL on purpose. Syncing the model would
 * create the columns the migration is supposed to add, and the test would pass
 * without the migration doing anything.
 */
const { Sequelize } = require('sequelize');
const initModels = require('../../database/init-models.js');
const { migrateGameFlags } = require('../../scripts/bootstrap-db.js');

const LEGACY_STATES = ['REGISTRATION', 'ACTIVE', 'DEV_PAUSED', 'OVER', 'TIMESTOPPED', 'FINALE', 'SANDBOX', 'INACTIVE'];

describe('migrateGameFlags', () => {
  let sequelize;
  let models;

  /** a Games table as it was before the flag columns, with one row per state */
  async function legacyDb(states = LEGACY_STATES) {
    sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
    models = initModels(sequelize);
    await sequelize.query(`CREATE TABLE Games (
      Game_ID INTEGER PRIMARY KEY AUTOINCREMENT,
      GAME_STATE TEXT NOT NULL,
      lastAPDistributionTimestampInMS INTEGER
    )`);
    for (const state of states) {
      await sequelize.query('INSERT INTO Games (GAME_STATE) VALUES (:state)', { replacements: { state } });
    }
    jest.spyOn(console, 'log').mockImplementation(() => {});
  }

  /** every game keyed by the state it started in */
  async function byStartingState(states = LEGACY_STATES) {
    const [rows] = await sequelize.query('SELECT * FROM Games ORDER BY Game_ID');
    return Object.fromEntries(rows.map((row, i) => [states[i], row]));
  }

  afterEach(async () => {
    jest.restoreAllMocks();
    if (sequelize) await sequelize.close();
    sequelize = null;
  });

  it('adds the four columns to a table that has none of them', async () => {
    await legacyDb();
    const result = await migrateGameFlags({ sequelize, models });
    expect(result).toMatchObject({ migrated: true, rows: LEGACY_STATES.length });
    expect(result.added.sort()).toEqual(['finale', 'gameActive', 'sandbox', 'timeStopped']);
    const columns = await sequelize.getQueryInterface().describeTable('Games');
    for (const column of ['gameActive', 'timeStopped', 'finale', 'sandbox']) {
      expect(columns[column]).toBeDefined();
    }
  });

  // the three states that described a game being played all become ACTIVE plus
  // their flag; the one that meant "finished" becomes OVER
  it.each([
    ['REGISTRATION', 'REGISTRATION', { gameActive: 0, timeStopped: 0, finale: 0, sandbox: 0 }],
    ['ACTIVE', 'ACTIVE', { gameActive: 1, timeStopped: 0, finale: 0, sandbox: 0 }],
    ['DEV_PAUSED', 'DEV_PAUSED', { gameActive: 0, timeStopped: 0, finale: 0, sandbox: 0 }],
    ['OVER', 'OVER', { gameActive: 0, timeStopped: 0, finale: 0, sandbox: 0 }],
    ['TIMESTOPPED', 'ACTIVE', { gameActive: 1, timeStopped: 1, finale: 0, sandbox: 0 }],
    ['FINALE', 'ACTIVE', { gameActive: 1, timeStopped: 0, finale: 1, sandbox: 0 }],
    ['SANDBOX', 'ACTIVE', { gameActive: 0, timeStopped: 0, finale: 0, sandbox: 1 }],
    ['INACTIVE', 'OVER', { gameActive: 0, timeStopped: 0, finale: 0, sandbox: 0 }],
  ])('%s becomes %s with the right flags', async (was, becomes, flags) => {
    await legacyDb();
    await migrateGameFlags({ sequelize, models });
    const row = (await byStartingState())[was];
    expect(row.GAME_STATE).toBe(becomes);
    expect({
      gameActive: row.gameActive, timeStopped: row.timeStopped,
      finale: row.finale, sandbox: row.sandbox,
    }).toEqual(flags);
  });

  // the clock column has to reproduce exactly which games used to be paid, or
  // the migration either stops a live game or starts a finished one
  it('gives a running clock to exactly the states AP used to run in', async () => {
    await legacyDb();
    await migrateGameFlags({ sequelize, models });
    const rows = await byStartingState();
    const running = Object.entries(rows).filter(([, row]) => row.gameActive).map(([was]) => was).sort();
    expect(running).toEqual(['ACTIVE', 'FINALE', 'TIMESTOPPED']);
  });

  it('leaves no game in a state outside the new enum', async () => {
    await legacyDb();
    await migrateGameFlags({ sequelize, models });
    const [rows] = await sequelize.query('SELECT DISTINCT GAME_STATE FROM Games');
    expect(rows.map((r) => r.GAME_STATE).sort())
      .toEqual(['ACTIVE', 'DEV_PAUSED', 'OVER', 'REGISTRATION']);
  });

  // this runs on every container start, so a second pass has to be a no-op.
  // Not merely harmless: re-running the state rewrites would start the clock on
  // a game whose clock was deliberately stopped since.
  it('does nothing on a second run, and leaves a stopped clock stopped', async () => {
    await legacyDb(['ACTIVE']);
    await migrateGameFlags({ sequelize, models });
    await sequelize.query('UPDATE Games SET gameActive = 0');

    const second = await migrateGameFlags({ sequelize, models });

    expect(second).toEqual({ migrated: false, added: [], rows: 0 });
    const [[row]] = await sequelize.query('SELECT gameActive FROM Games');
    expect(row.gameActive).toBe(0);
  });

  it('runs on an empty Games table without complaining', async () => {
    await legacyDb([]);
    const result = await migrateGameFlags({ sequelize, models });
    expect(result).toMatchObject({ migrated: true, rows: 0 });
  });

  // the columns are NOT NULL on the model, so a row that came through the
  // migration has to satisfy it or the next write through Sequelize fails
  it('leaves every flag non-null, so the model can write the row', async () => {
    await legacyDb();
    await migrateGameFlags({ sequelize, models });
    const [rows] = await sequelize.query(`SELECT COUNT(*) AS n FROM Games
      WHERE gameActive IS NULL OR timeStopped IS NULL OR finale IS NULL OR sandbox IS NULL`);
    expect(rows[0].n).toBe(0);
  });
});
