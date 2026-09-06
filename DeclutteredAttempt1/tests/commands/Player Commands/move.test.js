/**
 * /move - logic tests. Plain data in, plain data out: no jest.mock, no
 * discord.js, no interaction, no setTimeout. deps carries fake models and
 * fake board-mutating utils; the pure utils (getTileCordinatesOfLine,
 * checkGameState) are the real ones.
 */
const logic = require('../../../commands/Player Commands/move.logic.js');
const move = require('../../../commands/Player Commands/move.js');
const { GAMESTATES, REJECTIONS } = require('../../../enums.js');
const {
  createDeps, createFakeGame, createFakePlayer, createFakeClass, createFakeTile, createFakeLayer,
} = require('../../helpers/mockModels.js');

const DISCORD_ID = '123';

/**
 * A 5x5 single-layer board on Layer_ID 1, 1-indexed, all Blank1.
 * overrides is keyed "x,y" -> partial tile, e.g. { '2,1': { Tile_Type: 'Ice' } }.
 * Tile_ID is x*10+y so ids are readable in failures.
 */
function makeBoard(overrides = {}) {
  const byCoord = new Map();
  const byId = new Map();
  for (let x = 1; x <= 5; x++) {
    for (let y = 1; y <= 5; y++) {
      const tile = createFakeTile({
        Tile_ID: x * 10 + y, Layer_ID: 1, X_Position: x, Y_Position: y, Tile_Type: 'Blank1',
        ...(overrides[`${x},${y}`] || {}),
      });
      byCoord.set(`${x},${y}`, tile);
      byId.set(tile.Tile_ID, tile);
    }
  }
  return { byCoord, byId };
}

/** deps for a plain eastward step; override per test */
function makeDeps(over = {}) {
  const board = over.board || makeBoard();
  const layer = over.layer || createFakeLayer({ Layer_ID: 1, Game_ID: 1, X_Bound: 5, Y_Bound: 5 });
  const game = over.game || createFakeGame({ Game_ID: 1, GAME_STATE: GAMESTATES.ACTIVE, moveCost: 1, fireDmg: 3, mineDmg: 2 });
  const player = over.player || createFakePlayer({
    Player_ID: 1, Class_ID: 1, Game_ID: 1, Discord_ID: DISCORD_ID,
    Action_Points: 10, Health_Points: 10, Free_Move: 0, Tile_ID: 11, Tile_ID2: null,
  });
  const playerClass = over.playerClass || createFakeClass({ Class_ID: 1, Class_Name: 'Average' });
  const trapper = over.trapper === undefined ? null : over.trapper;

  const deps = createDeps({
    random: over.random,
    models: {
      Games: { findByPk: async () => game },
      Players: {
        findOne: async () => player,
        findByPk: async (id) => (trapper && id === trapper.Player_ID ? trapper : player),
      },
      Classes: { findByPk: async () => playerClass },
      Layers: { findByPk: async () => layer },
      Tiles: {
        findByPk: async (id) => board.byId.get(id) || null,
        findOne: async ({ where }) => board.byCoord.get(`${where.X_Position},${where.Y_Position}`) || null,
      },
    },
    utils: {
      // these three write to the board / kill players through utils' own
      // module-level models, so they are faked; the pure helpers are real
      setPlayerToTile: jest.fn(async () => undefined),
      playerDeathLogic: jest.fn(async () => undefined),
      revertTileToBlank: jest.fn(async () => undefined),
      getOldestActiveGameId: jest.fn(async () => 1),
    },
  });
  return { deps, board, layer, game, player, playerClass, trapper };
}

/** one tile east, no path */
const INPUT = { gameId: 1, direction: 'east', distance: 1, path: null, body: 1, discordId: DISCORD_ID };

// ---------------------------------------------------------------------------
// parse
// ---------------------------------------------------------------------------

describe('move.parse', () => {
  it('maps raw options', () => {
    const input = logic.parse(
      { direction: 'east', distance: 3, path: 'right,2;', body: 2, game: 7 },
      { discordId: DISCORD_ID, username: 'snage' },
    );
    expect(input).toEqual({ gameId: 7, direction: 'east', distance: 3, path: 'right,2;', body: 2, discordId: DISCORD_ID });
  });

  it('defaults absent options to null and body to 1', () => {
    const input = logic.parse(
      { direction: 'north', distance: 1, path: null, body: null, game: null },
      { discordId: DISCORD_ID, username: 'snage' },
    );
    expect(input).toEqual({ gameId: null, direction: 'north', distance: 1, path: null, body: 1, discordId: DISCORD_ID });
  });

  it('treats any body other than 2 as body 1', () => {
    expect(logic.parse({ direction: 'north', distance: 1, body: 1 }, { discordId: DISCORD_ID }).body).toBe(1);
    expect(logic.parse({ direction: 'north', distance: 1, body: 5 }, { discordId: DISCORD_ID }).body).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// pure path helpers (issue #88)
// ---------------------------------------------------------------------------

describe('move.inputPathToArray', () => {
  it.each([
    ['right,2;', [['right', '2'], ['']]],
    ['right,2;down,1;', [['right', '2'], ['down', '1'], ['']]],
    ['sw,10;', [['sw', '10'], ['']]],
    ['nonsense', [['nonsense']]],
  ])('%s -> %j', (input, expected) => {
    expect(logic.inputPathToArray(input)).toEqual(expected);
  });

  // QUIRK: the mandatory trailing ';' leaves an empty [""] segment in the
  // result. Consumers skip it; the split itself is unchanged.
  it('keeps the trailing empty segment produced by the final semicolon', () => {
    expect(logic.inputPathToArray('up,1;').at(-1)).toEqual(['']);
  });
});

describe('move.addStartToPathArray', () => {
  it.each([
    ['ne', 'northeast'],
    ['nw', 'northwest'],
    ['se', 'southeast'],
    ['sw', 'southwest'],
    ['left', 'west'],
    ['right', 'east'],
    ['up', 'north'],
    ['down', 'south'],
  ])('prepends %s as %s', (short, long) => {
    expect(logic.addStartToPathArray(short, 2, [['down', '1']])).toEqual([[long, 2], ['down', '1']]);
  });

  it('throws on a direction it cannot translate', () => {
    expect(() => logic.addStartToPathArray('east', 1, [])).toThrow('Invalid inital movement direction cannot parse into complete path array');
  });
});

describe('move.pathToTiles', () => {
  it('returns the start plus the end of each segment', () => {
    expect(logic.pathToTiles([1, 1], [['right', '2'], ['']])).toEqual([[1, 1], [3, 1]]);
  });

  it('uses up = -Y and down = +Y for path segments', () => {
    expect(logic.pathToTiles([3, 3], [['up', '1'], ['']])).toEqual([[3, 3], [3, 2]]);
    expect(logic.pathToTiles([3, 3], [['down', '1'], ['']])).toEqual([[3, 3], [3, 4]]);
  });

  // QUIRK: every segment is measured from the starting tile, not from the end
  // of the previous segment. Kept from the legacy pathToTiles.
  it('measures every segment from the starting tile, not cumulatively', () => {
    expect(logic.pathToTiles([1, 1], [['right', '2'], ['down', '1'], ['']]))
      .toEqual([[1, 1], [3, 1], [1, 2]]);
  });

  it('throws on an unknown segment direction', () => {
    expect(() => logic.pathToTiles([1, 1], [['sideways', '1']])).toThrow(/Invalid input path/);
  });
});

describe('move.getTileCordinatesOfPath', () => {
  const utils = require('../../../utils.js');

  it('flattens the path into every coordinate crossed, junctions not repeated', () => {
    expect(logic.getTileCordinatesOfPath([1, 1], logic.inputPathToArray('right,2;'), utils))
      .toEqual([[1, 1], [2, 1], [3, 1]]);
  });

  it('returns just the starting tile for an empty path', () => {
    expect(logic.getTileCordinatesOfPath([2, 2], [['']], utils)).toEqual([[2, 2]]);
  });
});

describe('move.verifyInputPath', () => {
  function pathDeps(over = {}) {
    const board = over.board || makeBoard();
    const layer = over.layer || createFakeLayer({ Layer_ID: 1, X_Bound: 5, Y_Bound: 5 });
    return createDeps({
      models: {
        Layers: { findByPk: async () => layer },
        Tiles: { findOne: async ({ where }) => board.byCoord.get(`${where.X_Position},${where.Y_Position}`) || null },
      },
    });
  }

  it('accepts a well-formed path that stays on the board', async () => {
    const verdict = await logic.verifyInputPath('right,2;', 1, 1, 1, pathDeps());
    expect(verdict).toEqual({ valid: true, destination: [3, 1] });
  });

  it.each([
    ['garbage'],
    ['right,2'],
    ['right;2;'],
    ['east,2;'],
  ])('rejects the malformed path %s', async (path) => {
    const verdict = await logic.verifyInputPath(path, 1, 1, 1, pathDeps());
    expect(verdict.valid).toBe(false);
    expect(verdict.message).toMatch(/make sure your path uses a direction/);
  });

  it('rejects a path that crosses a tile which does not exist', async () => {
    const verdict = await logic.verifyInputPath('right,9;', 1, 1, 1, pathDeps());
    expect(verdict).toEqual({
      valid: false,
      message: 'Invalid input path, your path goes to a nonexistent tile or a tile your path goes on could not be found. If you think this is a mistake contact snage.',
    });
  });

  it('rejects a path whose destination is past the layer bound', async () => {
    const deps = pathDeps({ layer: createFakeLayer({ Layer_ID: 1, X_Bound: 2, Y_Bound: 5 }) });
    const verdict = await logic.verifyInputPath('right,3;', 1, 1, 1, deps);
    expect(verdict.valid).toBe(false);
    expect(verdict.message).toMatch(/make sure your path uses a direction/);
  });

  it('checks each segment from the starting tile (legacy, non-cumulative)', async () => {
    const deps = pathDeps();
    await logic.verifyInputPath('right,2;down,1;', 1, 1, 1, deps);
    expect(deps.models.Tiles.findOne).toHaveBeenCalledWith({ where: { Layer_ID: 1, X_Position: 3, Y_Position: 1 } });
    // cumulative would be (3,2); legacy measures from the start, so (1,2)
    expect(deps.models.Tiles.findOne).toHaveBeenCalledWith({ where: { Layer_ID: 1, X_Position: 1, Y_Position: 2 } });
  });
});

// ---------------------------------------------------------------------------
// run - rejections
// ---------------------------------------------------------------------------

describe('move.run rejections', () => {
  it('rejects an unknown game and writes nothing', async () => {
    const { deps } = makeDeps();
    deps.models.Games.findByPk = jest.fn(async () => null);
    const result = await logic.run(INPUT, deps);
    expect(result).toEqual({ ok: false, reason: REJECTIONS.NO_SUCH_GAME, data: { gameId: 1 } });
    expect(deps.models.Players.update).not.toHaveBeenCalled();
    expect(deps.utils.setPlayerToTile).not.toHaveBeenCalled();
  });

  it('rejects a player who is not in the game, with the legacy wording', async () => {
    const { deps } = makeDeps();
    deps.models.Players.findOne = jest.fn(async () => null);
    const result = await logic.run(INPUT, deps);
    expect(result.reason).toBe(REJECTIONS.NOT_IN_GAME);
    expect(logic.present(result)).toEqual({ content: 'Player not found in game!, please register for the game you wish to move in.' });
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  it('rejects a player whose current tile is missing', async () => {
    const { deps } = makeDeps({ player: createFakePlayer({ Player_ID: 1, Discord_ID: DISCORD_ID, Tile_ID: 999 }) });
    const result = await logic.run(INPUT, deps);
    expect(result.reason).toBe(REJECTIONS.NO_SUCH_TILE);
    expect(logic.present(result)).toEqual({ content: "Current tile not found! please register, or ask a Dev about why your not on the board" });
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  it('rejects a dead player', async () => {
    const { deps } = makeDeps({
      player: createFakePlayer({ Player_ID: 1, Discord_ID: DISCORD_ID, Tile_ID: 11, Dead: true }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result).toEqual({ ok: false, reason: REJECTIONS.PLAYER_DEAD });
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  // the gamestate table: every state in the enum has a decided outcome
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
    const { deps } = makeDeps({ game: createFakeGame({ Game_ID: 1, GAME_STATE: state, moveCost: 1 }) });
    const result = await logic.run(INPUT, deps);
    if (reason === null) {
      expect(result.ok).toBe(true);
    } else {
      expect(result).toEqual({ ok: false, reason });
      expect(deps.models.Players.update).not.toHaveBeenCalled();
      expect(deps.utils.setPlayerToTile).not.toHaveBeenCalled();
    }
  });

  it('lets a Clockwatcher move during a timestop', async () => {
    const { deps } = makeDeps({
      game: createFakeGame({ Game_ID: 1, GAME_STATE: GAMESTATES.TIMESTOPPED, moveCost: 1 }),
      playerClass: createFakeClass({ Class_Name: 'Clockwatcher' }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result.ok).toBe(true);
  });

  it('rejects ending a movement on ice when not a Snowman', async () => {
    const { deps } = makeDeps({ board: makeBoard({ '2,1': { Tile_Type: 'Ice' } }) });
    const result = await logic.run(INPUT, deps);
    expect(result.reason).toBe(REJECTIONS.WRONG_TILE_TYPE);
    expect(logic.present(result)).toEqual({
      content: 'Cannot end a movement on an ice tile, please either provide a path that moves off the ice, or move onto a non-ice tile.',
    });
    expect(deps.models.Players.update).not.toHaveBeenCalled();
    expect(deps.utils.setPlayerToTile).not.toHaveBeenCalled();
  });

  it('lets a Snowman end a movement on ice', async () => {
    const { deps } = makeDeps({
      board: makeBoard({ '2,1': { Tile_Type: 'Ice' } }),
      playerClass: createFakeClass({ Class_Name: 'Snowman' }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result.ok).toBe(true);
    // the ice tile is deducted: 2 tiles walked - 1 ice = 1 * moveCost
    expect(result.data.spentAP).toBe(1);
  });

  it('rejects a move onto a coordinate with no tile row', async () => {
    const { deps } = makeDeps();
    const result = await logic.run({ ...INPUT, direction: 'west' }, deps);
    expect(result).toEqual({ ok: false, reason: REJECTIONS.NO_SUCH_TILE });
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  it('rejects when the player is one AP short (boundary)', async () => {
    // two tiles east = 3 coordinates walked = 3 AP at moveCost 1
    const { deps } = makeDeps({
      player: createFakePlayer({ Player_ID: 1, Discord_ID: DISCORD_ID, Tile_ID: 11, Action_Points: 2, Free_Move: 0 }),
    });
    const result = await logic.run({ ...INPUT, distance: 2 }, deps);
    expect(result.reason).toBe(REJECTIONS.NOT_ENOUGH_AP);
    expect(logic.present(result)).toEqual({ content: 'Player does not enough action points for movement requested.' });
    expect(deps.models.Players.update).not.toHaveBeenCalled();
    expect(deps.utils.setPlayerToTile).not.toHaveBeenCalled();
  });

  it('accepts when the player has exactly enough AP (boundary)', async () => {
    const { deps } = makeDeps({
      player: createFakePlayer({ Player_ID: 1, Discord_ID: DISCORD_ID, Tile_ID: 11, Action_Points: 3, Free_Move: 0 }),
    });
    const result = await logic.run({ ...INPUT, distance: 2 }, deps);
    expect(result.ok).toBe(true);
    expect(result.data.spentAP).toBe(3);
  });

  it('rejects walking onto a wall when not a Cloudborn', async () => {
    const { deps } = makeDeps({ board: makeBoard({ '2,1': { Tile_Type: 'Wall' } }) });
    const result = await logic.run(INPUT, deps);
    expect(result.reason).toBe(REJECTIONS.WRONG_TILE_TYPE);
    expect(logic.present(result)).toEqual({
      content: `[ERROR] Player ${DISCORD_ID} cannot move onto void wall or wall damaged tiles`,
    });
    expect(deps.models.Players.update).not.toHaveBeenCalled();
    expect(deps.utils.setPlayerToTile).not.toHaveBeenCalled();
  });

  it.each(['Void', 'Wall', 'Wall_Damaged'])('lets a Cloudborn walk onto %s', async (tileType) => {
    const { deps } = makeDeps({
      board: makeBoard({ '2,1': { Tile_Type: tileType } }),
      player: createFakePlayer({ Player_ID: 1, Class_ID: 6, Discord_ID: DISCORD_ID, Tile_ID: 11, Action_Points: 10 }),
      playerClass: createFakeClass({ Class_ID: 6, Class_Name: 'Cloudborn' }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result.ok).toBe(true);
  });

  it('rejects a malformed path before any movement happens', async () => {
    const { deps } = makeDeps();
    const result = await logic.run({ ...INPUT, path: 'garbage' }, deps);
    expect(result.reason).toBe(REJECTIONS.INVALID_PATH);
    expect(logic.present(result).content).toMatch(/make sure your path uses a direction/);
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  it('rejects a path that leaves the layer', async () => {
    const { deps } = makeDeps({ layer: createFakeLayer({ Layer_ID: 1, X_Bound: 2, Y_Bound: 5 }) });
    const result = await logic.run({ ...INPUT, path: 'right,3;' }, deps);
    expect(result.reason).toBe(REJECTIONS.INVALID_PATH);
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  it('throws for a mined tile whose trapper is gone (a real invariant break)', async () => {
    const { deps } = makeDeps({ board: makeBoard({ '2,1': { trapped: true, trapper: 99 } }) });
    deps.models.Players.findByPk = jest.fn(async () => null);
    await expect(logic.run(INPUT, deps)).rejects.toThrow('Mine without trapper found. Please contact snage.');
  });

  it('throws for a direction that is not one of the eight choices', async () => {
    const { deps } = makeDeps();
    await expect(logic.run({ ...INPUT, direction: 'sideways' }, deps))
      .rejects.toThrow('Invalid direction, contact snage as this should not be possible.');
  });
});

// ---------------------------------------------------------------------------
// run - success
// ---------------------------------------------------------------------------

describe('move.run success', () => {
  it('moves one tile east with the exact write payloads', async () => {
    const { deps } = makeDeps();
    const result = await logic.run(INPUT, deps);

    expect(result).toEqual({
      ok: true,
      kind: 'moved',
      data: {
        response: 'You moved from a Blank1 tile to a Blank1 tile! \n',
        spentAP: 2,
        newX: 2,
        newY: 1,
        layerId: 1,
        deleteReplyAfterMs: null,
      },
    });
    expect(deps.utils.setPlayerToTile).toHaveBeenCalledWith(1, 1, 2, 1);
    expect(deps.models.Players.update).toHaveBeenCalledWith(
      { Action_Points: 8, Free_Move: -2 },
      { where: { Discord_ID: DISCORD_ID, Player_ID: 1, Game_ID: 1 } },
    );
    expect(deps.models.Players.update).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['east', 4, 3],
    ['west', 2, 3],
    ['north', 3, 4],
    ['south', 3, 2],
    ['northeast', 4, 4],
    ['northwest', 2, 4],
    ['southeast', 4, 2],
    ['southwest', 2, 2],
  ])('direction %s lands on (%i, %i)', async (direction, x, y) => {
    // start from the middle of the board so every direction has a tile
    const { deps } = makeDeps({
      player: createFakePlayer({ Player_ID: 1, Discord_ID: DISCORD_ID, Tile_ID: 33, Action_Points: 10 }),
    });
    const result = await logic.run({ ...INPUT, direction }, deps);
    expect(result.ok).toBe(true);
    expect([result.data.newX, result.data.newY]).toEqual([x, y]);
    expect(deps.utils.setPlayerToTile).toHaveBeenCalledWith(1, 1, x, y);
  });

  // QUIRK: north is +Y for the direction option but -Y for path segments
  it('keeps the direction option and path segments disagreeing about north', async () => {
    expect(logic.DIRECTION_DELTAS.north).toEqual([0, 1]);
    expect(logic.pathToTiles([3, 3], [['up', '1']])).toEqual([[3, 3], [3, 2]]);
  });

  // QUIRK: the starting tile is billed, so a one-tile move costs two tiles
  it('bills the tile the player starts on', async () => {
    const { deps } = makeDeps();
    const result = await logic.run(INPUT, deps);
    expect(result.data.spentAP).toBe(2);
  });

  it('charges a Glutton double', async () => {
    const { deps } = makeDeps({ playerClass: createFakeClass({ Class_Name: 'Glutton' }) });
    const result = await logic.run(INPUT, deps);
    expect(result.data.spentAP).toBe(4);
    expect(deps.models.Players.update).toHaveBeenCalledWith(
      { Action_Points: 6, Free_Move: -2 },
      { where: { Discord_ID: DISCORD_ID, Player_ID: 1, Game_ID: 1 } },
    );
  });

  // QUIRK: Free_Move is written through Math.min(..., 0)
  it('spends free movement first and clamps Free_Move at zero', async () => {
    const { deps } = makeDeps({
      player: createFakePlayer({ Player_ID: 1, Discord_ID: DISCORD_ID, Tile_ID: 11, Action_Points: 10, Free_Move: 2 }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result.data.spentAP).toBe(0);
    expect(deps.models.Players.update).toHaveBeenCalledWith(
      { Action_Points: 10, Free_Move: 0 },
      { where: { Discord_ID: DISCORD_ID, Player_ID: 1, Game_ID: 1 } },
    );
  });

  // QUIRK: a zero-distance move still costs the starting tile and replies
  // with an empty string
  it('charges one tile and says nothing for a zero-distance move', async () => {
    const { deps } = makeDeps();
    const result = await logic.run({ ...INPUT, distance: 0 }, deps);
    expect(result.data.response).toBe('');
    expect(result.data.spentAP).toBe(1);
    expect(deps.utils.setPlayerToTile).toHaveBeenCalledWith(1, 1, 1, 1);
  });

  // QUIRK: amountOfRepeats is never incremented, so repeats always read "x2"
  it('collapses repeated identical steps to x2', async () => {
    const { deps } = makeDeps({
      player: createFakePlayer({ Player_ID: 1, Discord_ID: DISCORD_ID, Tile_ID: 11, Action_Points: 10 }),
    });
    const result = await logic.run({ ...INPUT, distance: 3 }, deps);
    expect(result.data.response).toBe('You moved from a Blank1 tile to a Blank1 tile! \nx2 \nx2 \n');
  });

  it('clamps the destination to the layer bound', async () => {
    const { deps } = makeDeps({ layer: createFakeLayer({ Layer_ID: 1, X_Bound: 3, Y_Bound: 5 }) });
    const result = await logic.run({ ...INPUT, distance: 4 }, deps);
    expect(result.data.newX).toBe(3);
  });

  it('walks a custom path and ends where the path ends', async () => {
    const { deps } = makeDeps();
    const result = await logic.run({ ...INPUT, path: 'right,2;' }, deps);
    expect(result.ok).toBe(true);
    expect([result.data.newX, result.data.newY]).toEqual([3, 1]);
    expect(result.data.spentAP).toBe(3);
    expect(deps.utils.setPlayerToTile).toHaveBeenCalledWith(1, 1, 3, 1);
  });

  it('resolves the default game via getOldestActiveGameId when no game is given', async () => {
    const { deps } = makeDeps();
    const result = await logic.run({ ...INPUT, gameId: null }, deps);
    expect(result.ok).toBe(true);
    expect(deps.utils.getOldestActiveGameId).toHaveBeenCalledWith(DISCORD_ID);
  });

  it('marks a Spy movement for deletion', async () => {
    const { deps } = makeDeps({ playerClass: createFakeClass({ Class_Name: 'Spy' }) });
    const result = await logic.run(INPUT, deps);
    expect(result.data.deleteReplyAfterMs).toBe(3000);
  });

  it('burns a player entering a fire tile and runs death logic', async () => {
    const { deps, player } = makeDeps({ board: makeBoard({ '2,1': { Tile_Type: 'Fire' } }) });
    const result = await logic.run(INPUT, deps);
    expect(result.ok).toBe(true);
    expect(deps.models.Players.update).toHaveBeenCalledWith(
      { Health_Points: 7 }, // 10 - fireDmg 3
      { where: { Player_ID: 1 } },
    );
    expect(deps.utils.playerDeathLogic).toHaveBeenCalledWith(null, player);
  });

  it('disperses a smoke tile the player leaves', async () => {
    const { deps, board } = makeDeps({ board: makeBoard({ '1,1': { Tile_Type: 'Smoke' } }) });
    const result = await logic.run(INPUT, deps);
    expect(result.ok).toBe(true);
    expect(deps.utils.revertTileToBlank).toHaveBeenCalledWith(board.byCoord.get('1,1'));
  });

  it('damages the player and clears the mine when stepping on a trap', async () => {
    const trapper = createFakePlayer({ Player_ID: 2, Discord_ID: '456' });
    const { deps, player } = makeDeps({
      board: makeBoard({ '2,1': { trapped: true, trapper: 2 } }),
      trapper,
    });
    const result = await logic.run(INPUT, deps);
    expect(result.ok).toBe(true);
    expect(result.data.response).toBe('You moved from a Blank1 tile to a Blank1 tile IT WAS TRAPPED took 2! \n');
    expect(deps.models.Players.update).toHaveBeenCalledWith(
      { Health_Points: 8 }, // 10 - mineDmg 2
      { where: { Player_ID: 1 } },
    );
    expect(deps.utils.playerDeathLogic).toHaveBeenCalledWith(trapper, player);
    expect(deps.models.Tiles.update).toHaveBeenCalledWith(
      { trapped: false, trapper: null },
      { where: { Tile_ID: 21 } },
    );
  });

  it('gives a Robot 1 HP on a storm tile and throws them a tile', async () => {
    const { deps } = makeDeps({
      board: makeBoard({ '2,1': { Tile_Type: 'Storm' } }),
      player: createFakePlayer({ Player_ID: 1, Class_ID: 19, Discord_ID: DISCORD_ID, Tile_ID: 11, Action_Points: 10, Health_Points: 10 }),
      playerClass: createFakeClass({ Class_ID: 19, Class_Name: 'Robot' }),
      random: (max) => (max === 7 ? 4 : 0), // 4 = east, onto (2,1)
    });
    const result = await logic.run(INPUT, deps);
    expect(result.ok).toBe(true);
    expect(deps.models.Players.update).toHaveBeenCalledWith(
      { Health_Points: 11 },
      { where: { Player_ID: 1 } },
    );
    // once for the storm displacement, once for the requested destination
    expect(deps.utils.setPlayerToTile).toHaveBeenCalledTimes(2);
  });

  it('gives a Stormchaser 1d4-2 AP on a storm tile', async () => {
    const { deps } = makeDeps({
      board: makeBoard({ '2,1': { Tile_Type: 'Storm' } }),
      player: createFakePlayer({ Player_ID: 1, Class_ID: 15, Discord_ID: DISCORD_ID, Tile_ID: 11, Action_Points: 10 }),
      playerClass: createFakeClass({ Class_ID: 15, Class_Name: 'Stormchaser' }),
      random: (max) => (max === 3 ? 2 : 4),
    });
    const result = await logic.run(INPUT, deps);
    expect(result.ok).toBe(true);
    expect(deps.models.Players.update).toHaveBeenCalledWith(
      { Action_Points: 11 }, // 10 + (2 - 1)
      { where: { Player_ID: 1 } },
    );
  });

  it('does not displace a storm-struck player onto forbidden terrain', async () => {
    const { deps } = makeDeps({
      board: makeBoard({ '2,1': { Tile_Type: 'Storm' }, '1,2': { Tile_Type: 'Void' } }),
      random: () => 2, // 2 = south, onto the void tile at (1,2); always re-rolled
    });
    const result = await logic.run(INPUT, deps);
    expect(result.ok).toBe(true);
    // only the final destination move happened, the storm displacement gave up
    expect(deps.utils.setPlayerToTile).toHaveBeenCalledTimes(1);
  });

  it('moves the second body and damages its own HP column', async () => {
    const { deps } = makeDeps({
      board: makeBoard({ '2,1': { Tile_Type: 'Fire' } }),
      player: createFakePlayer({
        Player_ID: 1, Discord_ID: DISCORD_ID, Tile_ID: 55, Tile_ID2: 11,
        Action_Points: 10, Health_Points: 10, Health_Points2: 8,
      }),
      playerClass: createFakeClass({ Class_Name: 'Twin' }),
    });
    const result = await logic.run({ ...INPUT, body: 2 }, deps);
    expect(result.ok).toBe(true);
    expect(result.data.newX).toBe(2);
    expect(deps.models.Players.update).toHaveBeenCalledWith(
      { Health_Points2: 5 }, // 8 - fireDmg 3
      { where: { Player_ID: 1 } },
    );
  });
});

// ---------------------------------------------------------------------------
// present
// ---------------------------------------------------------------------------

describe('move.present', () => {
  it('renders the movement log on success', () => {
    expect(logic.present({ ok: true, kind: 'moved', data: { response: 'You moved! \n' } }))
      .toEqual({ content: 'You moved! \n' });
  });

  it('renders a rejection without data as its shared message', () => {
    expect(logic.present({ ok: false, reason: REJECTIONS.PLAYER_DEAD }))
      .toEqual({ content: "Dead players can't use this command." });
  });

  it.each([
    REJECTIONS.NO_SUCH_GAME,
    REJECTIONS.NOT_IN_GAME,
    REJECTIONS.NO_SUCH_TILE,
    REJECTIONS.PLAYER_DEAD,
    REJECTIONS.GAME_OVER,
    REJECTIONS.GAME_PAUSED,
    REJECTIONS.TIME_STOPPED,
    REJECTIONS.WRONG_TILE_TYPE,
    REJECTIONS.NOT_ENOUGH_AP,
    REJECTIONS.INVALID_PATH,
  ])('renders %s as non-empty text', (reason) => {
    const { content } = logic.present({ ok: false, reason });
    expect(typeof content).toBe('string');
    expect(content.length).toBeGreaterThan(0);
    expect(content).not.toMatch(/undefined/);
  });
});

// ---------------------------------------------------------------------------
// adapter
// ---------------------------------------------------------------------------

describe('move adapter (smoke)', () => {
  it('exports the command contract', () => {
    expect(move.data.toJSON().name).toBe('move');
    expect(typeof move.execute).toBe('function');
  });
});
