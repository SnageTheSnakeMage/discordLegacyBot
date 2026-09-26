/**
 * utils.apCheckTick and utils.startAPCheckInterval - the 30 second AP check,
 * against a real seeded game.
 *
 * Two things are pinned here that calling distributeAP directly cannot reach:
 * a pass pays a game exactly as many intervals as it is behind and no more,
 * and a pass reads the gamestate freshly enough to see a pause that landed
 * after the interval started.
 *
 * The tick is exercised directly rather than through fake timers, since both
 * are about what one pass reads and writes rather than when it fires. The
 * scheduling has one test of its own at the bottom, with a spy.
 */
const { freshDb, closeDb, models, utils } = require('./helpers/testDb.js');
const { seedPlayer, seedPopulatedGame } = require('./helpers/seed.js');
const { GAMESTATES } = require('../../enums.js');

const MINUTE = 60000;
const FAKE_CLIENT = {};

/** A game one AP interval behind, with one player of our own to watch. */
async function seedBehind(overrides = {}) {
  const { game, layer } = await seedPopulatedGame({
    AP_INTERVAL_MIN: 60,
    APAmount: 4,
    lastAPDistributionTimestampInMS: Date.now() - 61 * MINUTE,
    ...overrides,
  });
  const player = await seedPlayer(game.Game_ID, {
    discordId: '1', x: 1, y: 1, layerId: layer.Layer_ID, Action_Points: 0, MAX_AP: 1000,
  });
  return { game, layer, player };
}

const apOf = async (player) => (await models.Players.findByPk(player.Player_ID)).Action_Points;

/**
 * A dead player, in the shape the writers actually write: no tile, no slot
 * claimed on one, Dead true. The council only opens a poll when a game has
 * someone dead to vote in it.
 */
async function seedDead(game, layer) {
  const player = await seedPlayer(game.Game_ID, {
        // a low coordinate: populateGame fills the FAR corner
    discordId: '2', x: 1, y: 2, layerId: layer.Layer_ID,
  });
  await utils.clearPlayerFromBoard(player.Player_ID, player.Tile_ID, 'Tile_ID');
  await models.Players.update({ Dead: true }, { where: { Player_ID: player.Player_ID } });
  return player;
}

beforeEach(freshDb);
afterAll(closeDb);
afterEach(() => {
  jest.useRealTimers();
});

describe('apCheckTick', () => {

  it('pays one interval once, and the next pass pays nothing', async () => {
    const { game, player } = await seedBehind();

    await utils.apCheckTick(game.Game_ID, FAKE_CLIENT);
    expect(await apOf(player)).toBe(4);

    // a second pass with nothing further owed
    await utils.apCheckTick(game.Game_ID, FAKE_CLIENT);
    expect(await apOf(player)).toBe(4);
  });

  it('does not pay a game that is not yet due', async () => {
    const { game, player } = await seedBehind({
      lastAPDistributionTimestampInMS: Date.now() - 5 * MINUTE,
    });
    await utils.apCheckTick(game.Game_ID, FAKE_CLIENT);
    expect(await apOf(player)).toBe(0);
  });

  it('pays catch-up for a game several intervals behind, then stops', async () => {
    const { game, player } = await seedBehind({
      lastAPDistributionTimestampInMS: Date.now() - (3 * 60 + 1) * MINUTE,
    });
    await utils.apCheckTick(game.Game_ID, FAKE_CLIENT);
    expect(await apOf(player)).toBe(12);
    await utils.apCheckTick(game.Game_ID, FAKE_CLIENT);
    expect(await apOf(player)).toBe(12);
  });

  // the state is read fresh every pass, so a pause that lands after the
  // interval started is seen by the next one
  it.each([GAMESTATES.DEV_PAUSED, GAMESTATES.INACTIVE, GAMESTATES.OVER, GAMESTATES.REGISTRATION])(
    'pays nothing while the game is %s',
    async (state) => {
      const { game, player } = await seedBehind();
      await models.Games.update({ GAME_STATE: state }, { where: { Game_ID: game.Game_ID } });

      await utils.apCheckTick(game.Game_ID, FAKE_CLIENT);

      expect(await apOf(player)).toBe(0);
      // and the timestamp is untouched, so the pause does not eat the AP the
      // game is owed once it resumes
      expect((await models.Games.findByPk(game.Game_ID)).lastAPDistributionTimestampInMS)
        .toBe(game.lastAPDistributionTimestampInMS);
    },
  );

  it.each([GAMESTATES.ACTIVE, GAMESTATES.FINALE, GAMESTATES.TIMESTOPPED])(
    'pays a game that is %s',
    async (state) => {
      const { game, player } = await seedBehind();
      await models.Games.update(
        // a timestop with turns left, so the state is not a mid-tick no-op
        { GAME_STATE: state, timestopTurns: state === GAMESTATES.TIMESTOPPED ? 3 : 0 },
        { where: { Game_ID: game.Game_ID } },
      );
      await utils.apCheckTick(game.Game_ID, FAKE_CLIENT);
      expect(await apOf(player)).toBeGreaterThan(0);
    },
  );

  it('posts no council poll while the game is paused', async () => {
    const send = jest.fn(async () => ({ id: '999' }));
    const client = { channels: { fetch: jest.fn(async () => ({ send })) } };
    const { game } = await seedBehind({ chaosCouncilBool: true, deadChatChannelId: '123' });
    await models.Games.update(
      { GAME_STATE: GAMESTATES.DEV_PAUSED }, { where: { Game_ID: game.Game_ID } },
    );

    await utils.apCheckTick(game.Game_ID, client);

    expect(send).not.toHaveBeenCalled();
    expect((await models.Games.findByPk(game.Game_ID)).currentChaosPollMsgId).toBeNull();
  });

  // the same call with the game left ACTIVE, so the test above is known to be
  // about the pause rather than about a poll that never posts anyway. The
  // council needs a dead player to vote, which is the other half of
  // distributeAP's condition.
  it('does post a council poll when the game is running', async () => {
    const send = jest.fn(async () => ({ id: '999' }));
    const client = { channels: { fetch: jest.fn(async () => ({ send })) } };
    const { game, layer } = await seedBehind({ chaosCouncilBool: true, deadChatChannelId: '123' });
    await seedDead(game, layer);

    await utils.apCheckTick(game.Game_ID, client);

    expect(send).toHaveBeenCalled();
    expect((await models.Games.findByPk(game.Game_ID)).currentChaosPollMsgId).toBe('999');
  });

  // the row can go while the interval is still live - a game deleted by hand
  // on the host - and the pass reads it, so it has to handle the absence
  it('clears its own interval when the game row is gone, without throwing', async () => {
    const stop = jest.spyOn(utils, 'stopExistingAPCheckInterval');
    await expect(utils.apCheckTick(999999, FAKE_CLIENT)).resolves.toBeUndefined();
    expect(stop).toHaveBeenCalledWith(999999);
  });
});

describe('startAPCheckInterval scheduling', () => {
  it('runs a tick every 30 seconds, and stops when cleared', async () => {
    const { game } = await seedBehind();
    const tick = jest.spyOn(utils, 'apCheckTick').mockResolvedValue(undefined);
    jest.useFakeTimers();

    await utils.startAPCheckInterval(game, FAKE_CLIENT);
    expect(tick).not.toHaveBeenCalled();

    jest.advanceTimersByTime(30000);
    expect(tick).toHaveBeenCalledTimes(1);
    expect(tick).toHaveBeenCalledWith(game.Game_ID, FAKE_CLIENT);

    jest.advanceTimersByTime(60000);
    expect(tick).toHaveBeenCalledTimes(3);

    utils.stopExistingAPCheckInterval(game.Game_ID);
    jest.advanceTimersByTime(120000);
    expect(tick).toHaveBeenCalledTimes(3);
  });

  it('replaces a game interval instead of stacking a second one', async () => {
    const { game } = await seedBehind();
    const tick = jest.spyOn(utils, 'apCheckTick').mockResolvedValue(undefined);
    jest.useFakeTimers();

    await utils.startAPCheckInterval(game, FAKE_CLIENT);
    await utils.startAPCheckInterval(game, FAKE_CLIENT);

    jest.advanceTimersByTime(30000);
    expect(tick).toHaveBeenCalledTimes(1);

    utils.stopExistingAPCheckInterval(game.Game_ID);
  });
});
