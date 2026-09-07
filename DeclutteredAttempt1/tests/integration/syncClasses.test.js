/**
 * --sync-classes against the real schema. This is the path a live game
 * actually runs, so its guarantees are pinned here rather than trusted:
 * it reports before it writes, a dry run writes nothing, it never deletes
 * a class a player might still hold, and re-running it changes nothing.
 */
const { freshDb, closeDb, models } = require('./helpers/testDb.js');
const { readSeed, syncClasses } = require('../../scripts/bootstrap-db.js');

const SEED = readSeed();

describe('syncClasses', () => {
  beforeEach(freshDb);
  afterAll(closeDb);

  /** plant the seed rows as the "live" table, with one thing changed */
  async function live(mutate = () => {}) {
    const rows = SEED.map((r) => ({ ...r }));
    mutate(rows);
    await models.Classes.bulkCreate(rows);
  }

  function captureLog() {
    const lines = [];
    jest.spyOn(console, 'log').mockImplementation((...a) => lines.push(String(a[0])));
    return lines;
  }

  it('updates a changed field back to what the seed says', async () => {
    await live((rows) => { rows[0].Role_Color = '000000'; });
    captureLog();
    await syncClasses({ models });
    expect((await models.Classes.findByPk(SEED[0].Class_ID)).Role_Color).toBe(SEED[0].Role_Color);
    expect(await models.Classes.count()).toBe(SEED.length);
  });

  it('reports each field it changes before changing it', async () => {
    await live((rows) => { rows[0].Role_Color = '000000'; });
    const lines = captureLog();
    await syncClasses({ models });
    expect(lines.some((l) => l.includes('Role_Color') && l.includes('"000000"'))).toBe(true);
  });

  it('is a no-op the second time', async () => {
    await live((rows) => { rows[0].Role_Color = '000000'; });
    captureLog();
    await syncClasses({ models });
    const lines = captureLog();
    await syncClasses({ models });
    expect(lines.some((l) => l.includes(`0 updated, 0 inserted, ${SEED.length} unchanged`))).toBe(true);
  });

  it('a dry run writes nothing', async () => {
    await live((rows) => { rows[0].Role_Color = '000000'; });
    captureLog();
    await syncClasses({ dryRun: true, models });
    expect((await models.Classes.findByPk(SEED[0].Class_ID)).Role_Color).toBe('000000');
  });

  it('inserts an id the database is missing', async () => {
    await live((rows) => { rows.splice(0, 1); });
    expect(await models.Classes.count()).toBe(SEED.length - 1);
    captureLog();
    await syncClasses({ models });
    expect(await models.Classes.count()).toBe(SEED.length);
  });

  it('never deletes a class the seed dropped, and says who still holds it', async () => {
    await live();
    await models.Classes.create({
      Class_ID: 99, Class_Name: 'Speedster', Start_AP: 0, Start_MAX_AP: 12,
      Start_HP: 6, Start_MAX_HP: 12, Start_Range_: 1, Start_MAX_Range_: 6,
      Start_Damage: 1, Start_MAX_Damage: 2, Role_Color: 'ABCDEF', Description: 'retired',
    });
    const lines = captureLog();
    await syncClasses({ models });
    expect(await models.Classes.findByPk(99)).not.toBeNull();
    expect(lines.some((l) => l.includes('KEPT id=99') && l.includes('Speedster'))).toBe(true);
  });

  it('leaves game state untouched', async () => {
    await live((rows) => { rows[0].Role_Color = '000000'; });
    const before = await models.Players.count();
    captureLog();
    await syncClasses({ models });
    expect(await models.Players.count()).toBe(before);
  });
});
