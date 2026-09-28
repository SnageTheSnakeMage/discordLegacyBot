/**
 * /gameflags - logic tests. Plain data in, plain data out: no jest.mock, no
 * discord.js, no interaction. deps carries fake models and the real utils, so
 * setGameState runs for real over them.
 */
const logic = require('../../../commands/Developer Commands/gameflags.logic.js');
const gameflags = require('../../../commands/Developer Commands/gameflags.js');
const { GAMESTATES, GAME_FLAGS, REJECTIONS } = require('../../../enums.js');
const { createDeps, createFakeGame, createFakePlayer, expectNoWrites } = require('../../helpers/mockModels.js');
const { everyCase } = require('../../helpers/everyCase.js');

const DEV = { discordId: '123', username: 'snage', isDev: true };
const PLAYER = { discordId: '456', username: 'someone', isDev: false };

/**
 * deps with one game, found both by id and as the oldest game being played,
 * and with the caller registered in it unless a test says otherwise.
 */
function depsFor(game = {}, over = {}) {
  const row = createFakeGame({ Game_ID: 1, ...game });
  return createDeps({
    models: {
      Games: {
        findByPk: async () => row,
        findOne: async () => row,
        ...(over.Games || {}),
      },
      Players: {
        findOne: async () => createFakePlayer({ Player_ID: 1, Game_ID: 1, Discord_ID: PLAYER.discordId }),
        ...(over.Players || {}),
      },
    },
  });
}

const setInput = (over = {}) => logic.parse({ subcommand: 'set', flag: 'timeStopped', value: true, ...over }, DEV);

describe('gameflags parse', () => {
  it('maps the subcommand, flag, value, game and dev flag', () => {
    const input = logic.parse({ subcommand: 'set', flag: 'finale', value: true, game: 3 }, DEV);
    expect(input).toEqual({
      subcommand: 'set', flag: 'finale', value: true, gameId: 3, isDev: true, discordId: '123',
    });
  });

  it('turns absent options into null and a missing dev flag into false', () => {
    expect(logic.parse({}, PLAYER)).toEqual({
      subcommand: null, flag: null, value: null, gameId: null, isDev: false, discordId: '456',
    });
  });

  // false is a real answer, and ?? keeps it; || would have turned "off" into
  // "not asked", which is the same value the command writes by default
  it('keeps an explicit false', () => {
    expect(logic.parse({ subcommand: 'set', flag: 'finale', value: false }, DEV).value).toBe(false);
  });
});

describe('gameflags set', () => {
  it('rejects a non-dev caller and writes nothing', async () => {
    const deps = depsFor();
    const result = await logic.run(logic.parse({ subcommand: 'set', flag: 'finale', value: true }, PLAYER), deps);
    expect(result).toEqual({ ok: false, reason: REJECTIONS.NOT_DEV });
    expectNoWrites(deps);
  });

  it('rejects a flag that is not one of the four', async () => {
    const deps = depsFor();
    const result = await logic.run(setInput({ flag: 'Dead' }), deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.NO_SUCH_FLAG, data: { flag: 'Dead' } });
    expectNoWrites(deps);
  });

  it('rejects a game id that matches no row', async () => {
    const deps = depsFor({}, { Games: { findByPk: async () => null } });
    const result = await logic.run(setInput({ game: 999 }), deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.NO_SUCH_GAME, data: { gameId: 999 } });
  });

  // the three flags the gamestate has no say in are written straight, one
  // column at a time, so setting one never disturbs another
  it('writes <flag> on its own', async () => {
    expect(await everyCase('writes %s on its own', [GAME_FLAGS.timeStopped, GAME_FLAGS.finale, GAME_FLAGS.sandbox], async (flag) => {
        const deps = depsFor({ GAME_STATE: GAMESTATES.ACTIVE });
        const result = await logic.run(setInput({ flag, value: true }), deps);
        expect(result).toMatchObject({ ok: true, kind: 'flagSet', data: { flag, value: true } });
        expect(deps.models.Games.update).toHaveBeenCalledWith({ [flag]: true }, { where: { Game_ID: 1 } });
        expect(deps.models.Games.update).toHaveBeenCalledTimes(1);
      },)).toEqual([]);
  });

  it('turns <flag> off again', async () => {
    expect(await everyCase('turns %s off again', [GAME_FLAGS.timeStopped, GAME_FLAGS.finale, GAME_FLAGS.sandbox], async (flag) => {
        const deps = depsFor({ GAME_STATE: GAMESTATES.ACTIVE, [flag]: true });
        await logic.run(setInput({ flag, value: false }), deps);
        expect(deps.models.Games.update).toHaveBeenCalledWith({ [flag]: false }, { where: { Game_ID: 1 } });
      },)).toEqual([]);
  });

  // the clock goes through utils.setGameState, which keeps it honest against
  // the gamestate and keeps the game's place in its AP interval across a stop:
  // a game 5 minutes from being paid when it stops is 5 minutes from being paid
  // when it starts
  describe('the clock', () => {
    const MINUTE = 60 * 1000;
    const NOW = 1700000000000;
    beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(NOW));
    afterEach(() => jest.restoreAllMocks());

    it('stops, recording how far into its interval the game was', async () => {
      const deps = depsFor({
        GAME_STATE: GAMESTATES.ACTIVE, gameActive: true, AP_INTERVAL_MIN: 60,
        lastAPDistributionTimestampInMS: NOW - 55 * MINUTE,
      });
      await logic.run(setInput({ flag: GAME_FLAGS.gameActive, value: false }), deps);
      expect(deps.models.Games.update).toHaveBeenCalledWith(
        { GAME_STATE: GAMESTATES.ACTIVE, gameActive: false, apElapsedWhenStoppedInMS: 55 * MINUTE },
        { where: { Game_ID: 1 } },
      );
    });

    it('starts again from that same point, however long it was stopped', async () => {
      const deps = depsFor({
        GAME_STATE: GAMESTATES.ACTIVE, gameActive: false, AP_INTERVAL_MIN: 60,
        lastAPDistributionTimestampInMS: NOW - 3 * 60 * MINUTE, apElapsedWhenStoppedInMS: 55 * MINUTE,
      });
      const result = await logic.run(setInput({ flag: GAME_FLAGS.gameActive, value: true }), deps);
      expect(result.ok).toBe(true);
      expect(deps.models.Games.update).toHaveBeenCalledWith(
        {
          GAME_STATE: GAMESTATES.ACTIVE,
          gameActive: true,
          lastAPDistributionTimestampInMS: NOW - 55 * MINUTE,
          apElapsedWhenStoppedInMS: null,
        },
        { where: { Game_ID: 1 } },
      );
    });
  });

  // the invariant, refused out loud rather than silently ignored: setGameState
  // would force it false and the reply would claim the clock was on
  it('refuses to start the clock on a <state> game, and writes nothing', async () => {
    expect(await everyCase('refuses to start the clock on a %s game, and writes nothing', [GAMESTATES.REGISTRATION, GAMESTATES.OVER], async (state) => {
        const deps = depsFor({ GAME_STATE: state, gameActive: false });
        const result = await logic.run(setInput({ flag: GAME_FLAGS.gameActive, value: true }), deps);
        expect(result).toMatchObject({
          ok: false,
          reason: REJECTIONS.CLOCK_NOT_ALLOWED,
          data: { gameId: 1, gamestate: state },
        });
        expect(deps.models.Games.update).not.toHaveBeenCalled();
      },)).toEqual([]);
  });

  // stopping it is always allowed: there is nothing to keep honest about a
  // clock that is not running
  it('allows stopping the clock on a <state> game', async () => {
    expect(await everyCase('allows stopping the clock on a %s game', [GAMESTATES.REGISTRATION, GAMESTATES.OVER], async (state) => {
        const deps = depsFor({ GAME_STATE: state, gameActive: false });
        expect((await logic.run(setInput({ flag: GAME_FLAGS.gameActive, value: false }), deps)).ok).toBe(true);
      },)).toEqual([]);
  });
});

describe('gameflags set - resolving the game', () => {
  // which game that is, is utils.getOldestActiveGameId's job and is tested
  // against a real schema; here it only has to be asked, over deps.models
  it('defaults to the oldest game being played', async () => {
    const findOne = jest.fn(async () => createFakeGame({ Game_ID: 3, GAME_STATE: GAMESTATES.ACTIVE }));
    const deps = createDeps({ models: { Games: { findOne, findByPk: async (id) => createFakeGame({ Game_ID: id }) } } });
    const result = await logic.run(setInput({ game: null }), deps);
    expect(result.data.gameId).toBe(3);
    expect(findOne).toHaveBeenCalledWith({ where: { GAME_STATE: GAMESTATES.ACTIVE }, order: [['Game_ID', 'ASC']] });
  });

  it('rejects when no game is being played', async () => {
    const deps = createDeps({ models: { Games: { findOne: async () => null } } });
    const result = await logic.run(setInput({ game: null }), deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.NO_SUCH_GAME });
    expect(result.data.message).toMatch(/No game is being played/);
    expect(deps.models.Games.update).not.toHaveBeenCalled();
  });
});

describe('gameflags sandbox', () => {
  const sandboxInput = (over = {}) => logic.parse(
    { subcommand: 'sandbox', flag: 'timeStopped', value: true, ...over }, PLAYER,
  );

  it('lets a player in a sandbox game set a flag on it', async () => {
    const deps = depsFor({ GAME_STATE: GAMESTATES.ACTIVE, sandbox: true });
    const result = await logic.run(sandboxInput(), deps);
    expect(result).toMatchObject({ ok: true, kind: 'flagSet', data: { flag: 'timeStopped', value: true } });
    expect(deps.models.Games.update).toHaveBeenCalledWith({ timeStopped: true }, { where: { Game_ID: 1 } });
  });

  it('refuses a game that does not have the sandbox flag', async () => {
    const deps = depsFor({ GAME_STATE: GAMESTATES.ACTIVE, sandbox: false });
    const result = await logic.run(sandboxInput(), deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.NOT_SANDBOX, data: { gameId: 1 } });
    expect(deps.models.Games.update).not.toHaveBeenCalled();
  });

  it('refuses a caller who is not registered in it', async () => {
    const deps = depsFor({ sandbox: true }, { Players: { findOne: async () => null } });
    const result = await logic.run(sandboxInput(), deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.NOT_IN_GAME });
    expect(deps.models.Games.update).not.toHaveBeenCalled();
  });

  // turning `sandbox` off would hand a player a live game; turning it on
  // elsewhere would make one out of somebody else's
  it('cannot set the sandbox flag itself', async () => {
    const deps = depsFor({ sandbox: true });
    const result = await logic.run(sandboxInput({ flag: GAME_FLAGS.sandbox, value: false }), deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.NO_SUCH_FLAG, data: { flag: 'sandbox' } });
    expect(deps.models.Games.update).not.toHaveBeenCalled();
  });

  it('may set <flag>', async () => {
    expect(await everyCase('may set %s', [GAME_FLAGS.gameActive, GAME_FLAGS.timeStopped, GAME_FLAGS.finale], async (flag) => {
        const deps = depsFor({ GAME_STATE: GAMESTATES.ACTIVE, sandbox: true });
        expect((await logic.run(sandboxInput({ flag, value: true }), deps)).ok).toBe(true);
      },)).toEqual([]);
  });

  it('does not need the dev flag', async () => {
    const deps = depsFor({ sandbox: true });
    expect((await logic.run(sandboxInput(), deps)).ok).toBe(true);
  });
});

describe('gameflags show', () => {
  it('reports the state and every flag, and writes nothing', async () => {
    const deps = depsFor({
      GAME_STATE: GAMESTATES.ACTIVE, gameActive: true, timeStopped: false, finale: true, sandbox: false,
    });
    const result = await logic.run(logic.parse({ subcommand: 'show', game: 1 }, PLAYER), deps);
    expect(result).toEqual({
      ok: true,
      kind: 'flagList',
      data: {
        gameId: 1,
        gamestate: GAMESTATES.ACTIVE,
        flags: { gameActive: true, timeStopped: false, finale: true, sandbox: false },
      },
    });
    expectNoWrites(deps);
  });

  // the columns are INTEGER 0/1, and a reply that said "1" would be reporting
  // the storage rather than the answer
  it('reports 0 and 1 as off and on', async () => {
    const deps = depsFor({ gameActive: 1, timeStopped: 0, finale: 1, sandbox: 0 });
    const result = await logic.run(logic.parse({ subcommand: 'show', game: 1 }, PLAYER), deps);
    expect(result.data.flags).toEqual({ gameActive: true, timeStopped: false, finale: true, sandbox: false });
  });
});

describe('gameflags present', () => {
  it('names the flag it set and lists where the game stands', () => {
    const out = logic.present({
      ok: true,
      kind: 'flagSet',
      data: {
        gameId: 2, flag: 'finale', value: true, gamestate: GAMESTATES.ACTIVE,
        flags: { gameActive: true, timeStopped: false, finale: true, sandbox: false },
      },
    });
    expect(out.content).toBe('Game 2: finale is now on.'
      + '\nIt is ACTIVE - gameActive: on, timeStopped: off, finale: on, sandbox: off');
  });

  it('renders a show', () => {
    const out = logic.present({
      ok: true,
      kind: 'flagList',
      data: {
        gameId: 5, gamestate: GAMESTATES.DEV_PAUSED,
        flags: { gameActive: false, timeStopped: false, finale: false, sandbox: true },
      },
    });
    expect(out.content).toBe('Game 5 is DEV_PAUSED - gameActive: off, timeStopped: off, finale: off, sandbox: on');
  });

  it('renders a rejection through the shared message table', () => {
    const out = logic.present({ ok: false, reason: REJECTIONS.NOT_DEV });
    expect(out.content).toBe('Only the dev can use this command.');
  });

  it('renders the clock rejection with the state that caused it', () => {
    const out = logic.present({
      ok: false,
      reason: REJECTIONS.CLOCK_NOT_ALLOWED,
      data: { gameId: 4, gamestate: GAMESTATES.OVER },
    });
    expect(out.content).toBe('The clock only runs on a game that is being played or dev-paused - game 4 is OVER.');
  });
});

describe('gameflags adapter (smoke)', () => {
  it('exports the command contract', () => {
    expect(gameflags.data.toJSON().name).toBe('gameflags');
    expect(typeof gameflags.execute).toBe('function');
  });

  // gameActive decides whether the game has an AP check interval, so a flip
  // has to be reconciled - and run() never sees the client
  it('reconciles the AP intervals after a flag is set', async () => {
    const utils = require('../../../utils.js');
    const timeCheck = jest.spyOn(utils, 'timeCheck').mockResolvedValue(undefined);
    const setGameState = jest.spyOn(utils, 'setGameState').mockResolvedValue({ GAME_STATE: 'ACTIVE', gameActive: true });
    const findByPk = jest.spyOn(utils.models.Games, 'findByPk')
      .mockResolvedValue(createFakeGame({ Game_ID: 1, GAME_STATE: GAMESTATES.ACTIVE }));
    process.env.DEV_ID = 'dev-id';
    const interaction = {
      user: { id: 'dev-id' },
      options: {
        getSubcommand: () => 'set',
        getString: (name) => (name === 'flag' ? 'gameActive' : null),
        getBoolean: () => true,
        getInteger: () => 1,
      },
      deferReply: jest.fn(async () => {}),
      editReply: jest.fn(async () => {}),
      client: {},
    };
    await gameflags.execute(interaction);
    expect(timeCheck).toHaveBeenCalledWith(interaction.client);
    expect(interaction.editReply).toHaveBeenCalled();
    timeCheck.mockRestore();
    setGameState.mockRestore();
    findByPk.mockRestore();
  });
});
