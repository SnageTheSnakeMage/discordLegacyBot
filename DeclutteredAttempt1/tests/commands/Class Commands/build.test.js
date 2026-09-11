/**
 * /build - logic tests. Plain data in, plain data out: no jest.mock, no
 * discord.js, no interaction. deps carries fake models; utils logic is real.
 */
const logic = require('../../../commands/Class Commands/build.logic.js');
const build = require('../../../commands/Class Commands/build.js');
const { GAMESTATES, REJECTIONS } = require('../../../enums.js');
const {
  createDeps, createFakeGame, createFakePlayer, createFakeClass, createFakeTile,
} = require('../../helpers/mockModels.js');

const BUILDER = '123';

/** deps for the happy path; override per test. Builder at (1,1), Range_ 3. */
function happyDeps(over = {}) {
  const player = over.player || createFakePlayer({
    Player_ID: 1, Discord_ID: BUILDER, Action_Points: 5, Range_: 3, Tile_ID: 1, Class_ID: 1,
  });
  const game = over.game || createFakeGame({ GAME_STATE: GAMESTATES.ACTIVE });
  const playerClass = over.playerClass || createFakeClass({ Class_Name: 'Construction Worker' });
  const playerTile = over.playerTile || createFakeTile({ Tile_ID: 1, X_Position: 1, Y_Position: 1, Layer_ID: 1 });
  // targetTile: null means "no tile at those coordinates"
  const targetTile = 'targetTile' in over ? over.targetTile
    : createFakeTile({ Tile_ID: 2, X_Position: 2, Y_Position: 1, Layer_ID: 1, Tile_Type: 'Blank1' });
  const deps = createDeps({
    models: {
      Games: { findByPk: async () => game },
      Players: { findOne: async ({ where }) => (where.Discord_ID === BUILDER ? player : null) },
      Classes: { findByPk: async () => playerClass },
      Tiles: {
        findByPk: async () => playerTile,
        findOne: async () => targetTile,
      },
    },
  });
  return { deps, player, game, targetTile };
}

// chest build at (2,1), one step east of the builder
const INPUT = { wall: false, x: 2, y: 1, gameId: 1, discordId: BUILDER };

/** no writes of any kind happened */
function expectNoWrites(deps) {
  expect(deps.models.Players.update).not.toHaveBeenCalled();
  expect(deps.models.Tiles.update).not.toHaveBeenCalled();
  expect(deps.models.Players.create).not.toHaveBeenCalled();
  expect(deps.models.Tiles.create).not.toHaveBeenCalled();
}

describe('build.parse', () => {
  it('maps raw options and applies defaults', () => {
    const input = logic.parse({ wall: true, x: 4, y: 2, game: null }, { discordId: BUILDER, username: 'snage' });
    expect(input).toEqual({ wall: true, x: 4, y: 2, gameId: null, discordId: BUILDER });
  });

  it('keeps an explicit game id', () => {
    const input = logic.parse({ wall: false, x: 1, y: 1, game: 7 }, { discordId: BUILDER });
    expect(input).toEqual({ wall: false, x: 1, y: 1, gameId: 7, discordId: BUILDER });
  });
});

describe('build.run rejections', () => {
  it('rejects an unknown game and writes nothing', async () => {
    const { deps } = happyDeps();
    deps.models.Games.findByPk = jest.fn(async () => null);
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.NO_SUCH_GAME });
    expectNoWrites(deps);
  });

  it('rejects a builder who is not in the game', async () => {
    const { deps } = happyDeps();
    deps.models.Players.findOne = jest.fn(async () => null);
    const result = await logic.run(INPUT, deps);
    expect(result.reason).toBe(REJECTIONS.NOT_IN_GAME);
    expectNoWrites(deps);
  });

  it('rejects coordinates with no tile on the builder\'s layer', async () => {
    const { deps } = happyDeps({ targetTile: null });
    const result = await logic.run(INPUT, deps);
    expect(result.reason).toBe(REJECTIONS.NO_SUCH_TILE);
    expectNoWrites(deps);
  });

  it('rejects a player who is not a Construction Worker', async () => {
    const { deps } = happyDeps({ playerClass: createFakeClass({ Class_Name: 'Average' }) });
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.WRONG_CLASS, data: { className: 'Construction Worker' } });
    expectNoWrites(deps);
  });

  it.each(['Gateway_Open', 'Gateway_Locked'])('rejects building on a %s tile', async (tileType) => {
    const { deps } = happyDeps({
      targetTile: createFakeTile({ Tile_ID: 2, X_Position: 2, Y_Position: 1, Layer_ID: 1, Tile_Type: tileType }),
    });
    const result = await logic.run({ ...INPUT, wall: true }, deps);
    expect(result.reason).toBe(REJECTIONS.WRONG_TILE_TYPE);
    expectNoWrites(deps);
  });

  it.each(['Player1', 'Player4'])('rejects a wall when %s occupies the tile', async (slot) => {
    const { deps } = happyDeps({
      targetTile: createFakeTile({ Tile_ID: 2, X_Position: 2, Y_Position: 1, Layer_ID: 1, [slot]: 9 }),
    });
    const result = await logic.run({ ...INPUT, wall: true }, deps);
    expect(result.reason).toBe(REJECTIONS.TILE_OCCUPIED);
    expectNoWrites(deps);
  });

  // preserved quirk: only walls check for occupants; a chest builds straight
  // over a player, exactly as the old code did
  it('builds a chest on an occupied tile', async () => {
    const { deps } = happyDeps({
      targetTile: createFakeTile({ Tile_ID: 2, X_Position: 2, Y_Position: 1, Layer_ID: 1, Player1: 9 }),
    });
    const result = await logic.run({ ...INPUT, wall: false }, deps);
    expect(result.ok).toBe(true);
    expect(deps.models.Tiles.update).toHaveBeenCalledWith({ Tile_Type: 'Chest' }, { where: { Tile_ID: 2 } });
  });

  // range boundary: the line includes both endpoints, so with Range_ 3 the
  // builder at (1,1) reaches (3,1) (line length 3) but not (4,1) (length 4)
  it('rejects a tile one step beyond range', async () => {
    const { deps } = happyDeps({
      targetTile: createFakeTile({ Tile_ID: 2, X_Position: 4, Y_Position: 1, Layer_ID: 1 }),
    });
    const result = await logic.run({ ...INPUT, x: 4, y: 1 }, deps);
    expect(result.reason).toBe(REJECTIONS.OUT_OF_RANGE);
    expectNoWrites(deps);
  });

  it('accepts a tile exactly at max range', async () => {
    const { deps } = happyDeps({
      targetTile: createFakeTile({ Tile_ID: 2, X_Position: 3, Y_Position: 1, Layer_ID: 1 }),
    });
    const result = await logic.run({ ...INPUT, x: 3, y: 1 }, deps);
    expect(result.ok).toBe(true);
  });

  it('rejects a builder one AP short (2 of 3)', async () => {
    const { deps } = happyDeps({
      player: createFakePlayer({ Player_ID: 1, Discord_ID: BUILDER, Action_Points: 2, Range_: 3, Tile_ID: 1 }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result.reason).toBe(REJECTIONS.NOT_ENOUGH_AP);
    expectNoWrites(deps);
  });

  it('accepts a builder with exactly 3 AP, leaving 0', async () => {
    const { deps } = happyDeps({
      player: createFakePlayer({ Player_ID: 1, Discord_ID: BUILDER, Action_Points: 3, Range_: 3, Tile_ID: 1 }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result.ok).toBe(true);
    expect(deps.models.Players.update).toHaveBeenCalledWith({ Action_Points: 0 }, { where: { Player_ID: 1 } });
  });

  // the gamestate table: every state has a defined outcome; adding a state
  // without deciding its gate breaks this test. The old code hard-coded
  // isClockwatcher=false, so TIMESTOPPED always blocks.
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

  // preserved quirk: the AP check ran before the gamestate gate in the old
  // code, so a broke builder in a paused game sees the AP message
  it('reports NOT_ENOUGH_AP before the gamestate gate', async () => {
    const { deps } = happyDeps({
      player: createFakePlayer({ Player_ID: 1, Discord_ID: BUILDER, Action_Points: 2, Range_: 3, Tile_ID: 1 }),
      game: createFakeGame({ GAME_STATE: GAMESTATES.DEV_PAUSED }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result.reason).toBe(REJECTIONS.NOT_ENOUGH_AP);
  });
});

describe('build.run success', () => {
  it('builds a wall with exact write payloads', async () => {
    const { deps } = happyDeps();
    const result = await logic.run({ ...INPUT, wall: true }, deps);
    expect(result).toMatchObject({
      ok: true,
      kind: 'built',
      data: { previousTileType: 'Blank1', x: 2, y: 1, layerId: 1 },
    });
    expect(deps.models.Players.update).toHaveBeenCalledWith(
      { Action_Points: 2 }, // 5 - 3
      { where: { Player_ID: 1 } },
    );
    expect(deps.models.Tiles.update).toHaveBeenCalledWith(
      { Tile_Type: 'Wall' },
      { where: { Tile_ID: 2 } },
    );
    expect(deps.models.Players.update).toHaveBeenCalledTimes(1);
    expect(deps.models.Tiles.update).toHaveBeenCalledTimes(1);
  });

  it('builds a chest with exact write payloads', async () => {
    const { deps } = happyDeps();
    const result = await logic.run({ ...INPUT, wall: false }, deps);
    expect(result.ok).toBe(true);
    expect(deps.models.Players.update).toHaveBeenCalledWith(
      { Action_Points: 2 },
      { where: { Player_ID: 1 } },
    );
    expect(deps.models.Tiles.update).toHaveBeenCalledWith(
      { Tile_Type: 'Chest' },
      { where: { Tile_ID: 2 } },
    );
  });

  // preserved quirk: the success data carries the tile's PREVIOUS type (the
  // row was read before the update), so building over a Wall reports "Wall"
  it('reports the previous tile type, not the built one', async () => {
    const { deps } = happyDeps({
      targetTile: createFakeTile({ Tile_ID: 2, X_Position: 2, Y_Position: 1, Layer_ID: 1, Tile_Type: 'Wall' }),
    });
    const result = await logic.run({ ...INPUT, wall: false }, deps);
    expect(result.data.previousTileType).toBe('Wall');
    expect(deps.models.Tiles.update).toHaveBeenCalledWith({ Tile_Type: 'Chest' }, { where: { Tile_ID: 2 } });
  });

  it('resolves the default game via getOldestGameId when no game is given', async () => {
    const { deps } = happyDeps();
    deps.utils = { ...deps.utils, getOldestGameId: jest.fn(async () => 1) };
    const result = await logic.run({ ...INPUT, gameId: null }, deps);
    expect(result.ok).toBe(true);
    expect(deps.utils.getOldestGameId).toHaveBeenCalledWith(BUILDER);
  });
});

describe('build.present', () => {
  it.each([
    [REJECTIONS.NO_SUCH_TILE, { action: 'build on' }, 'Could not find tile to build on at the given coordinates.'],
    [REJECTIONS.WRONG_CLASS, { className: 'Construction Worker' }, 'You are not a Construction Worker!'],
    [REJECTIONS.WRONG_TILE_TYPE, { message: 'You cannot build on a gateway tile!' }, 'You cannot build on a gateway tile!'],
    [REJECTIONS.TILE_OCCUPIED, undefined, 'There is a player on that tile!'],
    [REJECTIONS.OUT_OF_RANGE, { message: 'You are not in range of the tile you want to build!' }, 'You are not in range of the tile you want to build!'],
    [REJECTIONS.NOT_ENOUGH_AP, { action: 'build a wall or chest' }, 'You dont have enough AP to build a wall or chest!'],
  ])('renders %s byte-identical to the legacy string', (reason, data, expected) => {
    expect(logic.present({ ok: false, reason, data })).toEqual({ content: expected });
  });

  it('renders success naming the previous tile type', () => {
    const out = logic.present({
      ok: true, kind: 'built', data: { previousTileType: 'Blank1', x: 2, y: 1, layerId: 1 },
    });
    expect(out).toEqual({ content: 'You have made a Blank1 tile on coordinates (2, 1) on layer 1!' });
  });
});

describe('build adapter (smoke)', () => {
  it('exports the command contract', () => {
    expect(build.data.toJSON().name).toBe('build');
    expect(typeof build.execute).toBe('function');
  });
});
