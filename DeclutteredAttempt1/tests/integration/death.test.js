/**
 * playerDeathLogic against the real schema.
 *
 * Death is the most special-cased routine in the game - Pharoh revives,
 * Twins with two bodies, Hitman targets, Cannibal and Minesweeper kill
 * bonuses - and every branch writes to columns a mock would accept by any
 * name. These pin the branches against a real database.
 *
 * Until utils.damagePlayer, none of this ran at all: every damage site
 * handed the death check a stale pre-damage row, so nothing ever died.
 */
const { freshDb, closeDb, models, utils } = require('./helpers/testDb.js');
const {
  seedGame, seedLayer, seedPlayer, assertBoardConsistent,
} = require('./helpers/seed.js');

describe('death', () => {
  beforeEach(freshDb);
  afterAll(closeDb);

  async function board() {
    const game = await seedGame();
    const layer = await seedLayer(game.Game_ID, { width: 5, height: 5 });
    return { game, layer };
  }
  const reload = (p) => models.Players.findByPk(p.Player_ID);

  it('a killed player is flagged dead, taken off the board, and credited', async () => {
    const { game, layer } = await board();
    const killer = await seedPlayer(game.Game_ID, { discordId: '1', x: 1, y: 1, layerId: layer.Layer_ID, Kills: 0 });
    const victim = await seedPlayer(game.Game_ID, { discordId: '2', x: 2, y: 1, layerId: layer.Layer_ID, Health_Points: 2 });
    const victimTile = victim.Tile_ID;

    await utils.damagePlayer(killer, victim, 5);

    const dead = await reload(victim);
    expect(dead.Health_Points).toBeLessThanOrEqual(0);
    expect(dead.Dead).toBeTruthy();
    expect(dead.Tile_ID).toBeNull();
    expect((await reload(killer)).Kills).toBe(1);
    const tile = await models.Tiles.findByPk(victimTile);
    expect([tile.Player1, tile.Player2, tile.Player3, tile.Player4]).not.toContain(victim.Player_ID);
    await assertBoardConsistent(game.Game_ID);
  });

  it('a survivable hit kills nobody', async () => {
    const { game, layer } = await board();
    const killer = await seedPlayer(game.Game_ID, { discordId: '1', x: 1, y: 1, layerId: layer.Layer_ID, Kills: 0 });
    const victim = await seedPlayer(game.Game_ID, { discordId: '2', x: 2, y: 1, layerId: layer.Layer_ID, Health_Points: 10 });

    await utils.damagePlayer(killer, victim, 3);

    const hurt = await reload(victim);
    expect(hurt.Health_Points).toBe(7);
    expect(hurt.Dead).toBeFalsy();
    expect(hurt.Tile_ID).not.toBeNull();
    expect((await reload(killer)).Kills).toBe(0);
    await assertBoardConsistent(game.Game_ID);
  });

  it('a Pharoh with revive HP comes back instead of dying', async () => {
    const { game, layer } = await board();
    const killer = await seedPlayer(game.Game_ID, { discordId: '1', x: 1, y: 1, layerId: layer.Layer_ID, Kills: 0 });
    const pharoh = await seedPlayer(game.Game_ID, {
      discordId: '2', x: 2, y: 1, layerId: layer.Layer_ID, className: 'Pharoh', Health_Points: 2, Pharoh_HP: 5,
    });
    const fallenTile = pharoh.Tile_ID;
    // The spawnpoint is RANDOM, and on a 5x5 board it lands on the tile the
    // victim fell on about one run in 25 - where "the fallen tile no longer
    // names them" is false for a correct deploy, because they are standing on
    // it again. Pinning the destination makes the move assertable at all.
    const spawn = await models.Tiles.findOne({
      where: { Layer_ID: layer.Layer_ID, X_Position: 5, Y_Position: 5 },
    });
    jest.spyOn(utils, 'getSpawnpointTile').mockResolvedValue(spawn);

    await utils.damagePlayer(killer, pharoh, 5);

    const revived = await reload(pharoh);
    expect(revived.Dead).toBeFalsy();
    expect(revived.Health_Points).toBe(5); // revived at the overflow HP
    expect(revived.Pharoh_HP).toBe(0); // which is spent
    expect(revived.Tile_ID).toBe(spawn.Tile_ID); // placed on the spawn tile
    // it still counts as a kill
    expect((await reload(killer)).Kills).toBe(1);
    // and the move is written on both sides: the tile they fell on no longer
    // names them, the tile they stand on does
    const fallen = await models.Tiles.findByPk(fallenTile);
    expect([fallen.Player1, fallen.Player2, fallen.Player3, fallen.Player4]).not.toContain(pharoh.Player_ID);
    const landed = await models.Tiles.findByPk(spawn.Tile_ID);
    expect([landed.Player1, landed.Player2, landed.Player3, landed.Player4]).toContain(pharoh.Player_ID);
    await assertBoardConsistent(game.Game_ID);
  });

  // fire tiles and mines damage with no attacker. The revive branch credited
  // the kill before checking, so killer.Kills threw for any victim holding
  // revive HP - the one combination that never came up in the other suites.
  it('the environment can revive a Pharoh with no killer to credit', async () => {
    const { game, layer } = await board();
    const pharoh = await seedPlayer(game.Game_ID, {
      discordId: '1', x: 1, y: 1, layerId: layer.Layer_ID, className: 'Pharoh', Health_Points: 1, Pharoh_HP: 4,
    });

    await utils.damagePlayer(null, pharoh, 5);

    const revived = await reload(pharoh);
    expect(revived.Dead).toBeFalsy();
    expect(revived.Health_Points).toBe(4);
    expect(revived.Pharoh_HP).toBe(0);
    expect(revived.Tile_ID).not.toBeNull();
    await assertBoardConsistent(game.Game_ID);
  });

  it('a Twin survives losing one body and dies when both are gone', async () => {
    const { game, layer } = await board();
    const killer = await seedPlayer(game.Game_ID, { discordId: '1', x: 1, y: 1, layerId: layer.Layer_ID, Kills: 0 });
    const twin = await seedPlayer(game.Game_ID, {
      discordId: '2', x: 2, y: 1, layerId: layer.Layer_ID, className: 'Twin',
      Health_Points: 3, Health_Points2: 3,
      // a real Twin stands on two tiles; without the second one this fixture
      // describes a player who has already lost a body
      secondBody: { x: 4, y: 4 },
    });
    const secondBodyTile = twin.Tile_ID2;
    expect(secondBodyTile).not.toBeNull();

    // first body down: still alive, because the second one is standing
    await utils.damagePlayer(killer, twin, 5, 1);
    const oneBodied = await reload(twin);
    expect(oneBodied.Dead).toBeFalsy();

    // and the survivor has moved INTO body 1, leaving body 2 nulled, so a
    // one-bodied Twin always looks the same way round whichever body it lost
    expect(oneBodied.Tile_ID).toBe(secondBodyTile);
    expect(oneBodied.Health_Points).toBe(3);
    expect(oneBodied.Tile_ID2).toBeNull();
    expect(oneBodied.Health_Points2).toBe(0);
    // the board still agrees with the player rows after the consolidation
    await assertBoardConsistent(game.Game_ID);

    // the last body down too. It is body 1 now, which is also the body a real
    // caller would pick: shoot and snipe choose the body by which tile the
    // target is standing on, and the survivor's tile is in Tile_ID.
    await utils.damagePlayer(killer, oneBodied, 5, 1);
    const dead = await reload(twin);
    expect(dead.Dead).toBeTruthy();
    expect(dead.Tile_ID).toBeNull();
    await assertBoardConsistent(game.Game_ID);
  });

  it('the environment can kill with no killer to credit', async () => {
    const { game, layer } = await board();
    const victim = await seedPlayer(game.Game_ID, { discordId: '1', x: 1, y: 1, layerId: layer.Layer_ID, Health_Points: 1 });

    await utils.damagePlayer(null, victim, 5);

    const dead = await reload(victim);
    expect(dead.Dead).toBeTruthy();
    expect(dead.Tile_ID).toBeNull();
    await assertBoardConsistent(game.Game_ID);
  });
});
