/**
 * /timestop-dev - logic tests. Plain data in, plain data out: no jest.mock,
 * no discord.js, no interaction. deps carries fake models.
 */
const logic = require('../../../commands/Developer Commands/timestop_dev.logic.js');
const timestopDev = require('../../../commands/Developer Commands/timestop_dev.js');
const { GAMESTATES, REJECTIONS } = require('../../../enums.js');
const { createDeps, createFakeGame } = require('../../helpers/mockModels.js');

const DEV_INPUT = { gameId: 1, isDev: true, discordId: '123' };

/** deps whose Games.findByPk returns a game in the given state */
function depsForState(state, over = {}) {
  return createDeps({
    models: {
      Games: { findByPk: async () => createFakeGame({ Game_ID: 1, GAME_STATE: state }) },
      ...(over.models || {}),
    },
    ...(over.utils ? { utils: over.utils } : {}),
  });
}

describe('timestop-dev parse', () => {
  it('maps the game option and the dev flag', () => {
    const input = logic.parse({ game: 7 }, { discordId: '123', username: 'snage', isDev: true });
    expect(input).toEqual({ gameId: 7, isDev: true, discordId: '123' });
  });

  it('turns an absent game option into null and a missing dev flag into false', () => {
    const input = logic.parse({ game: null }, { discordId: '456', username: 'nobody' });
    expect(input).toEqual({ gameId: null, isDev: false, discordId: '456' });
  });

  it('only an exact true counts as dev', () => {
    expect(logic.parse({ game: 1 }, { discordId: '456', isDev: 'yes' }).isDev).toBe(false);
  });
});

describe('timestop-dev run rejections', () => {
  it('rejects a non-dev caller and writes nothing', async () => {
    const deps = depsForState(GAMESTATES.ACTIVE);
    const result = await logic.run({ ...DEV_INPUT, isDev: false }, deps);
    expect(result).toEqual({ ok: false, reason: REJECTIONS.NOT_DEV });
    expect(deps.models.Games.update).not.toHaveBeenCalled();
    expect(deps.models.Games.create).not.toHaveBeenCalled();
    // the gate is checked before anything is read, too
    expect(deps.models.Games.findByPk).not.toHaveBeenCalled();
  });

  it('rejects an unknown game and writes nothing', async () => {
    const deps = createDeps({ models: { Games: { findByPk: async () => null } } });
    const result = await logic.run({ ...DEV_INPUT, gameId: 999 }, deps);
    expect(result).toEqual({
      ok: false,
      reason: REJECTIONS.NO_SUCH_GAME,
      data: { gameId: 999 },
    });
    expect(deps.models.Games.update).not.toHaveBeenCalled();
    expect(deps.models.Games.create).not.toHaveBeenCalled();
  });

  it('rejects when the default-game fallback finds no game, and writes nothing', async () => {
    const deps = createDeps({
      models: { Games: { findByPk: async () => null } },
      utils: { getOldestActiveGameId: jest.fn(async () => 0) },
    });
    const result = await logic.run({ ...DEV_INPUT, gameId: null }, deps);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe(REJECTIONS.NO_SUCH_GAME);
    expect(deps.models.Games.update).not.toHaveBeenCalled();
  });

  // No AP or range boundaries apply: this command spends nothing and has no
  // board geometry - the only gates are the dev flag (boolean) and whether
  // the game row exists.
});

describe('timestop-dev run gamestate table', () => {
  // Every state has a defined outcome: DEV_PAUSED unpauses, everything else
  // pauses. There is deliberately no gamestate gate here (dev command), so
  // adding a state without deciding its outcome breaks this test.
  it.each([
    [GAMESTATES.ACTIVE, 'paused', GAMESTATES.DEV_PAUSED],
    [GAMESTATES.DEV_PAUSED, 'unpaused', GAMESTATES.ACTIVE],
    [GAMESTATES.OVER, 'paused', GAMESTATES.DEV_PAUSED],
    [GAMESTATES.TIMESTOPPED, 'paused', GAMESTATES.DEV_PAUSED],
    [GAMESTATES.FINALE, 'paused', GAMESTATES.DEV_PAUSED],
    [GAMESTATES.REGISTRATION, 'paused', GAMESTATES.DEV_PAUSED],
    [GAMESTATES.INACTIVE, 'paused', GAMESTATES.DEV_PAUSED],
    [GAMESTATES.SANDBOX, 'paused', GAMESTATES.DEV_PAUSED],
  ])('gamestate %s -> %s', async (state, kind, written) => {
    const deps = depsForState(state);
    const result = await logic.run(DEV_INPUT, deps);
    expect(result).toEqual({ ok: true, kind, data: { gameId: 1 } });
    expect(deps.models.Games.update).toHaveBeenCalledWith(
      { GAME_STATE: written },
      { where: { Game_ID: 1 } },
    );
    expect(deps.models.Games.update).toHaveBeenCalledTimes(1);
  });

  it('covers all 8 gamestates in the table above', () => {
    expect(Object.values(GAMESTATES)).toHaveLength(8);
  });
});

describe('timestop-dev run success', () => {
  it('pauses an active game with the exact update payload', async () => {
    const deps = depsForState(GAMESTATES.ACTIVE);
    const result = await logic.run(DEV_INPUT, deps);
    expect(result).toEqual({ ok: true, kind: 'paused', data: { gameId: 1 } });
    expect(deps.models.Games.update).toHaveBeenCalledWith(
      { GAME_STATE: GAMESTATES.DEV_PAUSED },
      { where: { Game_ID: 1 } },
    );
  });

  it('unpauses a dev-paused game with the exact update payload', async () => {
    const deps = depsForState(GAMESTATES.DEV_PAUSED);
    const result = await logic.run(DEV_INPUT, deps);
    expect(result).toEqual({ ok: true, kind: 'unpaused', data: { gameId: 1 } });
    expect(deps.models.Games.update).toHaveBeenCalledWith(
      { GAME_STATE: GAMESTATES.ACTIVE },
      { where: { Game_ID: 1 } },
    );
  });

  // QUIRK (preserved): the fallback takes NO player id - the old call was the
  // game-wide getOldestActiveGame(), not the caller-scoped lookup other
  // commands use, so a dev pauses the oldest active game overall.
  it('resolves the default game via getOldestActiveGameId with no player id', async () => {
    const getOldestActiveGameId = jest.fn(async () => 4);
    const deps = createDeps({
      models: {
        Games: {
          findByPk: async (id) => createFakeGame({ Game_ID: id, GAME_STATE: GAMESTATES.ACTIVE }),
        },
      },
      utils: { getOldestActiveGameId },
    });
    const result = await logic.run({ ...DEV_INPUT, gameId: null }, deps);
    expect(result).toEqual({ ok: true, kind: 'paused', data: { gameId: 4 } });
    expect(getOldestActiveGameId).toHaveBeenCalledWith();
    expect(deps.models.Games.update).toHaveBeenCalledWith(
      { GAME_STATE: GAMESTATES.DEV_PAUSED },
      { where: { Game_ID: 4 } },
    );
  });

  it('reports success even when the update matched no rows', async () => {
    const deps = createDeps({
      models: {
        Games: {
          findByPk: async () => createFakeGame({ Game_ID: 2, GAME_STATE: GAMESTATES.ACTIVE }),
          update: async () => [0],
        },
      },
    });
    const result = await logic.run({ ...DEV_INPUT, gameId: 2 }, deps);
    expect(result).toEqual({ ok: true, kind: 'paused', data: { gameId: 2 } });
  });
});

describe('timestop-dev present', () => {
  it('renders the pause success with its exact legacy wording', () => {
    const out = logic.present({ ok: true, kind: 'paused', data: { gameId: 3 } });
    expect(out).toEqual({ content: 'Game 3 has been paused!' });
  });

  it('renders the unpause success with its exact legacy wording', () => {
    const out = logic.present({ ok: true, kind: 'unpaused', data: { gameId: 3 } });
    expect(out).toEqual({ content: 'Game 3 is unpaused!' });
  });

  it('renders the non-dev rejection through the shared message table', () => {
    const out = logic.present({ ok: false, reason: REJECTIONS.NOT_DEV });
    expect(out).toEqual({ content: 'Only the dev can use this command.' });
  });

  it('renders the unknown-game rejection with the game id', () => {
    const out = logic.present({ ok: false, reason: REJECTIONS.NO_SUCH_GAME, data: { gameId: 9 } });
    expect(out).toEqual({ content: 'Could not find game #9!' });
  });
});

describe('timestop-dev adapter (smoke)', () => {
  it('exports the command contract', () => {
    expect(timestopDev.data.toJSON().name).toBe('timestop-dev');
    expect(typeof timestopDev.execute).toBe('function');
  });
});
