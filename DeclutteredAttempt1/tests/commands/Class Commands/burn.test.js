/**
 * /burn - logic tests. Plain data in, plain data out: no jest.mock of
 * modules under test, no discord.js, no interaction. deps carries fake
 * models; utils logic is real.
 */
const logic = require('../../../commands/Class Commands/burn.logic.js');
const burn = require('../../../commands/Class Commands/burn.js');
const { GAMESTATES, REJECTIONS } = require('../../../enums.js');
const {
  createDeps, createFakeGame, createFakePlayer, createFakeClass, createFakeTile,
} = require('../../helpers/mockModels.js');

const PYRO = '123';

/**
 * deps for the happy path; override per test.
 * Player: Pyromaniac at (1,1), Range_ 3, 5 AP. Target tile: Blank1 at (2,1),
 * Tile_ID 42, same layer. Range semantics: getTileCordinatesOfLine includes
 * the start tile, so (1,1)->(3,1) is length 3 (in range at Range_ 3) and
 * (1,1)->(4,1) is length 4 (one beyond).
 */
function happyDeps(over = {}) {
  const game = over.game || createFakeGame({ Game_ID: 1, GAME_STATE: GAMESTATES.ACTIVE });
  const player = over.player || createFakePlayer({
    Player_ID: 1, Discord_ID: PYRO, Action_Points: 5, Range_: 3, Tile_ID: 1, Class_ID: 7,
  });
  const playerClass = over.playerClass || createFakeClass({ Class_ID: 7, Class_Name: 'Pyromaniac' });
  const playerTile = over.playerTile || createFakeTile({ Tile_ID: 1, X_Position: 1, Y_Position: 1, Layer_ID: 1 });
  const tileToChange = 'tileToChange' in over ? over.tileToChange : createFakeTile({
    Tile_ID: 42, X_Position: 2, Y_Position: 1, Layer_ID: 1, Tile_Type: 'Blank1',
  });
  const deps = createDeps({
    models: {
      Games: { findByPk: async () => game },
      Players: { findOne: async () => player },
      Classes: { findByPk: async () => playerClass },
      Tiles: {
        findByPk: async () => playerTile,
        findOne: async () => tileToChange,
      },
    },
  });
  return { deps, game, player, playerTile, tileToChange };
}

const INPUT = { x: 2, y: 1, gameId: 1, discordId: PYRO, username: 'snage' };

function expectNoWrites(deps) {
  expect(deps.models.Players.update).not.toHaveBeenCalled();
  expect(deps.models.Tiles.update).not.toHaveBeenCalled();
  expect(deps.models.Players.create).not.toHaveBeenCalled();
  expect(deps.models.Tiles.create).not.toHaveBeenCalled();
}

describe('burn.parse', () => {
  it('maps raw options and applies defaults', () => {
    const input = logic.parse({ x: 4, y: 2, game: null }, { discordId: PYRO, username: 'snage' });
    expect(input).toEqual({ x: 4, y: 2, gameId: null, discordId: PYRO, username: 'snage' });
  });

  it('keeps an explicit game id', () => {
    const input = logic.parse({ x: 1, y: 1, game: 3 }, { discordId: PYRO, username: 'snage' });
    expect(input.gameId).toBe(3);
  });
});

describe('burn.run rejections', () => {
  it('rejects an unknown game and writes nothing', async () => {
    const { deps } = happyDeps();
    deps.models.Games.findByPk = jest.fn(async () => null);
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.NO_SUCH_GAME });
    expectNoWrites(deps);
  });

  it('rejects a player who is not in the game', async () => {
    const { deps } = happyDeps();
    deps.models.Players.findOne = jest.fn(async () => null);
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.NOT_IN_GAME });
    expectNoWrites(deps);
  });

  it('rejects when there is no tile at the coordinates', async () => {
    const { deps } = happyDeps({ tileToChange: null });
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.NO_SUCH_TILE, data: { action: 'burn' } });
    expectNoWrites(deps);
  });

  it('reports the missing tile before the dead check (legacy order)', async () => {
    const { deps } = happyDeps({
      tileToChange: null,
      player: createFakePlayer({ Player_ID: 1, Discord_ID: PYRO, Dead: true, Range_: 3, Tile_ID: 1 }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result.reason).toBe(REJECTIONS.NO_SUCH_TILE);
  });

  it('rejects a dead player', async () => {
    const { deps } = happyDeps({
      player: createFakePlayer({ Player_ID: 1, Discord_ID: PYRO, Action_Points: 5, Range_: 3, Tile_ID: 1, Dead: true }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.PLAYER_DEAD });
    expectNoWrites(deps);
  });

  // the gamestate table: every state has a defined outcome; adding a state
  // without deciding its gate breaks this test. The old code passed
  // isClockwatcher=false unconditionally, so TIMESTOPPED always blocks
  // (a Pyromaniac is never a Clockwatcher) - preserved.
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

  it('rejects a non-Pyromaniac', async () => {
    const { deps } = happyDeps({ playerClass: createFakeClass({ Class_Name: 'Average' }) });
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.WRONG_CLASS, data: { className: 'Pyromaniac' } });
    expectNoWrites(deps);
  });

  it.each(['Gateway_Open', 'Gateway_Locked'])('rejects burning a %s tile', async (type) => {
    const { deps } = happyDeps({
      tileToChange: createFakeTile({ Tile_ID: 42, X_Position: 2, Y_Position: 1, Layer_ID: 1, Tile_Type: type }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.WRONG_TILE_TYPE });
    expectNoWrites(deps);
  });

  it('rejects a tile one beyond max range (boundary: one beyond)', async () => {
    const { deps } = happyDeps({
      tileToChange: createFakeTile({ Tile_ID: 42, X_Position: 4, Y_Position: 1, Layer_ID: 1, Tile_Type: 'Blank1' }),
    });
    const result = await logic.run({ ...INPUT, x: 4, y: 1 }, deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.OUT_OF_RANGE });
    expectNoWrites(deps);
  });

  it('accepts a tile exactly at max range (boundary: exact)', async () => {
    const { deps } = happyDeps({
      tileToChange: createFakeTile({ Tile_ID: 42, X_Position: 3, Y_Position: 1, Layer_ID: 1, Tile_Type: 'Blank1' }),
    });
    const result = await logic.run({ ...INPUT, x: 3, y: 1 }, deps);
    expect(result.ok).toBe(true);
  });

  it('reports a gateway before the range check (legacy order)', async () => {
    const { deps } = happyDeps({
      tileToChange: createFakeTile({ Tile_ID: 42, X_Position: 9, Y_Position: 1, Layer_ID: 1, Tile_Type: 'Gateway_Open' }),
    });
    const result = await logic.run({ ...INPUT, x: 9, y: 1 }, deps);
    expect(result.reason).toBe(REJECTIONS.WRONG_TILE_TYPE);
  });

  it('rejects with 3 AP, one short of the 4 AP cost (boundary: one short)', async () => {
    const { deps } = happyDeps({
      player: createFakePlayer({ Player_ID: 1, Discord_ID: PYRO, Action_Points: 3, Range_: 3, Tile_ID: 1 }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.NOT_ENOUGH_AP, data: { action: 'burn a tile' } });
    expectNoWrites(deps);
  });

  it('accepts with exactly 4 AP (boundary: exact)', async () => {
    const { deps } = happyDeps({
      player: createFakePlayer({ Player_ID: 1, Discord_ID: PYRO, Action_Points: 4, Range_: 3, Tile_ID: 1 }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result.ok).toBe(true);
    expect(deps.models.Players.update).toHaveBeenCalledWith(
      { Action_Points: 0 },
      { where: { Player_ID: 1 } },
    );
  });
});

describe('burn.run success', () => {
  it('burns the tile with exact write payloads', async () => {
    const { deps } = happyDeps();
    const result = await logic.run(INPUT, deps);
    expect(result).toEqual({
      ok: true,
      kind: 'burned',
      data: { x: 2, y: 1, previousTileType: 'Blank1', layerId: 1, username: 'snage' },
    });
    expect(deps.models.Players.update).toHaveBeenCalledWith(
      { Action_Points: 1 }, // 5 - 4
      { where: { Player_ID: 1 } },
    );
    expect(deps.models.Tiles.update).toHaveBeenCalledWith(
      { Tile_Type: 'Fire' },
      { where: { Tile_ID: 42 } },
    );
    expect(deps.models.Players.update).toHaveBeenCalledTimes(1);
    expect(deps.models.Tiles.update).toHaveBeenCalledTimes(1);
  });

  it('looks the target tile up on the player\'s own layer', async () => {
    const { deps } = happyDeps();
    await logic.run(INPUT, deps);
    expect(deps.models.Tiles.findOne).toHaveBeenCalledWith(
      { where: { X_Position: 2, Y_Position: 1, Layer_ID: 1 } },
    );
  });

  it('still burns an occupied tile (no occupant check - preserved quirk)', async () => {
    const { deps } = happyDeps({
      tileToChange: createFakeTile({ Tile_ID: 42, X_Position: 2, Y_Position: 1, Layer_ID: 1, Tile_Type: 'Blank1', Player1: 2 }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result.ok).toBe(true);
    expect(deps.models.Tiles.update).toHaveBeenCalledWith(
      { Tile_Type: 'Fire' },
      { where: { Tile_ID: 42 } },
    );
  });

  it('re-burns a tile that is already Fire (preserved quirk)', async () => {
    const { deps } = happyDeps({
      tileToChange: createFakeTile({ Tile_ID: 42, X_Position: 2, Y_Position: 1, Layer_ID: 1, Tile_Type: 'Fire' }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result.ok).toBe(true);
    expect(result.data.previousTileType).toBe('Fire');
  });

  it('resolves the default game via getOldestGameId when no game is given', async () => {
    const { deps } = happyDeps();
    deps.utils = { ...deps.utils, getOldestGameId: jest.fn(async () => 1) };
    const result = await logic.run({ ...INPUT, gameId: null }, deps);
    expect(result.ok).toBe(true);
    expect(deps.utils.getOldestGameId).toHaveBeenCalledWith(PYRO);
  });
});

describe('burn.present', () => {
  // every rejection burn can return renders as its exact legacy string
  it.each([
    [REJECTIONS.NO_SUCH_TILE, { action: 'burn' }, 'Could not find tile to burn at the given coordinates.'],
    [REJECTIONS.PLAYER_DEAD, undefined, "Dead players can't use this command."],
    [REJECTIONS.GAME_OVER, undefined, 'Game is over! only the dev can use commands for this game at this time.\n Please register on a new game.'],
    [REJECTIONS.GAME_PAUSED, undefined, 'Game is paused! only the dev can use commands for this game at this time.'],
    [REJECTIONS.TIME_STOPPED, undefined, 'Time is stopped! only Clockwatchers can use commands at this time.'],
    [REJECTIONS.WRONG_CLASS, { className: 'Pyromaniac' }, 'You are not a Pyromaniac!'],
    [REJECTIONS.WRONG_TILE_TYPE, { message: 'You cannot burn a gateway tile!' }, 'You cannot burn a gateway tile!'],
    [REJECTIONS.OUT_OF_RANGE, { message: 'You are not in range of the tile you want to burn!' }, 'You are not in range of the tile you want to burn!'],
    [REJECTIONS.NOT_ENOUGH_AP, { action: 'burn a tile' }, 'You dont have enough AP to burn a tile!'],
  ])('renders %s as its legacy message', (reason, data, expected) => {
    expect(logic.present({ ok: false, reason, data })).toEqual({ content: expected });
  });

  it('renders success naming the PRE-burn tile type, not Fire (preserved quirk)', () => {
    const out = logic.present({
      ok: true,
      kind: 'burned',
      data: { x: 2, y: 1, previousTileType: 'Blank1', layerId: 1, username: 'snage' },
    });
    expect(out).toEqual({ content: 'snage made a Blank1 tile on coordinates (2, 1) on layer 1!' });
  });
});

describe('burn adapter (smoke)', () => {
  it('exports the command contract', () => {
    expect(burn.data.toJSON().name).toBe('burn');
    expect(typeof burn.execute).toBe('function');
  });
});
