/**
 * stripChaosEventPrefixes against Games rows holding the poll label
 * "previous event: X" where the event name X belongs.
 */
const { Sequelize } = require('sequelize');
const { stripChaosEventPrefixes } = require('../../scripts/bootstrap-db.js');

describe('stripChaosEventPrefixes', () => {
  let sequelize;
  const events = async () => (await sequelize.query('SELECT CURR_CC_EVENT FROM Games ORDER BY Game_ID'))[0]
    .map((r) => r.CURR_CC_EVENT);

  beforeEach(async () => {
    sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
    await sequelize.query('CREATE TABLE Games (Game_ID INTEGER PRIMARY KEY AUTOINCREMENT, CURR_CC_EVENT TEXT)');
    await sequelize.query(`INSERT INTO Games (CURR_CC_EVENT) VALUES
      ('previous event: Leftovers'),
      ('previous event: previous event: Corpse Explosion'),
      ('Time Acceleration!'),
      (NULL),
      ('PREVIOUS EVENT: Blockade')`);
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await sequelize.close();
  });

  it('strips every stacked prefix and leaves bare names, nulls and lookalikes alone', async () => {
    const result = await stripChaosEventPrefixes({ sequelize });
    expect(result.fixed).toEqual([1, 2]);
    expect(await events()).toEqual(['Leftovers', 'Corpse Explosion', 'Time Acceleration!', null, 'PREVIOUS EVENT: Blockade']);
  });

  it('changes nothing on a second run', async () => {
    await stripChaosEventPrefixes({ sequelize });
    const second = await stripChaosEventPrefixes({ sequelize });
    expect(second.fixed).toEqual([]);
    expect(await events()).toEqual(['Leftovers', 'Corpse Explosion', 'Time Acceleration!', null, 'PREVIOUS EVENT: Blockade']);
  });
});
