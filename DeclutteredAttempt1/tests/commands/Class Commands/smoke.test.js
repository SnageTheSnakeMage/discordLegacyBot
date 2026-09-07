/**
 * /smoke - logic tests. Plain data in, plain data out: no jest.mock of
 * modules under test, no discord.js, no interaction. deps carries fake
 * models; utils logic is real.
 */
const logic = require('../../../commands/Class Commands/smoke.logic.js');
const smoke = require('../../../commands/Class Commands/smoke.js');
const { GAMESTATES, REJECTIONS } = require('../../../enums.js');
const {
  createDeps, createFakeGame, createFakePlayer, createFakeClass, createFakeTile,
} = require('../../helpers/mockModels.js');

const SMOKER = '123';

/**
 * deps for the happy path; override per test.
 * Player: Smoker at (1,1), Range_ 3, 5 AP. Target tile: Blank1 at (2,1),
 * Tile_ID 42, same layer. Range semantics: getTileCordinatesOfLine includes
 * the start tile, so (1,1)->(3,1) is length 3 (in range at Range_ 3) and
 * (1,1)->(4,1) is length 4 (one beyond).
 */
function happyDeps(over = {}) {
  const game = over.game || createFakeGame({ Game_ID: 1, GAME_STATE: GAMESTATES.ACTIVE });
  const player = over.player || createFakePlayer({
    Player_ID: 1, Discord_ID: SMOKER, Action_Points: 5, Range_: 3, Tile_ID: 1, Class_ID: 9,
  });
  const playerClass = over.playerClass || createFakeClass({ Class_ID: 9, Class_Name: 'Smoker' });
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

const INPUT = { x: 2, y: 1, gameId: 1, discordId: SMOKER };

function expectNoWrites(deps) {
  expect(deps.models.Players.update).not.toHaveBeenCalled();
  expect(deps.models.Tiles.update).not.toHaveBeenCalled();
  expect(deps.models.Players.create).not.toHaveBeenCalled();
  expect(deps.models.Tiles.create).not.toHaveBeenCalled();
}

describe('smoke.parse', () => {
  it('maps raw options and applies defaults', () => {
    const input = logic.parse({ x: 4, y: 2, game: null }, { discordId: SMOKER, username: 'snage' });
    expect(input).toEqual({ x: 4, y: 2, gameId: null, discordId: SMOKER });
  });

  it('keeps an explicit game id', () => {
    const input = logic.parse({ x: 1, y: 1, game: 3 }, { discordId: SMOKER, username: 'snage' });
    expect(input.gameId).toBe(3);
  });

  it('turns an absent game option into null', () => {
    const input = logic.parse({ x: 1, y: 1 }, { discordId: SMOKER, username: 'snage' });
    expect(input.gameId).toBeNull();
  });
});

describe('smoke.run rejections', () => {
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

  it('rejects a dead player', async () => {
    const { deps } = happyDeps({
      player: createFakePlayer({ Player_ID: 1, Discord_ID: SMOKER, Action_Points: 5, Range_: 3, Tile_ID: 1, Dead: true }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.PLAYER_DEAD });
    expectNoWrites(deps);
  });

  it('reports a dead player before the missing tile (legacy order)', async () => {
    const { deps } = happyDeps({
      tileToChange: null,
      player: createFakePlayer({ Player_ID: 1, Discord_ID: SMOKER, Dead: true, Range_: 3, Tile_ID: 1 }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result.reason).toBe(REJECTIONS.PLAYER_DEAD);
  });

  // the gamestate table: every state has a defined outcome; adding a state
  // without deciding its gate breaks this test. The dead switch this replaces
  // blocked TIMESTOPPED, DEV_PAUSED, "FINISHED" (really OVER) and
  // REGISTRATION, with no Clockwatcher exemption - preserved.
  it.each([
    [GAMESTATES.ACTIVE, null],
    [GAMESTATES.INACTIVE, null],
    [GAMESTATES.SANDBOX, null],
    [GAMESTATES.FINALE, null],
    [GAMESTATES.OVER, REJECTIONS.GAME_OVER],
    [GAMESTATES.DEV_PAUSED, REJECTIONS.GAME_PAUSED],
    [GAMESTATES.TIMESTOPPED, REJECTIONS.TIME_STOPPED],
    [GAMESTATES.REGISTRATION, REJECTIONS.GAME_IN_REGISTRATION],
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
      playerClass: createFakeClass({ Class_ID: 9, Class_Name: 'Clockwatcher' }),
    });
    const result = await logic.run(INPUT, deps);
    // the gate now consults the actor's class, so a timestop does not
    // stop a Clockwatcher
    expect(result.reason).not.toBe(REJECTIONS.TIME_STOPPED);
    expectNoWrites(deps);
  });

  it('rejects when there is no tile at the coordinates', async () => {
    const { deps } = happyDeps({ tileToChange: null });
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.NO_SUCH_TILE, data: { action: 'smoke' } });
    expectNoWrites(deps);
  });

  it('rejects a non-Smoker', async () => {
    const { deps } = happyDeps({ playerClass: createFakeClass({ Class_Name: 'Average' }) });
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.WRONG_CLASS, data: { className: 'Smoker' } });
    expectNoWrites(deps);
  });

  it.each(['Blank2', 'Fire', 'Wall', 'Smoke', 'Gateway_Open'])('rejects smoking a %s tile', async (type) => {
    const { deps } = happyDeps({
      tileToChange: createFakeTile({ Tile_ID: 42, X_Position: 2, Y_Position: 1, Layer_ID: 1, Tile_Type: type }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({
      ok: false,
      reason: REJECTIONS.WRONG_TILE_TYPE,
      data: { message: 'You can only smoke blank tiles!' },
    });
    expectNoWrites(deps);
  });

  it('reports the wrong class before the tile type (legacy order)', async () => {
    const { deps } = happyDeps({
      playerClass: createFakeClass({ Class_Name: 'Average' }),
      tileToChange: createFakeTile({ Tile_ID: 42, X_Position: 2, Y_Position: 1, Layer_ID: 1, Tile_Type: 'Wall' }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result.reason).toBe(REJECTIONS.WRONG_CLASS);
  });

  it('reports a non-blank tile before the range check (legacy order)', async () => {
    const { deps } = happyDeps({
      tileToChange: createFakeTile({ Tile_ID: 42, X_Position: 9, Y_Position: 1, Layer_ID: 1, Tile_Type: 'Wall' }),
    });
    const result = await logic.run({ ...INPUT, x: 9, y: 1 }, deps);
    expect(result.reason).toBe(REJECTIONS.WRONG_TILE_TYPE);
  });

  it('rejects a tile one beyond max range (boundary: one beyond)', async () => {
    const { deps } = happyDeps({
      tileToChange: createFakeTile({ Tile_ID: 42, X_Position: 4, Y_Position: 1, Layer_ID: 1, Tile_Type: 'Blank1' }),
    });
    const result = await logic.run({ ...INPUT, x: 4, y: 1 }, deps);
    expect(result).toMatchObject({
      ok: false,
      reason: REJECTIONS.OUT_OF_RANGE,
      data: { message: 'You are not in range of the tile you want to smoke!' },
    });
    expectNoWrites(deps);
  });

  it('accepts a tile exactly at max range (boundary: exact)', async () => {
    const { deps } = happyDeps({
      tileToChange: createFakeTile({ Tile_ID: 42, X_Position: 3, Y_Position: 1, Layer_ID: 1, Tile_Type: 'Blank1' }),
    });
    const result = await logic.run({ ...INPUT, x: 3, y: 1 }, deps);
    expect(result.ok).toBe(true);
  });

  it('rejects with 0 AP, one short of the 1 AP cost (boundary: one short)', async () => {
    const { deps } = happyDeps({
      player: createFakePlayer({ Player_ID: 1, Discord_ID: SMOKER, Action_Points: 0, Range_: 3, Tile_ID: 1 }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.NOT_ENOUGH_AP, data: { action: 'smoke a tile' } });
    expectNoWrites(deps);
  });

  it('accepts with exactly 1 AP (boundary: exact)', async () => {
    const { deps } = happyDeps({
      player: createFakePlayer({ Player_ID: 1, Discord_ID: SMOKER, Action_Points: 1, Range_: 3, Tile_ID: 1 }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result.ok).toBe(true);
    expect(deps.models.Players.update).toHaveBeenCalledWith(
      { Action_Points: 0 },
      { where: { Player_ID: 1 } },
    );
  });
});

describe('smoke.run success', () => {
  it('smokes the tile with exact write payloads', async () => {
    const { deps } = happyDeps();
    const result = await logic.run(INPUT, deps);
    expect(result).toEqual({
      ok: true,
      kind: 'smoked',
      data: { x: 2, y: 1, previousTileType: 'Blank1', layerId: 1 },
    });
    expect(deps.models.Players.update).toHaveBeenCalledWith(
      { Action_Points: 4 }, // 5 - 1
      { where: { Player_ID: 1 } },
    );
    expect(deps.models.Tiles.update).toHaveBeenCalledWith(
      { Tile_Type: 'Smoke' },
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
      { where: { Game_ID: 1, Discord_ID: SMOKER } },
    );
  });

  it('still smokes an occupied tile (no occupant check - preserved quirk)', async () => {
    const { deps } = happyDeps({
      tileToChange: createFakeTile({ Tile_ID: 42, X_Position: 2, Y_Position: 1, Layer_ID: 1, Tile_Type: 'Blank1', Player1: 2 }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result.ok).toBe(true);
    expect(deps.models.Tiles.update).toHaveBeenCalledWith(
      { Tile_Type: 'Smoke' },
      { where: { Tile_ID: 42 } },
    );
  });

  it('resolves the default game via getOldestActiveGameId when no game is given', async () => {
    const { deps } = happyDeps();
    deps.utils = { ...deps.utils, getOldestActiveGameId: jest.fn(async () => 1) };
    const result = await logic.run({ ...INPUT, gameId: null }, deps);
    expect(result.ok).toBe(true);
    expect(deps.utils.getOldestActiveGameId).toHaveBeenCalledWith(SMOKER);
  });
});

describe('smoke.present', () => {
  // every rejection smoke can return renders as its exact legacy string
  it.each([
    [REJECTIONS.NO_SUCH_GAME, { gameId: 3 }, 'Could not find game #3!'],
    [REJECTIONS.NOT_IN_GAME, undefined, 'Player not found in game!, please register for the game you wish to play in.'],
    [REJECTIONS.PLAYER_DEAD, undefined, "Dead players can't use this command."],
    [REJECTIONS.GAME_OVER, undefined, 'Game is over! only the dev can use commands for this game at this time.\n Please register on a new game.'],
    [REJECTIONS.GAME_PAUSED, undefined, 'Game is paused! only the dev can use commands for this game at this time.'],
    [REJECTIONS.TIME_STOPPED, undefined, 'Time is stopped! only Clockwatchers can use commands at this time.'],
    [REJECTIONS.GAME_IN_REGISTRATION, undefined, 'Game is in registration phase! only the dev can use commands for this game at this time.\n Please wait for the game to start.'],
    [REJECTIONS.NO_SUCH_TILE, { action: 'smoke' }, 'Could not find tile to smoke at the given coordinates.'],
    [REJECTIONS.WRONG_CLASS, { className: 'Smoker' }, 'You are not a Smoker!'],
    [REJECTIONS.WRONG_TILE_TYPE, { message: 'You can only smoke blank tiles!' }, 'You can only smoke blank tiles!'],
    [REJECTIONS.OUT_OF_RANGE, { message: 'You are not in range of the tile you want to smoke!' }, 'You are not in range of the tile you want to smoke!'],
    [REJECTIONS.NOT_ENOUGH_AP, { action: 'smoke a tile' }, 'You dont have enough AP to smoke a tile!'],
  ])('renders %s as its legacy message', (reason, data, expected) => {
    expect(logic.present({ ok: false, reason, data })).toEqual({ content: expected });
  });

  it('renders success naming the PRE-smoke tile type, not Smoke (preserved quirk)', () => {
    const out = logic.present({
      ok: true,
      kind: 'smoked',
      data: { x: 2, y: 1, previousTileType: 'Blank1', layerId: 1 },
    });
    expect(out).toEqual({ content: 'You have made a Blank1 tile on coordinates (2, 1) on layer 1!' });
  });
});

describe('smoke adapter (smoke test)', () => {
  it('exports the command contract', () => {
    expect(smoke.data.toJSON().name).toBe('smoke');
    expect(typeof smoke.execute).toBe('function');
  });
});
