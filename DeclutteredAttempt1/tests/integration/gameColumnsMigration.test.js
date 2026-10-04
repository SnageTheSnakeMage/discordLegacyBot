/**
 * addMissingGameColumns against a Games table built before the column
 * existed. The old shape is raw SQL, because syncing the model would create
 * the column the migration is supposed to add.
 */
const { Sequelize } = require('sequelize');
const { addMissingGameColumns } = require('../../scripts/bootstrap-db.js');

describe('addMissingGameColumns', () => {
  let sequelize;

  beforeEach(async () => {
    sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
    await sequelize.query('CREATE TABLE Games (Game_ID INTEGER PRIMARY KEY AUTOINCREMENT, GAME_STATE TEXT NOT NULL)');
    await sequelize.query("INSERT INTO Games (GAME_STATE) VALUES ('ACTIVE'), ('OVER')");
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await sequelize.close();
  });

  it('adds healAmount, and every existing game heals 1', async () => {
    const result = await addMissingGameColumns({ sequelize });
    expect(result.added).toEqual(['healAmount']);
    const [rows] = await sequelize.query('SELECT healAmount FROM Games');
    expect(rows.map((r) => r.healAmount)).toEqual([1, 1]);
  });

  // this runs on every container start, so a second pass must leave a game's
  // own setting alone
  it('adds nothing on a second run, and keeps a value set since', async () => {
    await addMissingGameColumns({ sequelize });
    await sequelize.query('UPDATE Games SET healAmount = 3');

    const second = await addMissingGameColumns({ sequelize });

    expect(second.added).toEqual([]);
    const [rows] = await sequelize.query('SELECT healAmount FROM Games');
    expect(rows.map((r) => r.healAmount)).toEqual([3, 3]);
  });
});
