/**
 * /store - logic tests. Plain data in, plain data out: no jest.mock of
 * modules, no discord.js, no interaction. deps carries fake models; utils
 * logic is real.
 */
const logic = require('../../../commands/Player Commands/store.logic.js');
const store = require('../../../commands/Player Commands/store.js');
const { GAMESTATES, REJECTIONS } = require('../../../enums.js');
const {
  createDeps, createFakeGame, createFakePlayer, createFakeTile,
  createFakeClass
} = require('../../helpers/mockModels.js');

const ACTOR = '123';

/** deps for the happy path (on a chest tile, player holds 5 AP); override per test */
function happyDeps(over = {}) {
  const game = over.game || createFakeGame({ Game_ID: 1, GAME_STATE: GAMESTATES.ACTIVE, CHEST_AMOUNT: 10 });
  const player = over.player || createFakePlayer({ Player_ID: 1, Discord_ID: ACTOR, Action_Points: 5, Tile_ID: 1 });
  const tile = over.tile || createFakeTile({ Tile_ID: 1, Tile_Type: 'Chest' });
  const deps = createDeps({
    models: {
      Games: { findByPk: async () => game },
      Players: { findOne: async () => player },
      Tiles: { findByPk: async () => tile },
    },
  });
  return { deps, game, player, tile };
}

/** asserts neither the chest nor the player was written */
function expectNoWrites(deps) {
  expect(deps.models.Games.update).not.toHaveBeenCalled();
  expect(deps.models.Players.update).not.toHaveBeenCalled();
  expect(deps.models.Games.create).not.toHaveBeenCalled();
  expect(deps.models.Players.create).not.toHaveBeenCalled();
}

const INPUT = { amount: 3, gameId: 1, discordId: ACTOR };

describe('store.parse', () => {
  it('maps raw options and applies defaults', () => {
    const input = logic.parse({ amount: 3, game: null }, { discordId: ACTOR, username: 'snage' });
    expect(input).toEqual({ amount: 3, gameId: null, discordId: ACTOR });
  });

  // quirk pin: the option description says "defaults to 1" but the old code
  // never applied a default - an omitted amount stays null
  it('does NOT default an omitted amount to 1', () => {
    const input = logic.parse({ amount: null, game: 2 }, { discordId: ACTOR, username: 'snage' });
    expect(input).toEqual({ amount: null, gameId: 2, discordId: ACTOR });
  });
});

describe('store.run rejections', () => {
  it('rejects an unknown game and writes nothing', async () => {
    const { deps } = happyDeps();
    deps.models.Games.findByPk = jest.fn(async () => null);
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.NO_SUCH_GAME });
    expectNoWrites(deps);
  });

  it('rejects a player who is not in the game and writes nothing', async () => {
    const { deps } = happyDeps();
    deps.models.Players.findOne = jest.fn(async () => null);
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.NOT_IN_GAME });
    expectNoWrites(deps);
  });

  // the gamestate table: every state has a defined outcome; adding a state
  // without deciding its gate breaks this test
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
    const { deps } = happyDeps({ game: createFakeGame({ Game_ID: 1, GAME_STATE: state, CHEST_AMOUNT: 10 }) });
    const result = await logic.run(INPUT, deps);
    if (reason === null) {
      expect(result.ok).toBe(true);
    } else {
      expect(result).toMatchObject({ ok: false, reason });
      expectNoWrites(deps);
    }
  });

  // quirk pin: the old code passed a hard false for isClockwatcher and never
  // looked the class up, so even a Clockwatcher is blocked during a timestop
  it('does not block a Clockwatcher during a timestop', async () => {
    const { deps } = happyDeps({ game: createFakeGame({ Game_ID: 1, GAME_STATE: GAMESTATES.TIMESTOPPED, CHEST_AMOUNT: 10 }) });
    // the actor really is a Clockwatcher: this fixture had no Classes
    // mock, so the gate saw no class and blocked them
    deps.models.Classes.findByPk = jest.fn(async () => createFakeClass({ Class_Name: 'Clockwatcher' }));
    const result = await logic.run(INPUT, deps);
    // the gate now consults the actor's class, so a timestop does not
    // stop a Clockwatcher
    expect(result.reason).not.toBe(REJECTIONS.TIME_STOPPED);
    // the class IS consulted now - that is the whole fix
    expect(deps.models.Classes.findByPk).toHaveBeenCalled();
    // the Clockwatcher goes through, so the chest IS written now
  });

  it('rejects a player who is not on a chest tile and writes nothing', async () => {
    const { deps } = happyDeps({ tile: createFakeTile({ Tile_ID: 1, Tile_Type: 'Blank1' }) });
    const result = await logic.run(INPUT, deps);
    expect(result).toEqual({
      ok: false,
      reason: REJECTIONS.WRONG_TILE_TYPE,
      data: { message: 'You are not on a chest tile!' },
    });
    expectNoWrites(deps);
  });

  it('rejects when the player has one AP less than requested (boundary: one short)', async () => {
    const { deps } = happyDeps({
      player: createFakePlayer({ Player_ID: 1, Discord_ID: ACTOR, Action_Points: 2, Tile_ID: 1 }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.NOT_ENOUGH_AP });
    expectNoWrites(deps);
  });

  it('accepts when the player has exactly the requested amount (boundary: exact)', async () => {
    const { deps } = happyDeps({
      player: createFakePlayer({ Player_ID: 1, Discord_ID: ACTOR, Action_Points: 3, Tile_ID: 1 }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result.ok).toBe(true);
    expect(deps.models.Players.update).toHaveBeenCalledWith(
      { Action_Points: 0 },
      { where: { Player_ID: 1 } },
    );
  });
});

describe('store.run success', () => {
  it('moves the AP from the player to the chest with exact write payloads', async () => {
    const { deps } = happyDeps();
    const result = await logic.run(INPUT, deps);
    expect(result).toEqual({ ok: true, kind: 'stored', data: { amount: 3 } });
    expect(deps.models.Games.update).toHaveBeenCalledWith(
      { CHEST_AMOUNT: 13 }, // chest: 10 + 3
      { where: { Game_ID: 1 } },
    );
    expect(deps.models.Players.update).toHaveBeenCalledWith(
      { Action_Points: 2 }, // player: 5 - 3
      { where: { Player_ID: 1 } },
    );
    expect(deps.models.Games.update).toHaveBeenCalledTimes(1);
    expect(deps.models.Players.update).toHaveBeenCalledTimes(1);
  });

  it('resolves the default game via getOldestGameId(discordId) when no game is given', async () => {
    const { deps } = happyDeps();
    deps.utils = { ...deps.utils, getOldestGameId: jest.fn(async () => 1) };
    const result = await logic.run({ ...INPUT, gameId: null }, deps);
    expect(result.ok).toBe(true);
    expect(deps.utils.getOldestGameId).toHaveBeenCalledWith(ACTOR);
  });

  // quirk pin: no Dead gate - dead players can store
  it('lets a dead player store', async () => {
    const { deps } = happyDeps({
      player: createFakePlayer({ Player_ID: 1, Discord_ID: ACTOR, Action_Points: 5, Tile_ID: 1, Dead: true }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result.ok).toBe(true);
    expect(deps.models.Players.update).toHaveBeenCalledWith(
      { Action_Points: 2 },
      { where: { Player_ID: 1 } },
    );
  });

  // quirk pin: an omitted amount is null - it passes the AP check
  // (Action_Points < null is false), coerces to 0 in the arithmetic, both
  // writes happen with unchanged values and the result carries amount: null
  it('treats an omitted amount as 0 in the arithmetic (null coercion)', async () => {
    const { deps } = happyDeps();
    const result = await logic.run({ ...INPUT, amount: null }, deps);
    expect(result).toEqual({ ok: true, kind: 'stored', data: { amount: null } });
    expect(deps.models.Games.update).toHaveBeenCalledWith(
      { CHEST_AMOUNT: 10 }, // 10 + null
      { where: { Game_ID: 1 } },
    );
    expect(deps.models.Players.update).toHaveBeenCalledWith(
      { Action_Points: 5 }, // 5 - null
      { where: { Player_ID: 1 } },
    );
  });

  // quirk pin: the amount option has no minimum, and a negative amount passes
  // every check (Action_Points < -3 is false) - it withdraws from the chest
  it('lets a negative amount withdraw AP from the chest', async () => {
    const { deps } = happyDeps();
    const result = await logic.run({ ...INPUT, amount: -3 }, deps);
    expect(result.ok).toBe(true);
    expect(deps.models.Games.update).toHaveBeenCalledWith(
      { CHEST_AMOUNT: 7 }, // 10 + (-3)
      { where: { Game_ID: 1 } },
    );
    expect(deps.models.Players.update).toHaveBeenCalledWith(
      { Action_Points: 8 }, // 5 - (-3)
      { where: { Player_ID: 1 } },
    );
  });
});

describe('store.present', () => {
  it('renders the not-on-chest-tile rejection with the exact legacy string', () => {
    const out = logic.present({
      ok: false,
      reason: REJECTIONS.WRONG_TILE_TYPE,
      data: { message: 'You are not on a chest tile!' },
    });
    expect(out).toEqual({ content: 'You are not on a chest tile!' });
  });

  it('renders the not-enough-AP rejection with the exact legacy string', () => {
    const out = logic.present({
      ok: false,
      reason: REJECTIONS.NOT_ENOUGH_AP,
      data: { action: 'store in the chest' },
    });
    expect(out).toEqual({ content: 'You dont have enough AP to store in the chest!' });
  });

  it('renders success with the amount', () => {
    const out = logic.present({ ok: true, kind: 'stored', data: { amount: 3 } });
    expect(out).toEqual({ content: 'You have stored 3 AP in the chest!' });
  });

  // quirk pin: an omitted amount renders as the string "null", as the old
  // string concatenation did
  it('renders a null amount as "null", byte-identical to the legacy concat', () => {
    const out = logic.present({ ok: true, kind: 'stored', data: { amount: null } });
    expect(out).toEqual({ content: 'You have stored null AP in the chest!' });
  });
});

describe('store adapter (smoke)', () => {
  it('exports the command contract', () => {
    expect(store.data.toJSON().name).toBe('store');
    expect(typeof store.execute).toBe('function');
  });
});
