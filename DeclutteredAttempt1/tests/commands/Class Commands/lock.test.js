/**
 * /lock - logic tests. Plain data in, plain data out: no jest.mock, no
 * discord.js, no interaction. deps carries fake models; utils logic is real
 * (the range test really runs getTileCordinatesOfLine).
 */
const logic = require('../../../commands/Class Commands/lock.logic.js');
const lock = require('../../../commands/Class Commands/lock.js');
const { GAMESTATES, REJECTIONS } = require('../../../enums.js');
const {
  createDeps, createFakeGame, createFakePlayer, createFakeClass, createFakeTile,
} = require('../../helpers/mockModels.js');

const ACTOR = '123';

/**
 * Happy path: a Guardian at (1,1) with 5 AP and Range_ 3, an open gateway at
 * (3,1) on the same layer (3 tiles inclusive - exactly at range), and a
 * second open gateway on the layer so the finale rule does not bite.
 */
function happyDeps(over = {}) {
  const game = over.game || createFakeGame({ Game_ID: 1, GAME_STATE: GAMESTATES.ACTIVE });
  const player = over.player || createFakePlayer({
    Player_ID: 7, Game_ID: 1, Discord_ID: ACTOR, Class_ID: 4, Action_Points: 5, Range_: 3, Tile_ID: 1,
  });
  const playerClass = over.playerClass === undefined
    ? createFakeClass({ Class_ID: 4, Class_Name: 'Guardian' })
    : over.playerClass;
  const playerTile = over.playerTile === undefined
    ? createFakeTile({ Tile_ID: 1, X_Position: 1, Y_Position: 1, Layer_ID: 1 })
    : over.playerTile;
  const tileToChange = over.tileToChange === undefined
    ? createFakeTile({ Tile_ID: 42, X_Position: 3, Y_Position: 1, Layer_ID: 1, Tile_Type: 'Gateway_Open' })
    : over.tileToChange;
  const layersTiles = over.layersTiles || [
    tileToChange,
    createFakeTile({ Tile_ID: 43, X_Position: 5, Y_Position: 5, Layer_ID: 1, Tile_Type: 'Gateway_Open' }),
  ].filter(Boolean);

  const deps = createDeps({
    models: {
      Games: { findByPk: async () => game },
      Players: { findOne: async () => player },
      Classes: { findByPk: async () => playerClass },
      Tiles: {
        findByPk: async () => playerTile,
        findOne: async () => tileToChange,
        findAll: async () => layersTiles,
      },
    },
  });
  return { deps, game, player, playerClass, playerTile, tileToChange };
}

const INPUT = { x: 3, y: 1, gameId: 1, discordId: ACTOR };

/** every rejection must leave the database untouched */
function expectNoWrites(deps) {
  expect(deps.models.Tiles.update).not.toHaveBeenCalled();
  expect(deps.models.Players.update).not.toHaveBeenCalled();
  expect(deps.models.Tiles.create).not.toHaveBeenCalled();
  expect(deps.models.Players.create).not.toHaveBeenCalled();
}

describe('lock.parse', () => {
  it('maps raw options and applies defaults', () => {
    const input = logic.parse({ x: 4, y: 2, game: null }, { discordId: ACTOR, username: 'snage' });
    expect(input).toEqual({ x: 4, y: 2, gameId: null, discordId: ACTOR });
  });

  it('keeps an explicit game id', () => {
    const input = logic.parse({ x: 1, y: 1, game: 9 }, { discordId: ACTOR, username: 'snage' });
    expect(input.gameId).toBe(9);
  });
});

describe('lock.run rejections', () => {
  it('rejects an unknown game and writes nothing', async () => {
    const { deps } = happyDeps();
    deps.models.Games.findByPk = jest.fn(async () => null);
    const result = await logic.run(INPUT, deps);
    expect(result).toEqual({ ok: false, reason: REJECTIONS.NO_SUCH_GAME, data: { gameId: 1 } });
    expectNoWrites(deps);
  });

  it('rejects a player who is not in the game', async () => {
    const { deps } = happyDeps();
    deps.models.Players.findOne = jest.fn(async () => null);
    const result = await logic.run(INPUT, deps);
    expect(result.reason).toBe(REJECTIONS.NOT_IN_GAME);
    expectNoWrites(deps);
  });

  it('rejects when the player has no tile of their own', async () => {
    const { deps } = happyDeps({ playerTile: null });
    const result = await logic.run(INPUT, deps);
    expect(result.reason).toBe(REJECTIONS.NO_SUCH_TILE);
    expectNoWrites(deps);
  });

  it('rejects when there is no tile at the given coordinates', async () => {
    const { deps } = happyDeps({ tileToChange: null });
    const result = await logic.run(INPUT, deps);
    expect(result).toEqual({
      ok: false,
      reason: REJECTIONS.NO_SUCH_TILE,
      data: { message: 'Could not find a gateway to lock at the given coordinates.' },
    });
    expectNoWrites(deps);
  });

  it('rejects a non-Guardian', async () => {
    const { deps } = happyDeps({ playerClass: createFakeClass({ Class_ID: 4, Class_Name: 'Average' }) });
    const result = await logic.run(INPUT, deps);
    expect(result).toEqual({ ok: false, reason: REJECTIONS.WRONG_CLASS, data: { className: 'Guardian' } });
    expectNoWrites(deps);
  });

  it('rejects when the class row is missing instead of crashing', async () => {
    const { deps } = happyDeps({ playerClass: null });
    const result = await logic.run(INPUT, deps);
    expect(result.reason).toBe(REJECTIONS.WRONG_CLASS);
    expectNoWrites(deps);
  });

  it('rejects a tile that is not a gateway', async () => {
    const { deps } = happyDeps({
      tileToChange: createFakeTile({ Tile_ID: 42, X_Position: 3, Y_Position: 1, Layer_ID: 1, Tile_Type: 'Blank1' }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result).toEqual({
      ok: false,
      reason: REJECTIONS.WRONG_TILE_TYPE,
      data: { message: 'You cannot lock a non-gateway tile!' },
    });
    expectNoWrites(deps);
  });

  it('rejects a gateway out of range (boundary: one beyond)', async () => {
    // (1,1) -> (4,1) is 4 tiles inclusive, Range_ is 3
    const { deps } = happyDeps();
    const result = await logic.run({ ...INPUT, x: 4 }, deps);
    expect(result).toEqual({
      ok: false,
      reason: REJECTIONS.OUT_OF_RANGE,
      data: { message: 'You are not in range of the tile you want to lock/unlock!' },
    });
    expectNoWrites(deps);
  });

  it('accepts a gateway exactly at range (boundary: exact)', async () => {
    // (1,1) -> (3,1) is 3 tiles inclusive, Range_ is 3
    const { deps } = happyDeps();
    const result = await logic.run(INPUT, deps);
    expect(result.ok).toBe(true);
  });

  it('rejects when the player is one AP short (boundary: one short)', async () => {
    const { deps } = happyDeps({
      player: createFakePlayer({ Player_ID: 7, Discord_ID: ACTOR, Class_ID: 4, Action_Points: 1, Range_: 3, Tile_ID: 1 }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result).toEqual({
      ok: false,
      reason: REJECTIONS.NOT_ENOUGH_AP,
      data: { action: 'lock/unlock a tile' },
    });
    expectNoWrites(deps);
  });

  it('accepts with exactly the 2 AP the lock costs (boundary: exact)', async () => {
    const { deps } = happyDeps({
      player: createFakePlayer({ Player_ID: 7, Discord_ID: ACTOR, Class_ID: 4, Action_Points: 2, Range_: 3, Tile_ID: 1 }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result.ok).toBe(true);
    expect(deps.models.Players.update).toHaveBeenCalledWith(
      { Action_Points: 0 }, { where: { Player_ID: 7 } },
    );
  });

  it('rejects locking the last open gateway of a layer during a finale', async () => {
    const gateway = createFakeTile({ Tile_ID: 42, X_Position: 3, Y_Position: 1, Layer_ID: 1, Tile_Type: 'Gateway_Open' });
    const { deps } = happyDeps({
      game: createFakeGame({ Game_ID: 1, GAME_STATE: GAMESTATES.FINALE }),
      tileToChange: gateway,
      layersTiles: [gateway, createFakeTile({ Tile_ID: 43, Tile_Type: 'Gateway_Locked' })],
    });
    const result = await logic.run(INPUT, deps);
    expect(result).toEqual({
      ok: false,
      reason: REJECTIONS.WRONG_TILE_TYPE,
      data: { message: 'You cannot lock the last open gateway in the layer during a finale!' },
    });
    expectNoWrites(deps);
  });

  it('still allows UNlocking during a finale when only one gateway is open', async () => {
    const locked = createFakeTile({ Tile_ID: 42, X_Position: 3, Y_Position: 1, Layer_ID: 1, Tile_Type: 'Gateway_Locked' });
    const { deps } = happyDeps({
      game: createFakeGame({ Game_ID: 1, GAME_STATE: GAMESTATES.FINALE }),
      tileToChange: locked,
      layersTiles: [locked, createFakeTile({ Tile_ID: 43, Tile_Type: 'Gateway_Open' })],
    });
    const result = await logic.run(INPUT, deps);
    expect(result.ok).toBe(true);
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
    const { deps } = happyDeps({ game: createFakeGame({ Game_ID: 1, GAME_STATE: state }) });
    const result = await logic.run(INPUT, deps);
    if (reason === null) {
      expect(result.ok).toBe(true);
    } else {
      expect(result).toMatchObject({ ok: false, reason });
      expectNoWrites(deps);
    }
  });

  it('blocks a Guardian during a timestop (the gate is asked with isClockwatcher false)', async () => {
    const { deps } = happyDeps({ game: createFakeGame({ Game_ID: 1, GAME_STATE: GAMESTATES.TIMESTOPPED }) });
    const result = await logic.run(INPUT, deps);
    expect(result.reason).toBe(REJECTIONS.TIME_STOPPED);
    expectNoWrites(deps);
  });
});

describe('lock.run success', () => {
  it('locks an open gateway with exact write payloads', async () => {
    const { deps } = happyDeps();
    const result = await logic.run(INPUT, deps);
    expect(result).toEqual({
      ok: true,
      kind: 'locked',
      data: { tileType: 'Gateway_Open', newTileType: 'Gateway_Locked', x: 3, y: 1, layerId: 1 },
    });
    expect(deps.models.Tiles.update).toHaveBeenCalledWith(
      { Tile_Type: 'Gateway_Locked' }, { where: { Tile_ID: 42 } },
    );
    expect(deps.models.Players.update).toHaveBeenCalledWith(
      { Action_Points: 3 }, { where: { Player_ID: 7 } },
    );
    expect(deps.models.Tiles.update).toHaveBeenCalledTimes(1);
    expect(deps.models.Players.update).toHaveBeenCalledTimes(1);
  });

  it('unlocks a locked gateway with exact write payloads', async () => {
    const { deps } = happyDeps({
      tileToChange: createFakeTile({ Tile_ID: 42, X_Position: 3, Y_Position: 1, Layer_ID: 1, Tile_Type: 'Gateway_Locked' }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result.data.newTileType).toBe('Gateway_Open');
    expect(deps.models.Tiles.update).toHaveBeenCalledWith(
      { Tile_Type: 'Gateway_Open' }, { where: { Tile_ID: 42 } },
    );
  });

  it('resolves the default game via getOldestGameId when no game is given', async () => {
    const { deps } = happyDeps();
    deps.utils = { ...deps.utils, getOldestGameId: jest.fn(async () => 1) };
    const result = await logic.run({ ...INPUT, gameId: null }, deps);
    expect(result.ok).toBe(true);
    expect(deps.utils.getOldestGameId).toHaveBeenCalledWith(ACTOR);
  });

  it('looks the target tile up on the layer the player is standing on', async () => {
    const { deps } = happyDeps({
      playerTile: createFakeTile({ Tile_ID: 1, X_Position: 1, Y_Position: 1, Layer_ID: 6 }),
    });
    await logic.run(INPUT, deps);
    expect(deps.models.Tiles.findOne).toHaveBeenCalledWith(
      { where: { X_Position: 3, Y_Position: 1, Layer_ID: 6 } },
    );
  });
});

describe('lock.present', () => {
  // quirk preserved from the legacy command: Tiles.update does not refresh
  // the in-memory row, so the confirmation names the tile's OLD type
  it('names the tile type as it was BEFORE the toggle (preserved quirk)', () => {
    const out = logic.present({
      ok: true,
      kind: 'locked',
      data: { tileType: 'Gateway_Open', newTileType: 'Gateway_Locked', x: 3, y: 1, layerId: 1 },
    });
    expect(out).toEqual({ content: 'You have made a Gateway_Open tile on coordinates (3, 1) on layer 1!' });
  });

  it('renders the unlock confirmation the same way', () => {
    const out = logic.present({
      ok: true,
      kind: 'locked',
      data: { tileType: 'Gateway_Locked', newTileType: 'Gateway_Open', x: 2, y: 4, layerId: 3 },
    });
    expect(out).toEqual({ content: 'You have made a Gateway_Locked tile on coordinates (2, 4) on layer 3!' });
  });

  it.each([
    [REJECTIONS.WRONG_CLASS, { className: 'Guardian' }, 'You are not a Guardian!'],
    [REJECTIONS.NOT_ENOUGH_AP, { action: 'lock/unlock a tile' }, 'You dont have enough AP to lock/unlock a tile!'],
    [REJECTIONS.NO_SUCH_TILE, { message: 'Could not find a gateway to lock at the given coordinates.' }, 'Could not find a gateway to lock at the given coordinates.'],
    [REJECTIONS.OUT_OF_RANGE, { message: 'You are not in range of the tile you want to lock/unlock!' }, 'You are not in range of the tile you want to lock/unlock!'],
    [REJECTIONS.WRONG_TILE_TYPE, { message: 'You cannot lock a non-gateway tile!' }, 'You cannot lock a non-gateway tile!'],
    [REJECTIONS.WRONG_TILE_TYPE, { message: 'You cannot lock the last open gateway in the layer during a finale!' }, 'You cannot lock the last open gateway in the layer during a finale!'],
  ])('renders %s with the legacy wording', (reason, data, expected) => {
    expect(logic.present({ ok: false, reason, data })).toEqual({ content: expected });
  });

  it('renders every rejection this command can return as non-empty text', () => {
    const reasons = [
      REJECTIONS.NO_SUCH_GAME, REJECTIONS.NOT_IN_GAME, REJECTIONS.NO_SUCH_TILE,
      REJECTIONS.WRONG_CLASS, REJECTIONS.WRONG_TILE_TYPE, REJECTIONS.OUT_OF_RANGE,
      REJECTIONS.NOT_ENOUGH_AP, REJECTIONS.GAME_OVER, REJECTIONS.GAME_PAUSED,
      REJECTIONS.TIME_STOPPED,
    ];
    for (const reason of reasons) {
      const { content } = logic.present({ ok: false, reason });
      expect(typeof content).toBe('string');
      expect(content.length).toBeGreaterThan(0);
      expect(content).not.toContain('undefined');
    }
  });
});

describe('lock adapter (smoke)', () => {
  it('exports the command contract', () => {
    expect(lock.data.toJSON().name).toBe('lock');
    expect(typeof lock.execute).toBe('function');
  });
});
