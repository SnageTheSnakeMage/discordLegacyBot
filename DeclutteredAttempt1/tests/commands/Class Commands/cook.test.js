/**
 * /cook - logic tests. Plain data in, plain data out: no jest.mock, no
 * discord.js, no interaction. deps carries fake models; utils logic is real.
 */
const logic = require('../../../commands/Class Commands/cook.logic.js');
const cook = require('../../../commands/Class Commands/cook.js');
const { GAMESTATES, REJECTIONS } = require('../../../enums.js');
const {
  createDeps, createFakeGame, createFakePlayer, createFakeClass, createFakeTile,
} = require('../../helpers/mockModels.js');

const CHEF = '123';
const CUSTOMER = '456';

/** deps for the happy path; override per test */
function happyDeps(over = {}) {
  const chef = over.chef || createFakePlayer({ Player_ID: 1, Discord_ID: CHEF, Action_Points: 5, Range_: 3, Tile_ID: 1, Meals: 1 });
  const customer = over.customer || createFakePlayer({ Player_ID: 2, Discord_ID: CUSTOMER, Action_Points: 2, Health_Points: 5, Tile_ID: 2 });
  const game = over.game || createFakeGame({ GAME_STATE: GAMESTATES.ACTIVE });
  const chefTile = over.chefTile || createFakeTile({ Tile_ID: 1, X_Position: 1, Y_Position: 1, Layer_ID: 1 });
  const customerTile = over.customerTile || createFakeTile({ Tile_ID: 2, X_Position: 2, Y_Position: 1, Layer_ID: 1 });
  const deps = createDeps({
    models: {
      Games: { findByPk: async () => game },
      Players: {
        findOne: async ({ where }) => (where.Discord_ID === CHEF ? chef : where.Discord_ID === CUSTOMER ? customer : null),
      },
      Classes: { findByPk: async () => over.chefClass || createFakeClass({ Class_Name: 'Chef' }) },
      Tiles: {
        findByPk: async (id) => (id === chefTile.Tile_ID ? chefTile : id === customerTile.Tile_ID ? customerTile : null),
        // the (Layer_ID, x, y) lookup for the coordinates the chef typed
        findOne: async ({ where }) => {
          for (const tile of [chefTile, customerTile]) {
            if (tile.Layer_ID === where.Layer_ID && tile.X_Position === where.X_Position && tile.Y_Position === where.Y_Position) return tile;
          }
          return null;
        },
      },
    },
  });
  return { deps, chef, customer, game };
}

const INPUT = { customerDiscordId: CUSTOMER, customerUsername: 'hungrybob', x: 2, y: 1, gameId: 1, discordId: CHEF };

describe('cook.parse', () => {
  it('maps raw options and applies defaults', () => {
    const input = logic.parse(
      { customer: CUSTOMER, customerUsername: 'hungrybob', x: 2, y: 1, game: null },
      { discordId: CHEF, username: 'gordon' },
    );
    expect(input).toEqual({ customerDiscordId: CUSTOMER, customerUsername: 'hungrybob', x: 2, y: 1, gameId: null, discordId: CHEF });
  });

  it('passes an explicit game through', () => {
    const input = logic.parse(
      { customer: CUSTOMER, customerUsername: 'hungrybob', x: 2, y: 1, game: 7 },
      { discordId: CHEF, username: 'gordon' },
    );
    expect(input.gameId).toBe(7);
  });
});

describe('cook.run rejections', () => {
  it('rejects an unknown game and writes nothing', async () => {
    const { deps } = happyDeps();
    deps.models.Games.findByPk = jest.fn(async () => null);
    const result = await logic.run(INPUT, deps);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe(REJECTIONS.NO_SUCH_GAME);
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  it('rejects a chef who is not in the game', async () => {
    const { deps, customer } = happyDeps();
    deps.models.Players.findOne = jest.fn(async ({ where }) => (where.Discord_ID === CUSTOMER ? customer : null));
    const result = await logic.run(INPUT, deps);
    expect(result.reason).toBe(REJECTIONS.NOT_IN_GAME);
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  it('rejects a customer who is not in the game', async () => {
    const { deps, chef } = happyDeps();
    deps.models.Players.findOne = jest.fn(async ({ where }) => (where.Discord_ID === CHEF ? chef : null));
    const result = await logic.run(INPUT, deps);
    expect(result.reason).toBe(REJECTIONS.TARGET_NOT_IN_GAME);
    expect(deps.models.Players.update).not.toHaveBeenCalled();
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
    const { deps } = happyDeps({ game: createFakeGame({ GAME_STATE: state }) });
    const result = await logic.run(INPUT, deps);
    if (reason === null) {
      expect(result.ok).toBe(true);
    } else {
      expect(result).toMatchObject({ ok: false, reason });
      expect(deps.models.Players.update).not.toHaveBeenCalled();
    }
  });

  // preserved quirk: the old code hard-coded isClockwatcher=false, so even a
  // Clockwatcher is blocked during a timestop (they fail the Chef gate anyway)
  it('blocks a Clockwatcher during a timestop (isClockwatcher hard-coded false)', async () => {
    const { deps } = happyDeps({
      game: createFakeGame({ GAME_STATE: GAMESTATES.TIMESTOPPED }),
      chefClass: createFakeClass({ Class_Name: 'Clockwatcher' }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result.reason).toBe(REJECTIONS.TIME_STOPPED);
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  it('rejects a non-Chef', async () => {
    const { deps } = happyDeps({ chefClass: createFakeClass({ Class_Name: 'Doctor' }) });
    const result = await logic.run(INPUT, deps);
    expect(result.reason).toBe(REJECTIONS.WRONG_CLASS);
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  it('rejects coordinates that are not on the board', async () => {
    const { deps } = happyDeps();
    const result = await logic.run({ ...INPUT, x: 9, y: 9 }, deps);
    expect(result.reason).toBe(REJECTIONS.NO_SUCH_TILE);
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  it('rejects when the customer is not on the tile provided', async () => {
    const { deps } = happyDeps({
      customer: createFakePlayer({ Player_ID: 2, Discord_ID: CUSTOMER, Action_Points: 2, Health_Points: 5, Tile_ID: 3 }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result.reason).toBe(REJECTIONS.TARGET_NOT_ON_TILE);
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  it('rejects a customer one tile beyond range (boundary: one beyond)', async () => {
    // line length from (1,1) to (4,1) is 4 tiles (start tile counted) > Range_ 3
    const { deps } = happyDeps({
      customerTile: createFakeTile({ Tile_ID: 2, X_Position: 4, Y_Position: 1, Layer_ID: 1 }),
    });
    const result = await logic.run({ ...INPUT, x: 4, y: 1 }, deps);
    expect(result.reason).toBe(REJECTIONS.OUT_OF_RANGE);
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  it('accepts a customer exactly at max range (boundary: exact)', async () => {
    // line length from (1,1) to (3,1) is 3 tiles = Range_ 3
    const { deps } = happyDeps({
      customerTile: createFakeTile({ Tile_ID: 2, X_Position: 3, Y_Position: 1, Layer_ID: 1 }),
    });
    const result = await logic.run({ ...INPUT, x: 3, y: 1 }, deps);
    expect(result.ok).toBe(true);
  });

  it('rejects a chef with zero meals (boundary: one short)', async () => {
    const { deps } = happyDeps({
      chef: createFakePlayer({ Player_ID: 1, Discord_ID: CHEF, Action_Points: 5, Range_: 3, Tile_ID: 1, Meals: 0 }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result.reason).toBe(REJECTIONS.NOT_ENOUGH_MEALS);
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  it('accepts a chef with exactly one meal (boundary: exact)', async () => {
    const { deps } = happyDeps({
      chef: createFakePlayer({ Player_ID: 1, Discord_ID: CHEF, Action_Points: 5, Range_: 3, Tile_ID: 1, Meals: 1 }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result.ok).toBe(true);
  });
});

describe('cook.run success', () => {
  it('feeds the customer and pays the chef with exact write payloads', async () => {
    const { deps } = happyDeps();
    const result = await logic.run(INPUT, deps);
    expect(result).toEqual({ ok: true, kind: 'cooked', data: { customerUsername: 'hungrybob' } });
    expect(deps.models.Players.update).toHaveBeenCalledWith(
      { Action_Points: 4 }, // customer: 2 + 2
      { where: { Player_ID: 2 } },
    );
    expect(deps.models.Players.update).toHaveBeenCalledWith(
      { Health_Points: 6 }, // customer: 5 + 1
      { where: { Player_ID: 2 } },
    );
    expect(deps.models.Players.update).toHaveBeenCalledWith(
      { Action_Points: 6, Meals: 0 }, // chef: 5 + 1 AP, 1 - 1 meals
      { where: { Player_ID: 1 } },
    );
    expect(deps.models.Players.update).toHaveBeenCalledTimes(3);
  });

  // preserved quirk: the old code never checked Dead, so a dead chef cooks
  it('lets a dead chef cook (no Dead check in the legacy command)', async () => {
    const { deps } = happyDeps({
      chef: createFakePlayer({ Player_ID: 1, Discord_ID: CHEF, Action_Points: 5, Range_: 3, Tile_ID: 1, Meals: 1, Dead: true }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result.ok).toBe(true);
  });

  // preserved quirk: the customer's AP/HP gains are not clamped to MAX_AP/MAX_HP
  it('clamps the customer at MAX_AP and MAX_HP', async () => {
    const { deps } = happyDeps({
      customer: createFakePlayer({ Player_ID: 2, Discord_ID: CUSTOMER, Action_Points: 9, MAX_AP: 10, Health_Points: 10, MAX_HP: 10, Tile_ID: 2 }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result.ok).toBe(true);
    expect(deps.models.Players.update).toHaveBeenCalledWith(
      { Action_Points: 10 }, // 9 + 2 clamped to MAX_AP 10
      { where: { Player_ID: 2 } },
    );
    expect(deps.models.Players.update).toHaveBeenCalledWith(
      { Health_Points: 10 }, // 10 + 1 clamped to MAX_HP 10
      { where: { Player_ID: 2 } },
    );
  });

  // preserved quirk: the legacy default-game lookup passed no discord id
  it('resolves the default game via getOldestGameId with no argument', async () => {
    const { deps } = happyDeps();
    deps.utils = { ...deps.utils, getOldestGameId: jest.fn(async () => 1) };
    const result = await logic.run({ ...INPUT, gameId: null }, deps);
    expect(result.ok).toBe(true);
    expect(deps.utils.getOldestGameId).toHaveBeenCalledWith();
  });
});

describe('cook.present', () => {
  it('renders the meals rejection with the exact legacy wording', () => {
    const out = logic.present({ ok: false, reason: REJECTIONS.NOT_ENOUGH_MEALS });
    expect(out).toEqual({ content: "You don't have enough ingriedients for a meal! Wait until next AP distribution" });
  });

  it('renders the not-in-game rejection with the exact legacy wording', () => {
    const out = logic.present({ ok: false, reason: REJECTIONS.NOT_IN_GAME, data: { message: 'You are not in the game!' } });
    expect(out).toEqual({ content: 'You are not in the game!' });
  });

  it('renders the customer-targeting rejections with the exact legacy wording', () => {
    expect(logic.present({ ok: false, reason: REJECTIONS.TARGET_NOT_IN_GAME, data: { role: 'customer' } }))
      .toEqual({ content: 'The customer is not in the game!' });
    expect(logic.present({ ok: false, reason: REJECTIONS.TARGET_NOT_ON_TILE, data: { role: 'customer' } }))
      .toEqual({ content: 'The customer is not on the tile provided!' });
    expect(logic.present({ ok: false, reason: REJECTIONS.OUT_OF_RANGE, data: { role: 'customer' } }))
      .toEqual({ content: 'Your customer is not in range!' });
    expect(logic.present({ ok: false, reason: REJECTIONS.WRONG_CLASS, data: { className: 'Chef' } }))
      .toEqual({ content: 'You are not a Chef!' });
  });

  it('renders success with the exact legacy wording', () => {
    const out = logic.present({ ok: true, kind: 'cooked', data: { customerUsername: 'hungrybob' } });
    expect(out).toEqual({ content: 'You have cooked for hungrybob giving them 2 AP & 1 HP and yourself 1 AP!' });
  });
});

describe('cook adapter (smoke)', () => {
  it('exports the command contract', () => {
    expect(cook.data.toJSON().name).toBe('cook');
    expect(typeof cook.execute).toBe('function');
  });
});
