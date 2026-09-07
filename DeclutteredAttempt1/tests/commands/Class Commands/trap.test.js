/**
 * /trap - logic tests. Plain data in, plain data out: no jest.mock of
 * modules under test, no discord.js, no interaction. deps carries fake
 * models; utils logic is real.
 */
const logic = require('../../../commands/Class Commands/trap.logic.js');
const trap = require('../../../commands/Class Commands/trap.js');
const { GAMESTATES, REJECTIONS } = require('../../../enums.js');
const {
  createDeps, createFakeGame, createFakePlayer, createFakeClass, createFakeTile,
} = require('../../helpers/mockModels.js');

const MINESWEEPER = '123';

/**
 * deps for the happy path; override per test.
 * Player: Minesweeper at (1,1), Range_ 3, 5 AP. Target tile: Blank1 at (2,1),
 * Tile_ID 42, same layer. Range semantics: getTileCordinatesOfLine includes
 * the start tile, so (1,1)->(3,1) is length 3 (in range at Range_ 3) and
 * (1,1)->(4,1) is length 4 (one beyond).
 */
function happyDeps(over = {}) {
  const game = over.game || createFakeGame({ Game_ID: 1, GAME_STATE: GAMESTATES.ACTIVE });
  const player = over.player || createFakePlayer({
    Player_ID: 1, Discord_ID: MINESWEEPER, Action_Points: 5, Range_: 3, Tile_ID: 1, Class_ID: 7,
  });
  const playerClass = over.playerClass || createFakeClass({ Class_ID: 7, Class_Name: 'Minesweeper' });
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

const INPUT = { x: 2, y: 1, gameId: 1, discordId: MINESWEEPER };

function expectNoWrites(deps) {
  expect(deps.models.Players.update).not.toHaveBeenCalled();
  expect(deps.models.Tiles.update).not.toHaveBeenCalled();
  expect(deps.models.Players.create).not.toHaveBeenCalled();
  expect(deps.models.Tiles.create).not.toHaveBeenCalled();
}

describe('trap.parse', () => {
  it('maps raw options and applies defaults', () => {
    const input = logic.parse({ x: 4, y: 2, game: null }, { discordId: MINESWEEPER, username: 'snage' });
    expect(input).toEqual({ x: 4, y: 2, gameId: null, discordId: MINESWEEPER });
  });

  it('keeps an explicit game id', () => {
    const input = logic.parse({ x: 1, y: 1, game: 3 }, { discordId: MINESWEEPER, username: 'snage' });
    expect(input.gameId).toBe(3);
  });

  it('turns an absent game option into null', () => {
    const input = logic.parse({ x: 1, y: 1 }, { discordId: MINESWEEPER, username: 'snage' });
    expect(input.gameId).toBeNull();
  });

  it('passes negative and zero coordinates through untouched (no validation here)', () => {
    const input = logic.parse({ x: 0, y: -3, game: 2 }, { discordId: MINESWEEPER, username: 'snage' });
    expect(input).toEqual({ x: 0, y: -3, gameId: 2, discordId: MINESWEEPER });
  });
});

describe('trap.run rejections', () => {
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

  // the gamestate table: every state has a defined outcome; adding a state
  // without deciding its gate breaks this test. The old command called
  // checkGameStateAndReply(state, false, interaction), which blocked only
  // OVER, DEV_PAUSED and TIMESTOPPED - REGISTRATION passes, unlike most
  // other class commands.
  it.each([
    [GAMESTATES.ACTIVE, null],
    [GAMESTATES.INACTIVE, null],
    [GAMESTATES.SANDBOX, null],
    [GAMESTATES.FINALE, null],
    [GAMESTATES.REGISTRATION, null],
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

  it('does not block a Clockwatcher during a timestop', async () => {
    const { deps } = happyDeps({
      game: createFakeGame({ Game_ID: 1, GAME_STATE: GAMESTATES.TIMESTOPPED }),
      playerClass: createFakeClass({ Class_ID: 7, Class_Name: 'Clockwatcher' }),
    });
    const result = await logic.run(INPUT, deps);
    // the gate now consults the actor's class, so a timestop does not
    // stop a Clockwatcher
    expect(result.reason).not.toBe(REJECTIONS.TIME_STOPPED);
    expectNoWrites(deps);
  });

  it('reports a blocked gamestate before the missing tile (legacy order)', async () => {
    const { deps } = happyDeps({
      game: createFakeGame({ Game_ID: 1, GAME_STATE: GAMESTATES.OVER }),
      tileToChange: null,
    });
    const result = await logic.run(INPUT, deps);
    expect(result.reason).toBe(REJECTIONS.GAME_OVER);
  });

  it('rejects when there is no tile at the coordinates', async () => {
    const { deps } = happyDeps({ tileToChange: null });
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.NO_SUCH_TILE, data: { action: 'trap' } });
    expectNoWrites(deps);
  });

  it('rejects a non-Minesweeper', async () => {
    const { deps } = happyDeps({ playerClass: createFakeClass({ Class_Name: 'Average' }) });
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.WRONG_CLASS, data: { className: 'Minesweeper' } });
    expectNoWrites(deps);
  });

  it('reports the missing tile before the wrong class (legacy order)', async () => {
    const { deps } = happyDeps({
      tileToChange: null,
      playerClass: createFakeClass({ Class_Name: 'Average' }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result.reason).toBe(REJECTIONS.NO_SUCH_TILE);
  });

  it('reports the wrong class before the range check (legacy order)', async () => {
    const { deps } = happyDeps({
      playerClass: createFakeClass({ Class_Name: 'Average' }),
      tileToChange: createFakeTile({ Tile_ID: 42, X_Position: 9, Y_Position: 1, Layer_ID: 1 }),
    });
    const result = await logic.run({ ...INPUT, x: 9, y: 1 }, deps);
    expect(result.reason).toBe(REJECTIONS.WRONG_CLASS);
  });

  it('rejects a tile one beyond max range (boundary: one beyond)', async () => {
    const { deps } = happyDeps({
      tileToChange: createFakeTile({ Tile_ID: 42, X_Position: 4, Y_Position: 1, Layer_ID: 1 }),
    });
    const result = await logic.run({ ...INPUT, x: 4, y: 1 }, deps);
    expect(result).toMatchObject({
      ok: false,
      reason: REJECTIONS.OUT_OF_RANGE,
      data: { message: 'You are not in range of the tile you want to trap!' },
    });
    expectNoWrites(deps);
  });

  it('accepts a tile exactly at max range (boundary: exact)', async () => {
    const { deps } = happyDeps({
      tileToChange: createFakeTile({ Tile_ID: 42, X_Position: 3, Y_Position: 1, Layer_ID: 1 }),
    });
    const result = await logic.run({ ...INPUT, x: 3, y: 1 }, deps);
    expect(result.ok).toBe(true);
  });

  it('reports the range failure before the AP check (legacy order)', async () => {
    const { deps } = happyDeps({
      player: createFakePlayer({ Player_ID: 1, Discord_ID: MINESWEEPER, Action_Points: 0, Range_: 3, Tile_ID: 1 }),
      tileToChange: createFakeTile({ Tile_ID: 42, X_Position: 4, Y_Position: 1, Layer_ID: 1 }),
    });
    const result = await logic.run({ ...INPUT, x: 4, y: 1 }, deps);
    expect(result.reason).toBe(REJECTIONS.OUT_OF_RANGE);
  });

  it('rejects with 0 AP, one short of the 1 AP cost (boundary: one short)', async () => {
    const { deps } = happyDeps({
      player: createFakePlayer({ Player_ID: 1, Discord_ID: MINESWEEPER, Action_Points: 0, Range_: 3, Tile_ID: 1 }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.NOT_ENOUGH_AP, data: { action: 'trap a tile' } });
    expectNoWrites(deps);
  });

  it('accepts with exactly 1 AP (boundary: exact)', async () => {
    const { deps } = happyDeps({
      player: createFakePlayer({ Player_ID: 1, Discord_ID: MINESWEEPER, Action_Points: 1, Range_: 3, Tile_ID: 1 }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result.ok).toBe(true);
    expect(deps.models.Players.update).toHaveBeenCalledWith(
      { Action_Points: 0 },
      { where: { Player_ID: 1 } },
    );
  });
});

describe('trap.run success', () => {
  it('plants the mine with exact write payloads', async () => {
    const { deps } = happyDeps();
    const result = await logic.run(INPUT, deps);
    expect(result).toEqual({
      ok: true,
      kind: 'trapped',
      data: { x: 2, y: 1, layerId: 1 },
    });
    expect(deps.models.Players.update).toHaveBeenCalledWith(
      { Action_Points: 4 }, // 5 - 1
      { where: { Player_ID: 1 } },
    );
    expect(deps.models.Tiles.update).toHaveBeenCalledWith(
      { trapped: true, trapper: 1 },
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

  it('finds the player by the resolved game id and discord id', async () => {
    const { deps } = happyDeps();
    await logic.run(INPUT, deps);
    expect(deps.models.Players.findOne).toHaveBeenCalledWith(
      { where: { Game_ID: 1, Discord_ID: MINESWEEPER } },
    );
  });

  it('reports the target tile layer, which is always the player\'s layer', async () => {
    const { deps } = happyDeps({
      playerTile: createFakeTile({ Tile_ID: 1, X_Position: 1, Y_Position: 1, Layer_ID: 4 }),
      tileToChange: createFakeTile({ Tile_ID: 42, X_Position: 2, Y_Position: 1, Layer_ID: 4 }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result.data.layerId).toBe(4);
    expect(deps.models.Tiles.findOne).toHaveBeenCalledWith(
      { where: { X_Position: 2, Y_Position: 1, Layer_ID: 4 } },
    );
  });

  it.each(['Wall', 'Void', 'Fire', 'Blank2', 'Gateway_Open'])(
    'traps a %s tile too - there is no tile-type check (preserved quirk)',
    async (type) => {
      const { deps } = happyDeps({
        tileToChange: createFakeTile({ Tile_ID: 42, X_Position: 2, Y_Position: 1, Layer_ID: 1, Tile_Type: type }),
      });
      const result = await logic.run(INPUT, deps);
      expect(result.ok).toBe(true);
      expect(deps.models.Tiles.update).toHaveBeenCalledWith(
        { trapped: true, trapper: 1 },
        { where: { Tile_ID: 42 } },
      );
    },
  );

  it('traps an occupied tile (no occupant check - preserved quirk)', async () => {
    const { deps } = happyDeps({
      tileToChange: createFakeTile({ Tile_ID: 42, X_Position: 2, Y_Position: 1, Layer_ID: 1, Player1: 2 }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result.ok).toBe(true);
  });

  it('re-traps an already trapped tile, overwriting the trapper (preserved quirk)', async () => {
    const { deps } = happyDeps({
      tileToChange: createFakeTile({ Tile_ID: 42, X_Position: 2, Y_Position: 1, Layer_ID: 1, trapped: true, trapper: 9 }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result.ok).toBe(true);
    expect(deps.models.Tiles.update).toHaveBeenCalledWith(
      { trapped: true, trapper: 1 },
      { where: { Tile_ID: 42 } },
    );
  });

  it('lets a dead Minesweeper trap - there is no Dead check (preserved quirk)', async () => {
    const { deps } = happyDeps({
      player: createFakePlayer({
        Player_ID: 1, Discord_ID: MINESWEEPER, Action_Points: 5, Range_: 3, Tile_ID: 1, Dead: true,
      }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result.ok).toBe(true);
    expect(deps.models.Tiles.update).toHaveBeenCalledWith(
      { trapped: true, trapper: 1 },
      { where: { Tile_ID: 42 } },
    );
  });

  it('traps the tile the player is standing on (distance 1 is in range)', async () => {
    const { deps } = happyDeps({
      tileToChange: createFakeTile({ Tile_ID: 42, X_Position: 1, Y_Position: 1, Layer_ID: 1 }),
    });
    const result = await logic.run({ ...INPUT, x: 1, y: 1 }, deps);
    expect(result.ok).toBe(true);
  });

  it('resolves the default game via getOldestGameId, passing the actor discord id', async () => {
    const { deps } = happyDeps();
    deps.utils = { ...deps.utils, getOldestGameId: jest.fn(async () => 1) };
    const result = await logic.run({ ...INPUT, gameId: null }, deps);
    expect(result.ok).toBe(true);
    expect(deps.utils.getOldestGameId).toHaveBeenCalledWith(MINESWEEPER);
  });
});

describe('trap.present', () => {
  // every rejection trap can return renders as its exact legacy string
  it.each([
    [REJECTIONS.NO_SUCH_GAME, { gameId: 3 }, 'Could not find game #3!'],
    [REJECTIONS.NOT_IN_GAME, undefined, 'Player not found in game!, please register for the game you wish to play in.'],
    [REJECTIONS.GAME_OVER, undefined, 'Game is over! only the dev can use commands for this game at this time.\n Please register on a new game.'],
    [REJECTIONS.GAME_PAUSED, undefined, 'Game is paused! only the dev can use commands for this game at this time.'],
    [REJECTIONS.TIME_STOPPED, undefined, 'Time is stopped! only Clockwatchers can use commands at this time.'],
    [REJECTIONS.NO_SUCH_TILE, { action: 'trap' }, 'Could not find tile to trap at the given coordinates.'],
    [REJECTIONS.WRONG_CLASS, { className: 'Minesweeper' }, 'You are not a Minesweeper!'],
    [REJECTIONS.OUT_OF_RANGE, { message: 'You are not in range of the tile you want to trap!' }, 'You are not in range of the tile you want to trap!'],
    [REJECTIONS.NOT_ENOUGH_AP, { action: 'trap a tile' }, 'You dont have enough AP to trap a tile!'],
  ])('renders %s as its legacy message', (reason, data, expected) => {
    expect(logic.present({ ok: false, reason, data })).toEqual({ content: expected });
  });

  it('renders success with the coordinates and layer', () => {
    const out = logic.present({ ok: true, kind: 'trapped', data: { x: 2, y: 1, layerId: 1 } });
    expect(out).toEqual({ content: 'You have planted a mine on coordinates (2, 1) on layer 1!' });
  });
});

describe('trap adapter (smoke test)', () => {
  it('exports the command contract', () => {
    expect(trap.data.toJSON().name).toBe('trap');
    expect(typeof trap.execute).toBe('function');
  });
});
