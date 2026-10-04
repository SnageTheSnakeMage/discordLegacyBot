/**
 * Chaos events at AP distribution, against the real schema.
 *
 * The third of the mandated integration areas. These belong here rather
 * than in unit tests because they depend on *column names* and real query
 * shapes - Free_Move, X_Position/Y_Position, Tiles having no Game_ID
 * column - and a mock accepts a wrong one happily.
 */
const { freshDb, closeDb, models, utils } = require('./helpers/testDb.js');
const {
  seedGame, seedLayer, seedPlayer, seedClass, assertBoardConsistent,
  populateGame,
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
    await populateGame(game, layer);
    return { game, layer };
  }
  const reload = (p) => models.Players.findByPk(p.Player_ID);
  const tileOf = async (p) => models.Tiles.findByPk((await reload(p)).Tile_ID);

  it('Free Movement grants a free move, into Free_Move', async () => {
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
    // (2,2) + 2 east runs into the wall at (4,2), so the gust stops on (3,2)
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

  // A full tile stops a gust like a wall does. A "tile is full" thrown from
  // claimTileSlot would escape chaosGust and distributeAP, so every later
  // player would get no AP, the doomsday and the timestop would not tick, and
  // game.save() would not run.
  it('a gust stops on the tile before a full one', async () => {
    const { game, layer } = await board('Eastern Gust');
    // (7,y) is the east edge: these four cannot be gusted anywhere themselves,
    // so the tile stays full for the player arriving behind them
    for (let i = 0; i < 4; i++) {
      await seedPlayer(game.Game_ID, { discordId: `full${i}`, x: 7, y: 2, layerId: layer.Layer_ID });
    }
    const blown = await seedPlayer(game.Game_ID, {
      discordId: '1', x: 5, y: 2, layerId: layer.Layer_ID, Action_Points: 0,
    });

    await utils.distributeAP(game, 1, CLIENT);

    // (5,2) + 2 east runs into the full tile at (7,2), so they stop on (6,2)
    expect([(await tileOf(blown)).X_Position, (await tileOf(blown)).Y_Position]).toEqual([6, 2]);
    await assertBoardConsistent(game.Game_ID);
  });

  it('a gust with nowhere to put a player leaves them, and pays everyone', async () => {
    const { game, layer } = await board('Eastern Gust');
    for (let i = 0; i < 4; i++) {
      await seedPlayer(game.Game_ID, { discordId: `far${i}`, x: 7, y: 2, layerId: layer.Layer_ID });
    }
    for (let i = 0; i < 4; i++) {
      await seedPlayer(game.Game_ID, { discordId: `near${i}`, x: 6, y: 2, layerId: layer.Layer_ID });
    }
    const stuck = await seedPlayer(game.Game_ID, {
      discordId: '1', x: 5, y: 2, layerId: layer.Layer_ID, Action_Points: 0,
    });
    // seeded last, so it is only paid if the distribution survives the gust
    const behind = await seedPlayer(game.Game_ID, {
      discordId: '2', x: 1, y: 6, layerId: layer.Layer_ID, Action_Points: 0,
    });

    await utils.distributeAP(game, 1, CLIENT);

    expect([(await tileOf(stuck)).X_Position, (await tileOf(stuck)).Y_Position]).toEqual([5, 2]);
    expect((await reload(stuck)).Action_Points).toBe(2);
    expect((await reload(behind)).Action_Points).toBe(2);
    expect((await models.Games.findByPk(game.Game_ID)).immutableDoomsday).toBe(31);
    await assertBoardConsistent(game.Game_ID);
  });

  // a gust walks, so whatever stops it on the first tile stops it there: it
  // does not hop over a wall to the clear tile behind
  it('a gust never carries anyone through a wall, or a non-Cloudborn onto ice', async () => {
    const { game, layer } = await board('Eastern Gust');
    const setType = (x, y, Tile_Type) => models.Tiles.update(
      { Tile_Type }, { where: { Layer_ID: layer.Layer_ID, X_Position: x, Y_Position: y } },
    );
    await setType(3, 2, 'Wall');
    await setType(3, 4, 'Ice');
    const walled = await seedPlayer(game.Game_ID, { discordId: '1', x: 2, y: 2, layerId: layer.Layer_ID });
    const iced = await seedPlayer(game.Game_ID, { discordId: '2', x: 2, y: 4, layerId: layer.Layer_ID });
    const cloud = await seedPlayer(game.Game_ID, { discordId: '3', x: 2, y: 4, layerId: layer.Layer_ID, className: 'Cloudborn' });

    await utils.distributeAP(game, 1, CLIENT);

    expect([(await tileOf(walled)).X_Position, (await tileOf(walled)).Y_Position]).toEqual([2, 2]);
    expect([(await tileOf(iced)).X_Position, (await tileOf(iced)).Y_Position]).toEqual([2, 4]);
    expect([(await tileOf(cloud)).X_Position, (await tileOf(cloud)).Y_Position]).toEqual([4, 4]);
    await assertBoardConsistent(game.Game_ID);
  });

  // every tile the gust carries someone across does what it does to a walker
  it('a gust burns a player twice crossing fire, and sets off a mine on its way', async () => {
    const { game, layer } = await board('Eastern Gust', { fireDmg: 1, mineDmg: 2 });
    await models.Tiles.update({ Tile_Type: 'Fire' }, { where: { Layer_ID: layer.Layer_ID, X_Position: 3, Y_Position: 2 } });
    const trapper = await seedPlayer(game.Game_ID, { discordId: '9', x: 1, y: 6, layerId: layer.Layer_ID });
    await models.Tiles.update(
      { trapped: true, trapper: trapper.Player_ID },
      { where: { Layer_ID: layer.Layer_ID, X_Position: 3, Y_Position: 4 } },
    );
    const burnt = await seedPlayer(game.Game_ID, { discordId: '1', x: 2, y: 2, layerId: layer.Layer_ID, Health_Points: 10 });
    const mined = await seedPlayer(game.Game_ID, { discordId: '2', x: 2, y: 4, layerId: layer.Layer_ID, Health_Points: 10 });

    await utils.distributeAP(game, 1, CLIENT);

    // onto the fire and off it again: 1 + 1
    expect((await reload(burnt)).Health_Points).toBe(8);
    expect([(await tileOf(burnt)).X_Position, (await tileOf(burnt)).Y_Position]).toEqual([4, 2]);
    expect((await reload(mined)).Health_Points).toBe(8);
    expect([(await tileOf(mined)).X_Position, (await tileOf(mined)).Y_Position]).toEqual([4, 4]);
    const mine = await models.Tiles.findOne({ where: { Layer_ID: layer.Layer_ID, X_Position: 3, Y_Position: 4 } });
    expect(mine.trapped).toBeFalsy();
    await assertBoardConsistent(game.Game_ID);
  });

  // a storm takes over from the gust: it throws the player one tile on and the
  // gust ends there, rather than carrying on to its second tile
  it('a gust that reaches a storm ends wherever the storm throws the player', async () => {
    const { game, layer } = await board('Eastern Gust');
    await models.Tiles.update({ Tile_Type: 'Storm' }, { where: { Layer_ID: layer.Layer_ID, X_Position: 3, Y_Position: 3 } });
    // the gust's own second tile is a wall, so the storm is the only thing
    // that can move the player off (3,3)
    await models.Tiles.update({ Tile_Type: 'Wall' }, { where: { Layer_ID: layer.Layer_ID, X_Position: 4, Y_Position: 3 } });
    const p = await seedPlayer(game.Game_ID, { discordId: '1', x: 2, y: 3, layerId: layer.Layer_ID });

    await utils.distributeAP(game, 1, CLIENT);

    const landed = await tileOf(p);
    // one tile off the storm, in whichever direction it rolled
    expect(Math.max(Math.abs(landed.X_Position - 3), Math.abs(landed.Y_Position - 3))).toBe(1);
    expect(landed.Tile_Type).not.toBe('Wall');
    await assertBoardConsistent(game.Game_ID);
  });

  it("blows both of a Twin's bodies", async () => {
    const { game, layer } = await board('Eastern Gust');
    const twin = await seedPlayer(game.Game_ID, {
      discordId: '1', x: 1, y: 2, layerId: layer.Layer_ID, className: 'Twin',
      Health_Points2: 5, secondBody: { x: 1, y: 4 },
    });

    await utils.distributeAP(game, 1, CLIENT);

    const after = await reload(twin);
    const body1 = await models.Tiles.findByPk(after.Tile_ID);
    const body2 = await models.Tiles.findByPk(after.Tile_ID2);
    expect([body1.X_Position, body1.Y_Position]).toEqual([3, 2]);
    expect([body2.X_Position, body2.Y_Position]).toEqual([3, 4]);
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
