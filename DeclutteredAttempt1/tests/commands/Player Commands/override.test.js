/**
 * /override - logic tests. Plain data in, plain data out: no jest.mock, no
 * discord.js, no interaction. deps carries fake models; utils logic is real.
 */
const logic = require('../../../commands/Player Commands/override.logic.js');
const override = require('../../../commands/Player Commands/override.js');
const { GAMESTATES, REJECTIONS } = require('../../../enums.js');
const {
  createDeps, createFakeGame, createFakePlayer, createFakeClass,
} = require('../../helpers/mockModels.js');

const ACTOR = '123';

/** deps for the happy path (a dead Medium with overrides); override per test */
function happyDeps(over = {}) {
  const player = over.player || createFakePlayer({
    Player_ID: 1, Discord_ID: ACTOR, Dead: true, cCOverides: 3,
  });
  const game = over.game || createFakeGame({ GAME_STATE: GAMESTATES.ACTIVE });
  const playerClass = over.playerClass || createFakeClass({ Class_Name: 'Medium' });
  const deps = createDeps({
    models: {
      Games: { findByPk: async () => game },
      Players: { findOne: async ({ where }) => (where.Discord_ID === ACTOR ? player : null) },
      Classes: { findByPk: async () => playerClass },
    },
  });
  return { deps, player, game };
}

const INPUT = { pollOption: 2, gameId: 1, discordId: ACTOR };

function expectNoWrites(deps) {
  expect(deps.models.Players.update).not.toHaveBeenCalled();
  expect(deps.models.Games.update).not.toHaveBeenCalled();
}

describe('override.parse', () => {
  it('maps raw options and applies defaults', () => {
    const input = logic.parse({ option: 2, game: null }, { discordId: ACTOR, username: 'snage' });
    expect(input).toEqual({ pollOption: 2, gameId: null, discordId: ACTOR });
  });

  it('passes an explicit game id through', () => {
    const input = logic.parse({ option: 1, game: 7 }, { discordId: ACTOR, username: 'snage' });
    expect(input).toEqual({ pollOption: 1, gameId: 7, discordId: ACTOR });
  });
});

describe('override.run rejections', () => {
  it('rejects an unknown game and writes nothing', async () => {
    const { deps } = happyDeps();
    deps.models.Games.findByPk = jest.fn(async () => null);
    const result = await logic.run(INPUT, deps);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe(REJECTIONS.NO_SUCH_GAME);
    expectNoWrites(deps);
  });

  it('rejects a player who is not in the game', async () => {
    const { deps } = happyDeps();
    deps.models.Players.findOne = jest.fn(async () => null);
    const result = await logic.run(INPUT, deps);
    expect(result.reason).toBe(REJECTIONS.NOT_IN_GAME);
    expectNoWrites(deps);
  });

  // preserved quirk: the legacy condition `!player.Dead || Class_Name != "Medium"`
  // only lets a player who is BOTH dead AND a Medium through, despite the
  // message saying "Dead or Medium" - these three pin that
  it('rejects a living Medium (quirk: must be dead AND Medium)', async () => {
    const { deps } = happyDeps({
      player: createFakePlayer({ Player_ID: 1, Discord_ID: ACTOR, Dead: false, cCOverides: 3 }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result.reason).toBe(REJECTIONS.NOT_DEAD_OR_MEDIUM);
    expectNoWrites(deps);
  });

  it('rejects a dead non-Medium (quirk: must be dead AND Medium)', async () => {
    const { deps } = happyDeps({ playerClass: createFakeClass({ Class_Name: 'Average' }) });
    const result = await logic.run(INPUT, deps);
    expect(result.reason).toBe(REJECTIONS.NOT_DEAD_OR_MEDIUM);
    expectNoWrites(deps);
  });

  it('rejects a living non-Medium', async () => {
    const { deps } = happyDeps({
      player: createFakePlayer({ Player_ID: 1, Discord_ID: ACTOR, Dead: false, cCOverides: 3 }),
      playerClass: createFakeClass({ Class_Name: 'Average' }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result.reason).toBe(REJECTIONS.NOT_DEAD_OR_MEDIUM);
    expectNoWrites(deps);
  });

  it('rejects when no overrides are left (boundary: zero)', async () => {
    const { deps } = happyDeps({
      player: createFakePlayer({ Player_ID: 1, Discord_ID: ACTOR, Dead: true, cCOverides: 0 }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result.reason).toBe(REJECTIONS.NO_OVERRIDES);
    expectNoWrites(deps);
  });

  it('accepts with exactly one override left (boundary: one)', async () => {
    const { deps } = happyDeps({
      player: createFakePlayer({ Player_ID: 1, Discord_ID: ACTOR, Dead: true, cCOverides: 1 }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result.ok).toBe(true);
    expect(deps.models.Players.update).toHaveBeenCalledWith(
      { cCOverides: 0 }, { where: { Player_ID: 1 } },
    );
  });

  // preserved quirk: the legacy command has NO gamestate gate - a dead Medium
  // can override in every state, OVER/DEV_PAUSED/TIMESTOPPED included; this
  // table pins that a new state cannot silently change it either
  it.each([
    [GAMESTATES.ACTIVE],
    [GAMESTATES.REGISTRATION],
    [GAMESTATES.INACTIVE],
    [GAMESTATES.SANDBOX],
    [GAMESTATES.FINALE],
    [GAMESTATES.OVER],
    [GAMESTATES.DEV_PAUSED],
    [GAMESTATES.TIMESTOPPED],
  ])('gamestate %s -> succeeds (no gamestate gate)', async (state) => {
    const { deps } = happyDeps({ game: createFakeGame({ GAME_STATE: state }) });
    const result = await logic.run(INPUT, deps);
    expect(result.ok).toBe(true);
  });
});

describe('override.run success', () => {
  it('spends one override and records the overrider with exact write payloads', async () => {
    const { deps } = happyDeps();
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({
      ok: true,
      kind: 'override-recorded',
      data: { gameId: 1, pollOption: 2, overridesLeft: 2 },
    });
    expect(deps.models.Players.update).toHaveBeenCalledWith(
      { cCOverides: 2 }, // 3 - 1
      { where: { Player_ID: 1 } },
    );
    expect(deps.models.Games.update).toHaveBeenCalledWith(
      { overrider: ACTOR },
      { where: { Game_ID: 1 } },
    );
    expect(deps.models.Players.update).toHaveBeenCalledTimes(1);
    expect(deps.models.Games.update).toHaveBeenCalledTimes(1);
  });

  it('resolves the default game via getOldestActiveGameId when no game is given', async () => {
    const { deps } = happyDeps();
    deps.utils = { ...deps.utils, getOldestActiveGameId: jest.fn(async () => 1) };
    const result = await logic.run({ ...INPUT, gameId: null }, deps);
    expect(result.ok).toBe(true);
    expect(deps.utils.getOldestActiveGameId).toHaveBeenCalledWith(ACTOR);
  });
});

describe('override.present', () => {
  it('renders the not-dead-or-medium rejection with the exact legacy wording', () => {
    const out = logic.present({ ok: false, reason: REJECTIONS.NOT_DEAD_OR_MEDIUM });
    expect(out).toEqual({ content: 'Only Dead or Medium can override a chaos council poll!' });
  });

  it('renders the no-overrides rejection with the exact legacy wording', () => {
    const out = logic.present({ ok: false, reason: REJECTIONS.NO_OVERRIDES });
    expect(out).toEqual({ content: "You don't have any overrides left!" });
  });

  // preserved quirk (issue #85): the poll is never touched; success says so
  // instead of the legacy behaviour of never editing the deferred reply
  it('renders success as the not-implemented notice', () => {
    const out = logic.present({
      ok: true,
      kind: 'override-recorded',
      data: { gameId: 1, pollOption: 2, overridesLeft: 2 },
    });
    expect(out).toEqual({ content: 'Your override has been recorded, but applying it to the chaos council poll is not implemented yet.' });
  });
});

describe('override adapter (smoke)', () => {
  it('exports the command contract', () => {
    expect(override.data.toJSON().name).toBe('override');
    expect(typeof override.execute).toBe('function');
  });
});
