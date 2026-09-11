/**
 * /check-target - logic tests. Plain data in, plain data out: no jest.mock,
 * no discord.js, no interaction. deps carries fake models; utils logic is
 * real. Read-only command: no update/create is ever expected.
 */
const logic = require('../../../commands/Class Commands/checkTarget.logic.js');
const checkTarget = require('../../../commands/Class Commands/checkTarget.js');
const { GAMESTATES, REJECTIONS } = require('../../../enums.js');
const {
  createDeps, createFakeGame, createFakePlayer,
} = require('../../helpers/mockModels.js');

const HITMAN = '123';

/** deps for the happy path; override per test */
function happyDeps(over = {}) {
  const hitman = over.hitman || createFakePlayer({ Player_ID: 1, Discord_ID: HITMAN, Class_ID: 10, Hitman_Target: 2 });
  const target = 'target' in over ? over.target : createFakePlayer({ Player_ID: 2, Discord_ID: '456', Class_ID: 3 });
  const game = over.game || createFakeGame({ GAME_STATE: GAMESTATES.ACTIVE });
  const deps = createDeps({
    models: {
      Games: { findByPk: async () => game },
      Players: {
        findOne: async ({ where }) =>
          (where.Discord_ID === HITMAN ? hitman : where.Player_ID != null && target && where.Player_ID === target.Player_ID ? target : null),
      },
    },
  });
  return { deps, hitman, target, game };
}

function expectNoWrites(deps) {
  expect(deps.models.Players.update).not.toHaveBeenCalled();
  expect(deps.models.Players.create).not.toHaveBeenCalled();
  expect(deps.models.Games.update).not.toHaveBeenCalled();
  expect(deps.models.Games.create).not.toHaveBeenCalled();
}

const INPUT = { gameId: 1, discordId: HITMAN };

describe('checkTarget.parse', () => {
  it('maps the game option and actor', () => {
    const input = logic.parse({ game: 3 }, { discordId: HITMAN, username: 'snage' });
    expect(input).toEqual({ gameId: 3, discordId: HITMAN });
  });

  it('defaults an absent game option to null', () => {
    const input = logic.parse({ game: null }, { discordId: HITMAN, username: 'snage' });
    expect(input).toEqual({ gameId: null, discordId: HITMAN });
  });
});

describe('checkTarget.run rejections', () => {
  it('rejects an unknown game and writes nothing', async () => {
    const { deps } = happyDeps();
    deps.models.Games.findByPk = jest.fn(async () => null);
    const result = await logic.run(INPUT, deps);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe(REJECTIONS.NO_SUCH_GAME);
    expectNoWrites(deps);
  });

  // the gamestate table: every state has a defined outcome; adding a state
  // without deciding its gate breaks this test. isClockwatcher is hardcoded
  // false (as the old call did), so TIMESTOPPED blocks even a hitman.
  it.each([
    [GAMESTATES.ACTIVE, null],
    [GAMESTATES.REGISTRATION, null],
    [GAMESTATES.INACTIVE, null],
    [GAMESTATES.SANDBOX, null],
    [GAMESTATES.FINALE, null],
    [GAMESTATES.OVER, REJECTIONS.GAME_OVER],
    [GAMESTATES.DEV_PAUSED, REJECTIONS.GAME_PAUSED],
    [GAMESTATES.TIMESTOPPED, REJECTIONS.TIME_STOPPED],
  ])('gamestate %s -> %s', async (state, reason) => {
    const { deps } = happyDeps({ game: createFakeGame({ GAME_STATE: state }) });
    const result = await logic.run(INPUT, deps);
    if (reason === null) {
      expect(result.ok).toBe(true);
    } else {
      expect(result).toMatchObject({ ok: false, reason });
      expectNoWrites(deps);
    }
  });

  it('rejects a caller who is not in the game', async () => {
    const { deps } = happyDeps();
    deps.models.Players.findOne = jest.fn(async () => null);
    const result = await logic.run(INPUT, deps);
    expect(result.reason).toBe(REJECTIONS.NOT_IN_GAME);
    expectNoWrites(deps);
  });

  it('rejects a non-hitman (Class_ID != 10)', async () => {
    const { deps } = happyDeps({ hitman: createFakePlayer({ Player_ID: 1, Discord_ID: HITMAN, Class_ID: 9, Hitman_Target: 2 }) });
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.WRONG_CLASS, data: { className: 'hitman' } });
    expectNoWrites(deps);
  });

  it('rejects a hitman whose target row is missing (Hitman_Target null)', async () => {
    const { deps } = happyDeps({
      hitman: createFakePlayer({ Player_ID: 1, Discord_ID: HITMAN, Class_ID: 10, Hitman_Target: null }),
      target: null,
    });
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.NO_TARGET, data: { message: 'No current target...' } });
    expectNoWrites(deps);
  });

  // AP and range boundaries: not applicable - the command costs no AP and
  // has no range check.
});

describe('checkTarget.run success', () => {
  it('returns the target info and writes nothing (read-only command)', async () => {
    const { deps } = happyDeps();
    const result = await logic.run(INPUT, deps);
    expect(result).toEqual({
      ok: true,
      kind: 'target',
      // quirk pinned: X_Position/Y_Position/Layer_ID/Class are not Players
      // columns, so the old message rendered them as "undefined"; the port
      // keeps reading them off the Players row
      data: { targetDiscordId: '456', x: undefined, y: undefined, layerId: undefined, className: undefined },
    });
    expectNoWrites(deps);
  });

  it('looks the target up by gameId and Hitman_Target (old code passed the Games row as Game_ID)', async () => {
    const { deps } = happyDeps();
    await logic.run(INPUT, deps);
    expect(deps.models.Players.findOne).toHaveBeenCalledWith({ where: { Game_ID: 1, Player_ID: 2 } });
  });

  it('still shows the target to a dead hitman (quirk: no Dead check)', async () => {
    const { deps } = happyDeps({
      hitman: createFakePlayer({ Player_ID: 1, Discord_ID: HITMAN, Class_ID: 10, Hitman_Target: 2, Dead: true }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result.ok).toBe(true);
  });

  it('resolves the default game via getOldestGameId when no game is given', async () => {
    const { deps } = happyDeps();
    deps.utils = { ...deps.utils, getOldestGameId: jest.fn(async () => 1) };
    const result = await logic.run({ ...INPUT, gameId: null }, deps);
    expect(result.ok).toBe(true);
    expect(deps.utils.getOldestGameId).toHaveBeenCalledWith(HITMAN);
  });
});

describe('checkTarget.present', () => {
  it('renders the wrong-class rejection with the exact legacy wording', () => {
    const out = logic.present({ ok: false, reason: REJECTIONS.WRONG_CLASS, data: { className: 'hitman' } });
    expect(out).toEqual({ content: 'You are not a hitman!' });
  });

  it('renders the no-target rejection with the exact legacy wording', () => {
    const out = logic.present({ ok: false, reason: REJECTIONS.NO_TARGET, data: { message: 'No current target...' } });
    expect(out).toEqual({ content: 'No current target...' });
  });

  it('renders success byte-identically to the legacy message (undefineds included)', () => {
    const out = logic.present({
      ok: true,
      kind: 'target',
      data: { targetDiscordId: '456', x: undefined, y: undefined, layerId: undefined, className: undefined },
    });
    expect(out).toEqual({ content: 'Target: <@456> , Location: (undefined, undefined) layer: undefined, Class: undefined' });
  });
});

describe('checkTarget adapter (smoke)', () => {
  it('exports the command contract', () => {
    expect(checkTarget.data.toJSON().name).toBe('check-target');
    expect(typeof checkTarget.execute).toBe('function');
  });
});
