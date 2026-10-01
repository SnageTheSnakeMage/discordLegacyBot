/**
 * /store - logic tests. Plain data in, plain data out: no jest.mock of
 * modules, no discord.js, no interaction. deps carries fake models; utils
 * logic is real.
 */
const logic = require('../../../commands/Player Commands/store.logic.js');
const { GAMESTATES, REJECTIONS } = require('../../../enums.js');
const {
  createDeps,
  createFakeGame,
  createFakePlayer,
  createFakeTile,
  createFakeClass,
  expectNoWrites,
} = require('../../helpers/mockModels.js');
const { everyCase } = require('../../helpers/everyCase.js');

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


const INPUT = { amount: 3, gameId: 1, discordId: ACTOR };

describe('store.parse', () => {
  it('maps raw options and applies defaults', () => {
    const input = logic.parse({ amount: 3, game: null }, { discordId: ACTOR, username: 'snage' });
    expect(input).toEqual({ amount: 3, gameId: null, discordId: ACTOR });
  });

  it('defaults an omitted amount to 1', () => {
    const input = logic.parse({ amount: null, game: 2 }, { discordId: ACTOR, username: 'snage' });
    expect(input).toEqual({ amount: 1, gameId: 2, discordId: ACTOR });
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

  // The state -> verdict table belongs to utils.checkGameState, and
  // tests/utils.pure.test.js walks every state in the enum - including a
  // newly added one. What is this command's own is only that run() asks the
  // gate and returns its verdict without writing, so one state that passes,
  // one that blocks, and the timestop (whose answer depends on the
  // isClockwatcher argument this command passes) cover it here.
  it('returns the gamestate gate\'s verdict for every game, writing nothing when it blocks', async () => {
    expect(await everyCase('game %o -> %s', [
      [{ GAME_STATE: GAMESTATES.ACTIVE }, null],
      [{ GAME_STATE: GAMESTATES.OVER }, REJECTIONS.GAME_OVER],
      [{ GAME_STATE: GAMESTATES.ACTIVE, timeStopped: true }, REJECTIONS.TIME_STOPPED],
    ], async (condition, reason) => {
      const { deps } = happyDeps({ game: createFakeGame({ Game_ID: 1, ...condition, CHEST_AMOUNT: 10 }) });
      const result = await logic.run(INPUT, deps);
      if (reason === null) {
        expect(result.ok).toBe(true);
      } else {
        expect(result).toMatchObject({ ok: false, reason });
        expectNoWrites(deps);
      }
    })).toEqual([]);
  });

  // the gate consults the actor's class, so a timestop does not stop a
  // Clockwatcher
  it('does not block a Clockwatcher during a timestop', async () => {
    const { deps } = happyDeps({ game: createFakeGame({ Game_ID: 1, GAME_STATE: GAMESTATES.ACTIVE, timeStopped: true, CHEST_AMOUNT: 10 }) });
    // the actor really is a Clockwatcher: without a Classes mock the gate
    // sees no class and blocks them
    deps.models.Classes.findByPk = jest.fn(async () => createFakeClass({ Class_Name: 'Clockwatcher' }));
    const result = await logic.run(INPUT, deps);
    expect(result.reason).not.toBe(REJECTIONS.TIME_STOPPED);
    expect(deps.models.Classes.findByPk).toHaveBeenCalled();
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

  // there is no Dead gate - dead players can store
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

});

describe('store.present', () => {
  it('renders the not-on-chest-tile rejection with its exact string', () => {
    const out = logic.present({
      ok: false,
      reason: REJECTIONS.WRONG_TILE_TYPE,
      data: { message: 'You are not on a chest tile!' },
    });
    expect(out).toEqual({ content: 'You are not on a chest tile!' });
  });

  it('renders the not-enough-AP rejection with its exact string', () => {
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

  // an omitted amount renders as the string "null" through string
  // concatenation
  it('renders a null amount as "null", exactly', () => {
    const out = logic.present({ ok: true, kind: 'stored', data: { amount: null } });
    expect(out).toEqual({ content: 'You have stored null AP in the chest!' });
  });
});
