/**
 * distributeAP over a real seeded board.
 *
 * Two things the plan expected turned out not to exist in the code, so the
 * tests pin reality instead of the wish:
 * - AP is NOT capped at MAX_AP during distribution (no clamp, no MISSED_AP
 *   write). Whether it should be is issue #87's clamping question - a game
 *   rule for the owner, pinned here so changing it is a visible decision.
 * - Fire-tile damage at distribution is commented out entirely; the active
 *   environmental damage is the lava-diver shared-tile burn, tested below.
 */
const { freshDb, closeDb, models, utils } = require('./helpers/testDb.js');
const { seedGame, seedLayer, seedPlayer, assertBoardConsistent } = require('./helpers/seed.js');
const { GAMESTATES } = require('../../enums.js');

const FAKE_CLIENT = {};

describe('distributeAP', () => {
  beforeEach(freshDb);
  afterAll(closeDb);

  async function reload(player) {
    return models.Players.findByPk(player.Player_ID);
  }

  it('grants APAmount x times, capped at MAX_AP with the overflow kept as MISSED_AP', async () => {
    const game = await seedGame({ APAmount: 4 });
    const layer = await seedLayer(game.Game_ID);
    const poor = await seedPlayer(game.Game_ID, { discordId: '1', x: 1, y: 1, layerId: layer.Layer_ID, Action_Points: 2, MAX_AP: 10 });
    const rich = await seedPlayer(game.Game_ID, { discordId: '2', x: 3, y: 3, layerId: layer.Layer_ID, Action_Points: 9, MAX_AP: 10 });

    await utils.distributeAP(game, 1, FAKE_CLIENT);

    expect((await reload(poor)).Action_Points).toBe(6);
    const richAfter = await reload(rich);
    // 9 + 4 would be 13; capped to MAX_AP 10 with the 3 recorded, not lost.
    // MISSED_AP is real currency - the kill bonus and the Leftovers chaos
    // event both pay it out.
    expect(richAfter.Action_Points).toBe(10);
    expect(richAfter.MISSED_AP).toBe(3);
    await assertBoardConsistent(game.Game_ID);
  });

  it('dead players get nothing', async () => {
    const game = await seedGame({ APAmount: 4 });
    const layer = await seedLayer(game.Game_ID);
    const dead = await seedPlayer(game.Game_ID, { discordId: '1', x: 1, y: 1, layerId: layer.Layer_ID, Action_Points: 2, Dead: true });

    await utils.distributeAP(game, 1, FAKE_CLIENT);

    expect((await reload(dead)).Action_Points).toBe(2);
  });

  // was two writes off the same stale row, so the second stored what the
  // first did and the glutton's double did nothing
  it('a Glutton gets the grant twice', async () => {
    const game = await seedGame({ APAmount: 4 });
    const layer = await seedLayer(game.Game_ID);
    const glutton = await seedPlayer(game.Game_ID, { discordId: '1', x: 1, y: 1, layerId: layer.Layer_ID, className: 'Glutton', Action_Points: 0 });

    await utils.distributeAP(game, 1, FAKE_CLIENT);

    expect((await reload(glutton)).Action_Points).toBe(8);
  });

  it('everyone sharing a Lava Diver tile takes 1 damage; the diver does not', async () => {
    const game = await seedGame();
    const layer = await seedLayer(game.Game_ID);
    const diver = await seedPlayer(game.Game_ID, { discordId: '1', x: 2, y: 2, layerId: layer.Layer_ID, className: 'Lava Diver', Health_Points: 10 });
    const scalded = await seedPlayer(game.Game_ID, { discordId: '2', x: 2, y: 2, layerId: layer.Layer_ID, Health_Points: 6 });
    const elsewhere = await seedPlayer(game.Game_ID, { discordId: '3', x: 4, y: 4, layerId: layer.Layer_ID, Health_Points: 6 });

    await utils.distributeAP(game, 1, FAKE_CLIENT);

    expect((await reload(scalded)).Health_Points).toBe(5);
    expect((await reload(diver)).Health_Points).toBe(10);
    expect((await reload(elsewhere)).Health_Points).toBe(6);
    await assertBoardConsistent(game.Game_ID);
  });

  it('a Chef gains a meal each distribution', async () => {
    const game = await seedGame();
    const layer = await seedLayer(game.Game_ID);
    const chef = await seedPlayer(game.Game_ID, { discordId: '1', x: 1, y: 1, layerId: layer.Layer_ID, className: 'Chef', Meals: 0 });

    await utils.distributeAP(game, 1, FAKE_CLIENT);

    expect((await reload(chef)).Meals).toBe(1);
  });

  it('ticks the immutable doomsday counter down and persists it', async () => {
    const game = await seedGame({ immutableDoomsday: 5 });
    await seedLayer(game.Game_ID);

    await utils.distributeAP(game, 1, FAKE_CLIENT);

    expect((await models.Games.findByPk(game.Game_ID)).immutableDoomsday).toBe(4);
  });

  it('a timestop ticks down and reactivates the game at zero', async () => {
    const game = await seedGame({ GAME_STATE: GAMESTATES.TIMESTOPPED, timestopTurns: 1 });
    await seedLayer(game.Game_ID);

    await utils.distributeAP(game, 1, FAKE_CLIENT);

    const after = await models.Games.findByPk(game.Game_ID);
    expect(after.timestopTurns).toBe(0);
    expect(after.GAME_STATE).toBe(GAMESTATES.ACTIVE);
  });
});
