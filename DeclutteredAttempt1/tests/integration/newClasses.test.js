/**
 * The three classes that existed only on the sheet: Speedster, Bully and
 * Punisher. Against the real schema, because their abilities are all
 * column writes - Free_Move, MISSED_AP/MISSED_HP, and the position
 * invariant - and a mock would accept any of those by any name.
 */
const { freshDb, closeDb, models, utils } = require('./helpers/testDb.js');
const {
  seedGame, seedLayer, seedPlayer, seedClass, assertBoardConsistent,
} = require('./helpers/seed.js');
const shoveLogic = require('../../commands/Class Commands/shove.logic.js');
const punishLogic = require('../../commands/Class Commands/punish.logic.js');

const CLIENT = { channels: { fetch: async () => null } };
const DEPS = () => ({ models, utils, now: () => 1700000000000, random: () => 0 });

describe('new classes', () => {
  beforeEach(freshDb);
  afterAll(closeDb);

  const reload = (p) => models.Players.findByPk(p.Player_ID);
  const tileOf = async (p) => models.Tiles.findByPk((await reload(p)).Tile_ID);

  it('a Speedster gets exactly 2 free moves, and cannot bank them', async () => {
    // "use it or lose it": SET each distribution, not incremented
    await seedClass('Speedster');
    const game = await seedGame({ CURR_CC_EVENT: 'BOOOORRRINNNG', APAmount: 2 });
    const layer = await seedLayer(game.Game_ID, { width: 5, height: 5 });
    const speedster = await seedPlayer(game.Game_ID, {
      discordId: '1', x: 2, y: 2, layerId: layer.Layer_ID, className: 'Speedster', Free_Move: 0,
    });

    await utils.distributeAP(game, 1, CLIENT);
    expect((await reload(speedster)).Free_Move).toBe(2);

    await utils.distributeAP(game, 1, CLIENT);
    expect((await reload(speedster)).Free_Move).toBe(2);
  });

  it('a Bully shoves the victim back a tile, keeping the board consistent', async () => {
    await seedClass('Bully');
    const game = await seedGame();
    const layer = await seedLayer(game.Game_ID, { width: 6, height: 6 });
    const bully = await seedPlayer(game.Game_ID, {
      discordId: '1', x: 2, y: 2, layerId: layer.Layer_ID, className: 'Bully', Action_Points: 5,
    });
    const victim = await seedPlayer(game.Game_ID, { discordId: '2', x: 3, y: 2, layerId: layer.Layer_ID });
    const victimStart = victim.Tile_ID;

    const result = await shoveLogic.run({
      gameId: game.Game_ID, targetDiscordId: '2', targetUsername: 'v',
      direction: 'back', discordId: '1', username: 'b',
    }, DEPS());

    expect(result.ok).toBe(true);
    const moved = await tileOf(victim);
    expect([moved.X_Position, moved.Y_Position]).toEqual([4, 2]);
    // the tile they left no longer names them
    const left = await models.Tiles.findByPk(victimStart);
    expect([left.Player1, left.Player2, left.Player3, left.Player4]).not.toContain(victim.Player_ID);
    expect((await reload(bully)).Action_Points).toBe(4);
    await assertBoardConsistent(game.Game_ID);
  });

  it('a Punisher deals the target their wasted AP and HP', async () => {
    await seedClass('Punisher');
    const game = await seedGame();
    const layer = await seedLayer(game.Game_ID, { width: 6, height: 6 });
    const punisher = await seedPlayer(game.Game_ID, {
      discordId: '1', x: 1, y: 1, layerId: layer.Layer_ID, className: 'Punisher', Action_Points: 8, Range_: 5,
    });
    const wasteful = await seedPlayer(game.Game_ID, {
      discordId: '2', x: 3, y: 1, layerId: layer.Layer_ID, Health_Points: 10, MISSED_AP: 3, MISSED_HP: 2,
    });

    const result = await punishLogic.run({
      gameId: game.Game_ID, x: 3, y: 1, targetDiscordId: '2', targetUsername: 'w', discordId: '1',
    }, DEPS());

    expect(result.ok).toBe(true);
    expect(result.data.damage).toBe(5);
    expect((await reload(wasteful)).Health_Points).toBe(5);
    expect((await reload(punisher)).Action_Points).toBe(4);
    await assertBoardConsistent(game.Game_ID);
  });

  it('a Punisher hits a target who has wasted nothing for nothing', async () => {
    await seedClass('Punisher');
    const game = await seedGame();
    const layer = await seedLayer(game.Game_ID, { width: 6, height: 6 });
    await seedPlayer(game.Game_ID, {
      discordId: '1', x: 1, y: 1, layerId: layer.Layer_ID, className: 'Punisher', Action_Points: 8, Range_: 5,
    });
    const tidy = await seedPlayer(game.Game_ID, {
      discordId: '2', x: 3, y: 1, layerId: layer.Layer_ID, Health_Points: 10, MISSED_AP: 0, MISSED_HP: 0,
    });

    const result = await punishLogic.run({
      gameId: game.Game_ID, x: 3, y: 1, targetDiscordId: '2', targetUsername: 't', discordId: '1',
    }, DEPS());

    expect(result.ok).toBe(true);
    expect(result.data.damage).toBe(0);
    expect((await reload(tidy)).Health_Points).toBe(10);
  });

  it('all three are seeded and rollable', async () => {
    const game = await seedGame();
    await seedLayer(game.Game_ID);
    for (const name of ['Speedster', 'Bully', 'Punisher']) {
      await seedClass(name);
      expect(await models.Classes.findOne({ where: { Class_Name: name } })).not.toBeNull();
    }
  });
});
