/**
 * Chaos events at AP distribution, against the real schema.
 *
 * The third of the mandated integration areas. These belong here rather
 * than in unit tests because every one of the commented-out originals
 * failed on a *column name* or a real query shape - Free_Movement for
 * Free_Move, Tiles.X/Y for X_Position/Y_Position, a Game_ID column Tiles
 * does not have - and a mock accepts all of those happily.
 */
const { freshDb, closeDb, models, utils } = require('./helpers/testDb.js');
const {
  seedGame, seedLayer, seedPlayer, seedClass, assertBoardConsistent,
} = require('./helpers/seed.js');

const CLIENT = { channels: { fetch: async () => null } };

describe('chaos events', () => {
  beforeEach(freshDb);
  afterAll(closeDb);

  async function board(event, gameOver = {}) {
    // every class the event code looks up by name has to exist
    for (const n of ['Cloudborn', 'Doctor']) await seedClass(n);
    const game = await seedGame({ CURR_CC_EVENT: event, APAmount: 2, AP_INTERVAL_MIN: 720, ...gameOver });
    const layer = await seedLayer(game.Game_ID, { width: 7, height: 7 });
    return { game, layer };
  }
  const reload = (p) => models.Players.findByPk(p.Player_ID);
  const tileOf = async (p) => models.Tiles.findByPk((await reload(p)).Tile_ID);

  it('Free Movement grants a free move, into Free_Move', async () => {
    // the original wrote Free_Movement, which is not a column at all
    const { game, layer } = await board('Free Movement');
    const p = await seedPlayer(game.Game_ID, { discordId: '1', x: 2, y: 2, layerId: layer.Layer_ID, Free_Move: 0 });

    await utils.distributeAP(game, 1, CLIENT);

    expect((await reload(p)).Free_Move).toBe(1);
  });

  it('Winters Hollow costs everyone a move except a Snowman', async () => {
    const { game, layer } = await board('Winters Hollow');
    const normal = await seedPlayer(game.Game_ID, { discordId: '1', x: 2, y: 2, layerId: layer.Layer_ID, Free_Move: 0 });
    const snowman = await seedPlayer(game.Game_ID, {
      discordId: '2', x: 4, y: 4, layerId: layer.Layer_ID, className: 'Snowman', Free_Move: 0,
    });

    await utils.distributeAP(game, 1, CLIENT);

    expect((await reload(normal)).Free_Move).toBe(-1);
    expect((await reload(snowman)).Free_Move).toBe(0);
  });

  it('Scorchers Joy burns players on blank tiles but spares Lava Divers', async () => {
    // the original exemption was `id != lavaDiver || id != pyro`, true for
    // every id, so nobody was ever spared
    const { game, layer } = await board('Scorchers Joy');
    const normal = await seedPlayer(game.Game_ID, {
      discordId: '1', x: 2, y: 2, layerId: layer.Layer_ID, Health_Points: 10,
    });
    const diver = await seedPlayer(game.Game_ID, {
      discordId: '2', x: 4, y: 4, layerId: layer.Layer_ID, className: 'Lava Diver', Health_Points: 10,
    });

    await utils.distributeAP(game, 1, CLIENT);

    expect((await reload(normal)).Health_Points).toBe(9);
    expect((await reload(diver)).Health_Points).toBe(10);
  });

  it('Scorchers Joy can kill, and the victim leaves the board', async () => {
    const { game, layer } = await board('Scorchers Joy');
    const doomed = await seedPlayer(game.Game_ID, {
      discordId: '1', x: 2, y: 2, layerId: layer.Layer_ID, Health_Points: 1,
    });

    await utils.distributeAP(game, 1, CLIENT);

    const dead = await reload(doomed);
    expect(dead.Dead).toBeTruthy();
    expect(dead.Tile_ID).toBeNull();
    await assertBoardConsistent(game.Game_ID);
  });

  it('Medkit Airdrop heals 1, or 2 for a Doctor, capped with the overflow banked', async () => {
    const { game, layer } = await board('Medkit Airdrop');
    const hurt = await seedPlayer(game.Game_ID, {
      discordId: '1', x: 2, y: 2, layerId: layer.Layer_ID, Health_Points: 5, MAX_HP: 10,
    });
    const doctor = await seedPlayer(game.Game_ID, {
      discordId: '2', x: 4, y: 4, layerId: layer.Layer_ID, className: 'Doctor', Health_Points: 5, MAX_HP: 10,
    });
    const full = await seedPlayer(game.Game_ID, {
      discordId: '3', x: 6, y: 6, layerId: layer.Layer_ID, Health_Points: 10, MAX_HP: 10, MISSED_HP: 0,
    });

    await utils.distributeAP(game, 1, CLIENT);

    expect((await reload(hurt)).Health_Points).toBe(6);
    expect((await reload(doctor)).Health_Points).toBe(7);
    const capped = await reload(full);
    expect(capped.Health_Points).toBe(10);
    expect(capped.MISSED_HP).toBe(1);
  });

  it('Time Acceleration! pays the distribution three times over', async () => {
    const { game, layer } = await board('Time Acceleration!');
    const p = await seedPlayer(game.Game_ID, {
      discordId: '1', x: 2, y: 2, layerId: layer.Layer_ID, Action_Points: 0, MAX_AP: 100,
    });

    await utils.distributeAP(game, 1, CLIENT);

    expect((await reload(p)).Action_Points).toBe(6); // APAmount 2 x 3
  });

  it('a Southern Gust blows a player two tiles and keeps the board consistent', async () => {
    const { game, layer } = await board('Southern Gust');
    const p = await seedPlayer(game.Game_ID, { discordId: '1', x: 3, y: 3, layerId: layer.Layer_ID });
    const startTile = p.Tile_ID;

    await utils.distributeAP(game, 1, CLIENT);

    const moved = await tileOf(p);
    expect([moved.X_Position, moved.Y_Position]).toEqual([3, 5]);
    expect(moved.Tile_ID).not.toBe(startTile);
    await assertBoardConsistent(game.Game_ID);
  });

  it('a gust does not blow anyone off the edge of the layer', async () => {
    const { game, layer } = await board('Southern Gust');
    const p = await seedPlayer(game.Game_ID, { discordId: '1', x: 3, y: 7, layerId: layer.Layer_ID });
    const startTile = p.Tile_ID;

    await utils.distributeAP(game, 1, CLIENT);

    expect((await reload(p)).Tile_ID).toBe(startTile);
    await assertBoardConsistent(game.Game_ID);
  });

  it('a gust will not drop a player onto a wall, but a Cloudborn rides it', async () => {
    const { game, layer } = await board('Eastern Gust');
    const walled = await models.Tiles.findOne({
      where: { Layer_ID: layer.Layer_ID, X_Position: 4, Y_Position: 2 },
    });
    await walled.update({ Tile_Type: 'Wall' });
    // (2,2) + 2 east = (4,2), the wall. The half step lands on (3,2).
    const normal = await seedPlayer(game.Game_ID, { discordId: '1', x: 2, y: 2, layerId: layer.Layer_ID });
    const cloud = await seedPlayer(game.Game_ID, {
      discordId: '2', x: 2, y: 5, layerId: layer.Layer_ID, className: 'Cloudborn',
    });
    const walled2 = await models.Tiles.findOne({
      where: { Layer_ID: layer.Layer_ID, X_Position: 4, Y_Position: 5 },
    });
    await walled2.update({ Tile_Type: 'Wall' });

    await utils.distributeAP(game, 1, CLIENT);

    expect([(await tileOf(normal)).X_Position, (await tileOf(normal)).Y_Position]).toEqual([3, 2]);
    expect([(await tileOf(cloud)).X_Position, (await tileOf(cloud)).Y_Position]).toEqual([4, 5]);
    await assertBoardConsistent(game.Game_ID);
  });

  it('BOOOORRRINNNG does nothing beyond the ordinary grant', async () => {
    const { game, layer } = await board('BOOOORRRINNNG');
    const p = await seedPlayer(game.Game_ID, {
      discordId: '1', x: 2, y: 2, layerId: layer.Layer_ID, Action_Points: 0, Free_Move: 0, Health_Points: 10,
    });
    const startTile = p.Tile_ID;

    await utils.distributeAP(game, 1, CLIENT);

    const after = await reload(p);
    expect(after.Action_Points).toBe(2);
    expect(after.Free_Move).toBe(0);
    expect(after.Health_Points).toBe(10);
    expect(after.Tile_ID).toBe(startTile);
  });
});
