/**
 * /check-target - logic tests. Plain data in, plain data out: no jest.mock,
 * no discord.js, no interaction. deps carries fake models; utils logic is
 * real. Read-only command: no update/create is ever expected.
 */
const logic = require('../../../commands/Class Commands/checkTarget.logic.js');
const checkTarget = require('../../../commands/Class Commands/checkTarget.js');
const { GAMESTATES, REJECTIONS } = require('../../../enums.js');
const {
  createDeps,
  createFakeGame,
  createFakePlayer,
  expectNoWrites,
} = require('../../helpers/mockModels.js');

const HITMAN = '123';

/** deps for the happy path; override per test */
function happyDeps(over = {}) {
  const hitman = over.hitman || createFakePlayer({ Player_ID: 1, Discord_ID: HITMAN, Class_ID: 10, Hitman_Target: 2 });
  const target = 'target' in over ? over.target : createFakePlayer({ Player_ID: 2, Discord_ID: '456', Class_ID: 3 });
  const game = over.game || createFakeGame({ GAME_STATE: GAMESTATES.ACTIVE });
  // the pool a dead/missing target is replaced from; the hitman is in it so
  // tests can prove they are filtered out
  const living = 'living' in over ? over.living : [hitman, createFakePlayer({ Player_ID: 3, Discord_ID: '789', Class_ID: 4 })];
  const deps = createDeps({
    models: {
      Games: { findByPk: async () => game },
      Players: {
        findOne: async ({ where }) =>
          (where.Discord_ID === HITMAN ? hitman : where.Player_ID != null && target && where.Player_ID === target.Player_ID ? target : null),
        findAll: async () => living,
      },
    },
  });
  return { deps, hitman, target, game, living };
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

  // The state -> verdict table belongs to utils.checkGameState, and
  // tests/utils.pure.test.js walks every state in the enum - including a
  // newly added one. What is this command's own is only that run() asks the
  // gate and returns its verdict without writing, so one state that passes,
  // one that blocks, and the timestop (whose answer depends on the
  // isClockwatcher argument this command passes) cover it here.
  //
  // isClockwatcher is hardcoded false (as the old call did), so
  // TIMESTOPPED blocks even a hitman.
  it.each([
    [GAMESTATES.ACTIVE, null],
    [GAMESTATES.OVER, REJECTIONS.GAME_OVER],
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

  it('rejects a dead hitman and writes nothing', async () => {
    const { deps } = happyDeps({
      hitman: createFakePlayer({ Player_ID: 1, Discord_ID: HITMAN, Class_ID: 10, Hitman_Target: 2, Dead: true }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.PLAYER_DEAD });
    expectNoWrites(deps);
  });

  it('a dead hitman is turned away before any reassignment happens', async () => {
    // the dead gate has to beat the retarget, or a corpse burns a live
    // player's name on a target they can never act on
    const { deps } = happyDeps({
      hitman: createFakePlayer({ Player_ID: 1, Discord_ID: HITMAN, Class_ID: 10, Hitman_Target: null, Dead: true }),
      target: null,
    });
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.PLAYER_DEAD });
    expectNoWrites(deps);
  });

  it('tells a dead non-hitman they are not a hitman, not that they are dead', async () => {
    const { deps } = happyDeps({
      hitman: createFakePlayer({ Player_ID: 1, Discord_ID: HITMAN, Class_ID: 9, Hitman_Target: 2, Dead: true }),
    });
    expect((await logic.run(INPUT, deps)).reason).toBe(REJECTIONS.WRONG_CLASS);
  });

  it('rejects a non-hitman (Class_ID != 10)', async () => {
    const { deps } = happyDeps({ hitman: createFakePlayer({ Player_ID: 1, Discord_ID: HITMAN, Class_ID: 9, Hitman_Target: 2 }) });
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.WRONG_CLASS, data: { className: 'hitman' } });
    expectNoWrites(deps);
  });

  it('rejects only when there is nobody left alive to target', async () => {
    // the hitman is the last one standing: they are filtered out of their own
    // candidate list, which leaves it empty
    const hitman = createFakePlayer({ Player_ID: 1, Discord_ID: HITMAN, Class_ID: 10, Hitman_Target: null });
    const { deps } = happyDeps({ hitman, target: null, living: [hitman] });
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
      data: { targetDiscordId: '456', reassigned: false, x: undefined, y: undefined, layerId: undefined, className: undefined },
    });
    expectNoWrites(deps);
  });

  it('looks the target up by gameId and Hitman_Target (old code passed the Games row as Game_ID)', async () => {
    const { deps } = happyDeps();
    await logic.run(INPUT, deps);
    expect(deps.models.Players.findOne).toHaveBeenCalledWith({ where: { Game_ID: 1, Player_ID: 2 } });
  });


  it('resolves the default game via getOldestGameId when no game is given', async () => {
    const { deps } = happyDeps();
    deps.utils = { ...deps.utils, getOldestGameId: jest.fn(async () => 1) };
    const result = await logic.run({ ...INPUT, gameId: null }, deps);
    expect(result.ok).toBe(true);
    expect(deps.utils.getOldestGameId).toHaveBeenCalledWith(HITMAN);
  });
});

describe('checkTarget.run reassignment', () => {
  const NEW_TARGET = { Player_ID: 3, Discord_ID: '789' };

  it('gives a new target when the hitman has none', async () => {
    const { deps } = happyDeps({
      hitman: createFakePlayer({ Player_ID: 1, Discord_ID: HITMAN, Class_ID: 10, Hitman_Target: null }),
      target: null,
    });
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({ ok: true, data: { targetDiscordId: NEW_TARGET.Discord_ID, reassigned: true } });
    expect(deps.models.Players.update).toHaveBeenCalledWith(
      { Hitman_Target: NEW_TARGET.Player_ID }, { where: { Game_ID: 1, Player_ID: 1 } },
    );
  });

  it('gives a new target when the current one is dead', async () => {
    const { deps } = happyDeps({
      target: createFakePlayer({ Player_ID: 2, Discord_ID: '456', Dead: true }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({ ok: true, data: { targetDiscordId: NEW_TARGET.Discord_ID, reassigned: true } });
    expect(deps.models.Players.update).toHaveBeenCalled();
  });

  it('never picks the hitman themselves', async () => {
    // the hitman is first in the living pool and deps.random returns 0, so an
    // unfiltered list would hand them themselves
    const { deps, hitman } = happyDeps({
      hitman: createFakePlayer({ Player_ID: 1, Discord_ID: HITMAN, Class_ID: 10, Hitman_Target: null }),
      target: null,
    });
    const result = await logic.run(INPUT, deps);
    expect(result.data.targetDiscordId).not.toBe(hitman.Discord_ID);
  });

  it('only considers living candidates', async () => {
    const { deps } = happyDeps({
      hitman: createFakePlayer({ Player_ID: 1, Discord_ID: HITMAN, Class_ID: 10, Hitman_Target: null }),
      target: null,
    });
    await logic.run(INPUT, deps);
    expect(deps.models.Players.findAll).toHaveBeenCalledWith({ where: { Game_ID: 1, Dead: false } });
  });

  it('indexes with length - 1, because getRandomInt is inclusive of max', async () => {
    // deps.random is handed the top index, not the count: passing the count
    // would let the roll land one past the end and return undefined
    const seen = [];
    const { deps } = happyDeps({
      hitman: createFakePlayer({ Player_ID: 1, Discord_ID: HITMAN, Class_ID: 10, Hitman_Target: null }),
      target: null,
      living: [
        createFakePlayer({ Player_ID: 1, Discord_ID: HITMAN }),
        createFakePlayer({ Player_ID: 3, Discord_ID: '789' }),
        createFakePlayer({ Player_ID: 4, Discord_ID: '999' }),
      ],
    });
    deps.random = jest.fn((max) => { seen.push(max); return max; });
    const result = await logic.run(INPUT, deps);
    // two candidates after filtering the hitman out, so the top index is 1
    expect(seen).toEqual([1]);
    expect(result.data.targetDiscordId).toBe('999');
  });

  it('leaves a living target alone and writes nothing', async () => {
    const { deps } = happyDeps();
    const result = await logic.run(INPUT, deps);
    expect(result.data).toMatchObject({ targetDiscordId: '456', reassigned: false });
    expectNoWrites(deps);
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
      data: { targetDiscordId: '456', reassigned: false, x: undefined, y: undefined, layerId: undefined, className: undefined },
    });
    expect(out).toEqual({ content: 'Target: <@456> , Location: (undefined, undefined) layer: undefined, Class: undefined' });
  });

  it('says so above the legacy line when the target was reassigned', () => {
    const out = logic.present({
      ok: true,
      kind: 'target',
      data: { targetDiscordId: '789', reassigned: true, x: undefined, y: undefined, layerId: undefined, className: undefined },
    });
    expect(out.content).toBe('Your last target is gone, so you have a new one.\nTarget: <@789> , Location: (undefined, undefined) layer: undefined, Class: undefined');
  });
});

describe('checkTarget adapter (smoke)', () => {
  it('exports the command contract', () => {
    expect(checkTarget.data.toJSON().name).toBe('check-target');
    expect(typeof checkTarget.execute).toBe('function');
  });
});
