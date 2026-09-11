/**
 * /timestop - logic tests. Plain data in, plain data out: no jest.mock, no
 * discord.js, no interaction. deps carries fake models; utils logic is real.
 */
const logic = require('../../../commands/Class Commands/timestop.logic.js');
const timestop = require('../../../commands/Class Commands/timestop.js');
const { GAMESTATES, REJECTIONS } = require('../../../enums.js');
const {
  createDeps, createFakeGame, createFakePlayer, createFakeClass,
} = require('../../helpers/mockModels.js');

const ACTOR = '123';

/** deps for the happy path; override per test */
function happyDeps(over = {}) {
  const game = over.game || createFakeGame({ Game_ID: 1, AP_INTERVAL_MIN: 720, GAME_STATE: GAMESTATES.ACTIVE });
  const player = over.player || createFakePlayer({ Player_ID: 1, Discord_ID: ACTOR, Class_ID: 7, Action_Points: 12 });
  const playerClass = 'playerClass' in over ? over.playerClass : createFakeClass({ Class_ID: 7, Class_Name: 'Clockwatcher' });
  const deps = createDeps({
    models: {
      Games: { findByPk: async () => game },
      Players: { findOne: async () => player },
      Classes: { findByPk: async () => playerClass },
    },
  });
  return { deps, game, player, playerClass };
}

const INPUT = { gameId: 1, discordId: ACTOR };

describe('timestop.parse', () => {
  it('maps raw options and applies defaults', () => {
    expect(logic.parse({ game: 3 }, { discordId: ACTOR, username: 'snage' }))
      .toEqual({ gameId: 3, discordId: ACTOR });
  });

  it('turns an absent game option into null', () => {
    expect(logic.parse({ game: null }, { discordId: ACTOR, username: 'snage' }))
      .toEqual({ gameId: null, discordId: ACTOR });
  });
});

describe('timestop.run rejections', () => {
  it('rejects an unknown game and writes nothing', async () => {
    const { deps } = happyDeps();
    deps.models.Games.findByPk = jest.fn(async () => null);
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.NO_SUCH_GAME, data: { gameId: 1 } });
    expect(deps.models.Games.update).not.toHaveBeenCalled();
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  it('rejects a player who is not in the game and writes nothing', async () => {
    const { deps } = happyDeps();
    deps.models.Players.findOne = jest.fn(async () => null);
    const result = await logic.run(INPUT, deps);
    expect(result.reason).toBe(REJECTIONS.NOT_IN_GAME);
    expect(deps.models.Games.update).not.toHaveBeenCalled();
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  it('rejects a player who is not a Clockwatcher and writes nothing', async () => {
    const { deps } = happyDeps({ playerClass: createFakeClass({ Class_Name: 'Pyromainiac' }) });
    const result = await logic.run(INPUT, deps);
    expect(result.reason).toBe(REJECTIONS.WRONG_CLASS);
    expect(deps.models.Games.update).not.toHaveBeenCalled();
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  it('treats a missing class row as not a Clockwatcher instead of crashing', async () => {
    const { deps } = happyDeps({ playerClass: null });
    const result = await logic.run(INPUT, deps);
    expect(result.reason).toBe(REJECTIONS.WRONG_CLASS);
    expect(deps.models.Games.update).not.toHaveBeenCalled();
  });

  it('rejects 11 AP (boundary: one short) and writes nothing', async () => {
    const { deps } = happyDeps({
      player: createFakePlayer({ Player_ID: 1, Discord_ID: ACTOR, Action_Points: 11 }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.NOT_ENOUGH_AP, data: { needed: 12, has: 11 } });
    expect(deps.models.Games.update).not.toHaveBeenCalled();
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  it('accepts exactly 12 AP (boundary: exact)', async () => {
    const { deps } = happyDeps({
      player: createFakePlayer({ Player_ID: 1, Discord_ID: ACTOR, Action_Points: 12 }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result.ok).toBe(true);
    expect(deps.models.Games.update).toHaveBeenCalledTimes(1);
  });

  // preserved quirk: /timestop has no gamestate gate at all - the legacy
  // command never called checkGameState, so every state (OVER and DEV_PAUSED
  // included) still stops time. A new state cannot be added without deciding
  // this test.
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
    const { deps } = happyDeps({ game: createFakeGame({ Game_ID: 1, AP_INTERVAL_MIN: 720, GAME_STATE: state }) });
    const result = await logic.run(INPUT, deps);
    expect(result.ok).toBe(true);
    expect(deps.models.Games.update).toHaveBeenCalledWith(
      { GAME_STATE: GAMESTATES.TIMESTOPPED, timestopTurns: 4 },
      { where: { Game_ID: 1 } },
    );
  });

  // preserved quirk: no dead check - a dead Clockwatcher can still stop time
  it('lets a dead Clockwatcher stop time', async () => {
    const { deps } = happyDeps({
      player: createFakePlayer({ Player_ID: 1, Discord_ID: ACTOR, Action_Points: 12, Dead: true }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result.ok).toBe(true);
  });
});

describe('timestop.run success', () => {
  it('stops the game with the exact write payload', async () => {
    const { deps } = happyDeps();
    const result = await logic.run(INPUT, deps);
    expect(result).toEqual({
      ok: true,
      kind: 'timestopped',
      data: { gameId: 1, turns: 4, minutes: 2880 },
    });
    expect(deps.models.Games.update).toHaveBeenCalledWith(
      { GAME_STATE: GAMESTATES.TIMESTOPPED, timestopTurns: 4 },
      { where: { Game_ID: 1 } },
    );
    expect(deps.models.Games.update).toHaveBeenCalledTimes(1);
  });

  // preserved quirk: the 12 AP is a threshold, never spent - no Players row
  // is ever written, so a Clockwatcher can stop time repeatedly
  it('never deducts the AP it requires', async () => {
    const { deps } = happyDeps();
    await logic.run(INPUT, deps);
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  it('reports minutes from the pre-update game row (AP_INTERVAL_MIN * 4)', async () => {
    const { deps } = happyDeps({
      game: createFakeGame({ Game_ID: 2, AP_INTERVAL_MIN: 60, GAME_STATE: GAMESTATES.ACTIVE }),
    });
    const result = await logic.run({ gameId: 2, discordId: ACTOR }, deps);
    expect(result.data).toEqual({ gameId: 2, turns: 4, minutes: 240 });
  });

  it('looks the player up in the resolved game', async () => {
    const { deps } = happyDeps();
    await logic.run(INPUT, deps);
    expect(deps.models.Players.findOne).toHaveBeenCalledWith({ where: { Game_ID: 1, Discord_ID: ACTOR } });
  });

  it('resolves the default game via getOldestActiveGameId when no game is given', async () => {
    const { deps } = happyDeps();
    deps.utils = { ...deps.utils, getOldestActiveGameId: jest.fn(async () => 1) };
    const result = await logic.run({ gameId: null, discordId: ACTOR }, deps);
    expect(result.ok).toBe(true);
    expect(deps.utils.getOldestActiveGameId).toHaveBeenCalledWith(ACTOR);
    expect(deps.models.Games.findByPk).toHaveBeenCalledWith(1);
  });
});

describe('timestop.present', () => {
  it('renders the wrong-class rejection with its legacy wording', () => {
    const out = logic.present({
      ok: false,
      reason: REJECTIONS.WRONG_CLASS,
      data: { className: 'Clockwatcher', message: 'Only clockwatchers can stop time!' },
    });
    expect(out).toEqual({ content: 'Only clockwatchers can stop time!' });
  });

  it('renders the not-enough-AP rejection with its legacy wording', () => {
    const out = logic.present({
      ok: false,
      reason: REJECTIONS.NOT_ENOUGH_AP,
      data: { needed: 12, has: 3, message: "You don't have enough AP!" },
    });
    expect(out).toEqual({ content: "You don't have enough AP!" });
  });

  it('renders a rejection with no message via the shared message table', () => {
    const out = logic.present({ ok: false, reason: REJECTIONS.NOT_IN_GAME });
    expect(out).toEqual({ content: 'Player not found in game!, please register for the game you wish to play in.' });
  });

  it('renders success with the minute count', () => {
    const out = logic.present({ ok: true, kind: 'timestopped', data: { gameId: 1, turns: 4, minutes: 2880 } });
    expect(out).toEqual({
      content: 'Time has been stopped! You have 2880 minutes all to yourself!\n and any other clockwatchers...',
    });
  });
});

describe('timestop adapter (smoke)', () => {
  it('exports the command contract', () => {
    expect(timestop.data.toJSON().name).toBe('timestop');
    expect(typeof timestop.execute).toBe('function');
  });
});
