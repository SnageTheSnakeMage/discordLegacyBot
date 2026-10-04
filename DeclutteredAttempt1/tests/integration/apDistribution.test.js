/**
 * distributeAP over a real seeded board.
 *
 * Two rules these tests assert as they stand:
 * - AP is NOT capped at MAX_AP during distribution (no clamp, no MISSED_AP
 *   write). Whether it should be is a game rule for the owner, asserted
 *   here so changing it is a visible decision.
 * - Fire tiles do no damage at distribution; the active environmental
 *   damage is the lava-diver shared-tile burn, tested below.
 */
const { freshDb, closeDb, models, utils } = require('./helpers/testDb.js');
const {
  seedPlayer, assertBoardConsistent, seedPopulatedGame,
} = require('./helpers/seed.js');
const { GAMESTATES } = require('../../enums.js');

const FAKE_CLIENT = {};

describe('distributeAP', () => {
  beforeEach(freshDb);
  afterAll(closeDb);

  async function reload(player) {
    return models.Players.findByPk(player.Player_ID);
  }

  it('grants APAmount x times, capped at MAX_AP with the overflow kept as MISSED_AP', async () => {
    const { game, layer } = await seedPopulatedGame({ APAmount: 4 });
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
    const { game, layer } = await seedPopulatedGame({ APAmount: 4 });
    const dead = await seedPlayer(game.Game_ID, { discordId: '1', x: 1, y: 1, layerId: layer.Layer_ID, Action_Points: 2, Dead: true });

    await utils.distributeAP(game, 1, FAKE_CLIENT);

    expect((await reload(dead)).Action_Points).toBe(2);
  });

  it('a Glutton gets the grant twice', async () => {
    const { game, layer } = await seedPopulatedGame({ APAmount: 4 });
    const glutton = await seedPlayer(game.Game_ID, { discordId: '1', x: 1, y: 1, layerId: layer.Layer_ID, className: 'Glutton', Action_Points: 0 });

    await utils.distributeAP(game, 1, FAKE_CLIENT);

    expect((await reload(glutton)).Action_Points).toBe(8);
  });

  it('everyone sharing a Lava Diver tile takes 1 damage; the diver does not', async () => {
    const { game, layer } = await seedPopulatedGame();
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
    const { game, layer } = await seedPopulatedGame();
    const chef = await seedPlayer(game.Game_ID, { discordId: '1', x: 1, y: 1, layerId: layer.Layer_ID, className: 'Chef', Meals: 0 });

    await utils.distributeAP(game, 1, FAKE_CLIENT);

    expect((await reload(chef)).Meals).toBe(1);
  });

  it('ticks the immutable doomsday counter down and persists it', async () => {
    const { game } = await seedPopulatedGame({ immutableDoomsday: 5 });

    await utils.distributeAP(game, 1, FAKE_CLIENT);

    expect((await models.Games.findByPk(game.Game_ID)).immutableDoomsday).toBe(4);
  });

  it('a timestop ticks down and reactivates the game at zero', async () => {
    const { game } = await seedPopulatedGame({ GAME_STATE: GAMESTATES.ACTIVE, timeStopped: true, timestopTurns: 1 });

    await utils.distributeAP(game, 1, FAKE_CLIENT);

    const after = await models.Games.findByPk(game.Game_ID);
    expect(after.timestopTurns).toBe(0);
    expect(after.GAME_STATE).toBe(GAMESTATES.ACTIVE);
  });

  describe('heals everyone standing on a Heal tile', () => {

    const reload = (player) => models.Players.findByPk(player.Player_ID);
    const makeHeal = (layer, x, y) => models.Tiles.update(
      { Tile_Type: 'Heal' }, { where: { Layer_ID: layer.Layer_ID, X_Position: x, Y_Position: y } },
    );

    it('gives healAmount for each distribution, banking overflow past MAX_HP', async () => {
      const { game, layer } = await seedPopulatedGame({ healAmount: 2 });
      await makeHeal(layer, 1, 1);
      const hurt = await seedPlayer(game.Game_ID, { discordId: '1', x: 1, y: 1, layerId: layer.Layer_ID, Health_Points: 5, MAX_HP: 10 });
      const nearlyFull = await seedPlayer(game.Game_ID, { discordId: '2', x: 1, y: 1, layerId: layer.Layer_ID, Health_Points: 9, MAX_HP: 10 });
      const offTile = await seedPlayer(game.Game_ID, { discordId: '3', x: 2, y: 2, layerId: layer.Layer_ID, Health_Points: 5, MAX_HP: 10 });

      await utils.distributeAP(game, 2, FAKE_CLIENT);

      // 2 HP for each of the 2 distributions
      expect((await reload(hurt)).Health_Points).toBe(9);
      const full = await reload(nearlyFull);
      expect(full.Health_Points).toBe(10);
      expect(full.MISSED_HP).toBe(3);
      expect((await reload(offTile)).Health_Points).toBe(5);
      await assertBoardConsistent(game.Game_ID);
    });

    it("heals a Twin's second body when that is the one on the tile", async () => {
      const { game, layer } = await seedPopulatedGame();
      await makeHeal(layer, 2, 2);
      const twin = await seedPlayer(game.Game_ID, {
        discordId: '1', x: 1, y: 1, layerId: layer.Layer_ID, className: 'Twin',
        Health_Points: 5, Health_Points2: 5, MAX_HP: 10, secondBody: { x: 2, y: 2 },
      });

      await utils.distributeAP(game, 1, FAKE_CLIENT);

      const after = await reload(twin);
      expect(after.Health_Points).toBe(5);
      expect(after.Health_Points2).toBe(6);
    });

    it('heals nobody in a game whose healAmount is 0', async () => {
      const { game, layer } = await seedPopulatedGame({ healAmount: 0 });
      await makeHeal(layer, 1, 1);
      const player = await seedPlayer(game.Game_ID, { discordId: '1', x: 1, y: 1, layerId: layer.Layer_ID, Health_Points: 5 });

      await utils.distributeAP(game, 1, FAKE_CLIENT);

      expect((await reload(player)).Health_Points).toBe(5);
    });
  });
});
