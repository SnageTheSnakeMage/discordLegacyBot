/**
 * /register - logic tests. Plain data in, plain data out: no jest.mock, no
 * discord.js, no interaction. deps carries fake models; utils.registerPlayer
 * and the default-game lookup are the only utils pieces overridden, because
 * both reach the real database.
 */
const logic = require('../../../commands/Player Commands/register.logic.js');
const register = require('../../../commands/Player Commands/register.js');
const { GAMESTATES, REJECTIONS } = require('../../../enums.js');
const { createDeps, createFakeGame, createFakePlayer } = require('../../helpers/mockModels.js');

const ACTOR = '123';
const PNG_ICON = { contentType: 'image/png', width: 80, height: 80, url: 'https://cdn.example/icon.png' };

/** deps for the happy path; override per test */
function happyDeps(over = {}) {
  const game = over.game || createFakeGame({ Game_ID: 1, GAME_STATE: GAMESTATES.REGISTRATION });
  const deps = createDeps({
    models: {
      Games: { findByPk: async () => game },
      Players: {
        findOne: async () => over.existingPlayer || null,
        count: async () => over.playerCount ?? 0,
      },
    },
    utils: {
      registerPlayer: jest.fn(async () => undefined),
      getOldestGamestateGameId: jest.fn(async () => 1),
    },
  });
  return { deps, game };
}

/** no Players row may be created or destroyed by a rejected registration */
function expectNoWrites(deps) {
  expect(deps.models.Players.create).not.toHaveBeenCalled();
  expect(deps.models.Players.update).not.toHaveBeenCalled();
  expect(deps.models.Players.destroy).not.toHaveBeenCalled();
  expect(deps.utils.registerPlayer).not.toHaveBeenCalled();
}

const INPUT = { gameId: 1, icon: PNG_ICON, discordId: ACTOR };

describe('register.parse', () => {
  it('maps raw options and applies defaults', () => {
    const input = logic.parse({ game: null, icon: PNG_ICON }, { discordId: ACTOR, username: 'snage' });
    expect(input).toEqual({ gameId: null, icon: PNG_ICON, discordId: ACTOR });
  });

  it('keeps an explicit game id', () => {
    const input = logic.parse({ game: 3, icon: PNG_ICON }, { discordId: ACTOR, username: 'snage' });
    expect(input.gameId).toBe(3);
  });
});

describe('register.run rejections', () => {
  it('rejects an unknown game with the legacy message and writes nothing', async () => {
    const { deps } = happyDeps();
    deps.models.Games.findByPk = jest.fn(async () => null);
    const result = await logic.run(INPUT, deps);
    expect(result).toEqual({
      ok: false,
      reason: REJECTIONS.NO_SUCH_GAME,
      data: { gameId: 1, message: 'Game not found. Please check the game ID.' },
    });
    expectNoWrites(deps);
  });

  // the gamestate table: register does NOT use checkGameState - it requires
  // REGISTRATION and turns every other state away itself
  it.each([
    [GAMESTATES.REGISTRATION, null],
    [GAMESTATES.ACTIVE, REJECTIONS.GAME_NOT_IN_REGISTRATION],
    [GAMESTATES.INACTIVE, REJECTIONS.GAME_NOT_IN_REGISTRATION],
    [GAMESTATES.SANDBOX, REJECTIONS.GAME_NOT_IN_REGISTRATION],
    [GAMESTATES.FINALE, REJECTIONS.GAME_NOT_IN_REGISTRATION],
    [GAMESTATES.OVER, REJECTIONS.GAME_NOT_IN_REGISTRATION],
    [GAMESTATES.DEV_PAUSED, REJECTIONS.GAME_NOT_IN_REGISTRATION],
    [GAMESTATES.TIMESTOPPED, REJECTIONS.GAME_NOT_IN_REGISTRATION],
  ])('gamestate %s -> %s', async (state, reason) => {
    const { deps } = happyDeps({ game: createFakeGame({ GAME_STATE: state }) });
    const result = await logic.run(INPUT, deps);
    if (reason === null) {
      expect(result.ok).toBe(true);
    } else {
      expect(result).toMatchObject({
        ok: false,
        reason,
        data: { message: 'Cannot register for games not in registration phase.' },
      });
      expectNoWrites(deps);
    }
  });

  it('covers every GAMESTATES value in the table above', () => {
    expect(Object.values(GAMESTATES)).toHaveLength(8);
  });

  // preserved quirk: the "game is full" gate reads game.playerMax, which is
  // not a Games column, so against the real schema it can never fire - a
  // packed game still accepts registrations. No boundary test is possible
  // without inventing a column.
  it('never rejects as full against the real schema (playerMax is not a column)', async () => {
    const { deps } = happyDeps({ playerCount: 999 });
    const result = await logic.run(INPUT, deps);
    expect(result.ok).toBe(true);
  });

  it('rejects a non-PNG icon with the legacy message and writes nothing', async () => {
    const { deps } = happyDeps();
    const result = await logic.run({ ...INPUT, icon: { ...PNG_ICON, contentType: 'image/jpeg' } }, deps);
    expect(result).toMatchObject({
      ok: false,
      reason: REJECTIONS.WRONG_TILE_TYPE,
      data: { message: 'The file is a image/jpeg file. Player icon must be a PNG file' },
    });
    expectNoWrites(deps);
  });

  // boundary: exactly 80x80 passes (success suite); one pixel off either
  // axis fails
  it.each([
    [80, 79],
    [79, 80],
    [81, 80],
    [160, 160],
  ])('rejects a %dx%d icon', async (width, height) => {
    const { deps } = happyDeps();
    const result = await logic.run({ ...INPUT, icon: { ...PNG_ICON, width, height } }, deps);
    expect(result).toMatchObject({
      ok: false,
      reason: REJECTIONS.INVALID_AMOUNT,
      data: { message: 'Player icon must be exactly 80x80 pixels' },
    });
    expectNoWrites(deps);
  });

  it('rejects an already registered player with the legacy message', async () => {
    const { deps } = happyDeps({ existingPlayer: createFakePlayer({ Discord_ID: ACTOR, Game_ID: 1 }) });
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({
      ok: false,
      reason: REJECTIONS.ALREADY_REGISTERED,
      data: { message: 'You are already registered in this game' },
    });
    expectNoWrites(deps);
  });

  // icon checks come after the game checks, as before: a bad icon for a
  // non-registering game reports the phase, not the icon
  it('reports the phase before the icon when both are wrong', async () => {
    const { deps } = happyDeps({ game: createFakeGame({ GAME_STATE: GAMESTATES.ACTIVE }) });
    const result = await logic.run({ ...INPUT, icon: { ...PNG_ICON, contentType: 'image/gif' } }, deps);
    expect(result.reason).toBe(REJECTIONS.GAME_NOT_IN_REGISTRATION);
  });
});

describe('register.run success', () => {
  it('registers via utils.registerPlayer with the plain icon', async () => {
    const { deps } = happyDeps();
    const result = await logic.run(INPUT, deps);
    expect(result).toEqual({ ok: true, kind: 'registered', data: { gameId: 1 } });
    expect(deps.utils.registerPlayer).toHaveBeenCalledWith(1, ACTOR, PNG_ICON);
    expect(deps.utils.registerPlayer).toHaveBeenCalledTimes(1);
    // all row creation happens inside registerPlayer; the command itself
    // writes nothing directly
    expect(deps.models.Players.create).not.toHaveBeenCalled();
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  // preserved quirk: the default game is the oldest REGISTRATION game across
  // ALL players - the legacy code passed null for the actor, not their id
  it('defaults to the oldest registering game, looked up without the actor', async () => {
    const { deps } = happyDeps();
    const result = await logic.run({ ...INPUT, gameId: null }, deps);
    expect(result.ok).toBe(true);
    expect(deps.utils.getOldestGamestateGameId).toHaveBeenCalledWith(null, GAMESTATES.REGISTRATION);
    expect(deps.utils.registerPlayer).toHaveBeenCalledWith(1, ACTOR, PNG_ICON);
  });

  it('uses the explicit game id without consulting the default lookup', async () => {
    const { deps } = happyDeps();
    await logic.run({ ...INPUT, gameId: 3 }, deps);
    expect(deps.utils.getOldestGamestateGameId).not.toHaveBeenCalled();
    expect(deps.utils.registerPlayer).toHaveBeenCalledWith(3, ACTOR, PNG_ICON);
  });

  // preserved quirk: a fault while checking for an existing registration
  // counted as "not registered", and registration proceeded
  it('proceeds when the existing-registration lookup throws', async () => {
    const { deps } = happyDeps();
    deps.models.Players.findOne = jest.fn(async () => { throw new Error('db went away'); });
    const result = await logic.run(INPUT, deps);
    expect(result.ok).toBe(true);
    expect(deps.utils.registerPlayer).toHaveBeenCalledWith(1, ACTOR, PNG_ICON);
  });

  it('lets registerPlayer faults throw to the central handler', async () => {
    const { deps } = happyDeps();
    deps.utils.registerPlayer = jest.fn(async () => {
      throw 'Failed to generate spawnpoint for Twin, please try again so a new class may be selected for you.';
    });
    await expect(logic.run(INPUT, deps)).rejects.toBe(
      'Failed to generate spawnpoint for Twin, please try again so a new class may be selected for you.',
    );
  });
});

describe('register.present', () => {
  // every rejection carries its byte-identical legacy string in data.message
  it.each([
    [REJECTIONS.NO_SUCH_GAME, { gameId: 1, message: 'Game not found. Please check the game ID.' }, 'Game not found. Please check the game ID.'],
    [REJECTIONS.GAME_NOT_IN_REGISTRATION, { message: 'Cannot register for games not in registration phase.' }, 'Cannot register for games not in registration phase.'],
    [REJECTIONS.TILE_FULL, { message: 'Game is full. Please try another game.' }, 'Game is full. Please try another game.'],
    [REJECTIONS.WRONG_TILE_TYPE, { message: 'The file is a image/jpeg file. Player icon must be a PNG file' }, 'The file is a image/jpeg file. Player icon must be a PNG file'],
    [REJECTIONS.INVALID_AMOUNT, { message: 'Player icon must be exactly 80x80 pixels' }, 'Player icon must be exactly 80x80 pixels'],
    [REJECTIONS.ALREADY_REGISTERED, { message: 'You are already registered in this game' }, 'You are already registered in this game'],
  ])('renders %s as its legacy message', (reason, data, expected) => {
    expect(logic.present({ ok: false, reason, data })).toEqual({ content: expected });
  });

  it('renders success with the legacy confirmation', () => {
    expect(logic.present({ ok: true, kind: 'registered', data: { gameId: 1 } })).toEqual({
      content: 'Player registered! Use the stats command to see where you are, your class, and your stats',
    });
  });
});

describe('register adapter (smoke)', () => {
  it('exports the command contract', () => {
    expect(register.data.toJSON().name).toBe('register');
    expect(typeof register.execute).toBe('function');
  });
});
