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
      damagePlayer: jest.fn(async () => ({})),
      playerDeathLogic: jest.fn(async () => undefined),
      revertTileToBlank: jest.fn(async () => undefined),
      getOldestActiveGameId: jest.fn(async () => 1),
    },
  });
  return { deps, board, layer, game, player, playerClass, trapper };
}

/** the placement option for each body */
const BODY_1 = { body: 1 };
const BODY_2 = { body: 2 };

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
// pure path helpers
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

  // the mandatory trailing ';' leaves an empty [""] segment in the
  // result; consumers skip it.
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

  it('starts each segment where the previous one ended', () => {
    expect(logic.pathToTiles([1, 1], [['right', '2'], ['down', '1'], ['']]))
      .toEqual([[1, 1], [3, 1], [3, 2]]);
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

  it('walks a bent path corner to corner', () => {
    expect(logic.getTileCordinatesOfPath([1, 1], logic.inputPathToArray('right,2;down,2;'), utils))
      .toEqual([[1, 1], [2, 1], [3, 1], [3, 2], [3, 3]]);
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

  it('accepts the one-letter compass directions', async () => {
    const verdict = await logic.verifyInputPath('e,2;s,1;', 1, 1, 1, pathDeps());
    expect(verdict.valid).toBe(true);
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

  it('checks each segment from where the previous one ended', async () => {
    const deps = pathDeps();
    const verdict = await logic.verifyInputPath('right,2;down,1;', 1, 1, 1, deps);
    expect(verdict).toEqual({ valid: true, destination: [3, 2] });
    expect(deps.models.Tiles.findOne).toHaveBeenCalledWith({ where: { Layer_ID: 1, X_Position: 3, Y_Position: 1 } });
    expect(deps.models.Tiles.findOne).toHaveBeenCalledWith({ where: { Layer_ID: 1, X_Position: 3, Y_Position: 2 } });
  });

  // right 2 then right 3 ends on x = 6, off a 5-wide board, though each
  // segment alone would fit
  it('rejects a path that only leaves the board once the segments add up', async () => {
    const verdict = await logic.verifyInputPath('right,2;right,3;', 1, 1, 1, pathDeps());
    expect(verdict.valid).toBe(false);
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

  it('rejects a player who is not in the game, with its own wording', async () => {
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

  // The state -> verdict table belongs to utils.checkGameState, and
  // tests/utils.pure.test.js walks every state in the enum - including a
  // newly added one. What is this command's own is only that run() asks the
  // gate and returns its verdict without writing, so one state that passes,
  // one that blocks, and the timestop (whose answer depends on the
  // isClockwatcher argument this command passes) cover it here.
  it.each([
    [{ GAME_STATE: GAMESTATES.ACTIVE }, null],
    [{ GAME_STATE: GAMESTATES.OVER }, REJECTIONS.GAME_OVER],
    [{ GAME_STATE: GAMESTATES.ACTIVE, timeStopped: true }, REJECTIONS.TIME_STOPPED],
  ])('game %o -> %s', async (condition, reason) => {
    const { deps } = makeDeps({ game: createFakeGame({ Game_ID: 1, ...condition, moveCost: 1 }) });
    const result = await logic.run(INPUT, deps);
    if (reason === null) {
      expect(result.ok).toBe(true);
    } else {
      expect(result).toEqual({ ok: false, reason });
      expect(deps.models.Players.update).not.toHaveBeenCalled();
      expect(deps.utils.setPlayerToTile).not.toHaveBeenCalled();
    }
  });

  // The gate answers before the AP check, so a player in a game that has not
  // started is told that and not something about action points - which is why
  // the message is asserted here and not just the reason code.
  it.each([
    [{ GAME_STATE: GAMESTATES.REGISTRATION }, REJECTIONS.GAME_IN_REGISTRATION],
  ])('%s is refused by the gate, not by the AP check', async (condition, reason) => {
    const { deps } = makeDeps({
      // plenty of AP, so an AP complaint cannot be what comes back
      player: createFakePlayer({
        Player_ID: 1, Class_ID: 1, Game_ID: 1, Discord_ID: DISCORD_ID,
        Action_Points: 99, Health_Points: 10, Free_Move: 0, Tile_ID: 11, Tile_ID2: null,
      }),
      game: createFakeGame({ Game_ID: 1, ...condition, moveCost: 1 }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result).toEqual({ ok: false, reason });
    expect(logic.present(result).content).not.toMatch(/action points/i);
    expect(deps.utils.setPlayerToTile).not.toHaveBeenCalled();
  });

  it('lets a Clockwatcher move during a timestop', async () => {
    const { deps } = makeDeps({
      game: createFakeGame({ Game_ID: 1, GAME_STATE: GAMESTATES.ACTIVE, timeStopped: true, moveCost: 1 }),
      playerClass: createFakeClass({ Class_Name: 'Clockwatcher' }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result.ok).toBe(true);
  });

  it.each(['Average', 'Snowman'])('refuses a %s ending a movement on ice', async (className) => {
    const { deps } = makeDeps({
      board: makeBoard({ '2,1': { Tile_Type: 'Ice' } }),
      playerClass: createFakeClass({ Class_Name: className }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result.reason).toBe(REJECTIONS.WRONG_TILE_TYPE);
    expect(logic.present(result)).toEqual({
      content: 'Cannot end a movement on an ice tile, please either provide a path that moves off the ice, or move onto a non-ice tile.',
    });
    expect(deps.models.Players.update).not.toHaveBeenCalled();
    expect(deps.utils.setPlayerToTile).not.toHaveBeenCalled();
  });

  it('lets a Cloudborn end a movement on ice', async () => {
    const { deps } = makeDeps({
      board: makeBoard({ '2,1': { Tile_Type: 'Ice' } }),
      playerClass: createFakeClass({ Class_ID: 6, Class_Name: 'Cloudborn' }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result.ok).toBe(true);
    // the one tile stepped onto is ice, so the move is free
    expect(result.data.spentAP).toBe(0);
  });

  it('rejects a move onto a coordinate with no tile row', async () => {
    const board = makeBoard();
    board.byCoord.delete('2,1');
    const { deps } = makeDeps({ board });
    const result = await logic.run(INPUT, deps);
    expect(result).toEqual({ ok: false, reason: REJECTIONS.NO_SUCH_TILE });
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  it('rejects when the player is one AP short (boundary)', async () => {
    // two tiles east = 2 tiles stepped onto = 2 AP at moveCost 1
    const { deps } = makeDeps({
      player: createFakePlayer({ Player_ID: 1, Discord_ID: DISCORD_ID, Tile_ID: 11, Action_Points: 1, Free_Move: 0 }),
    });
    const result = await logic.run({ ...INPUT, distance: 2 }, deps);
    expect(result.reason).toBe(REJECTIONS.NOT_ENOUGH_AP);
    expect(logic.present(result)).toEqual({ content: 'Player does not enough action points for movement requested.' });
    expect(deps.models.Players.update).not.toHaveBeenCalled();
    expect(deps.utils.setPlayerToTile).not.toHaveBeenCalled();
  });

  it('accepts when the player has exactly enough AP (boundary)', async () => {
    const { deps } = makeDeps({
      player: createFakePlayer({ Player_ID: 1, Discord_ID: DISCORD_ID, Tile_ID: 11, Action_Points: 2, Free_Move: 0 }),
    });
    const result = await logic.run({ ...INPUT, distance: 2 }, deps);
    expect(result.ok).toBe(true);
    expect(result.data.spentAP).toBe(2);
  });

  it.each(['Void', 'Wall', 'Wall_Damaged'])('refuses a non-Cloudborn crossing %s, before any tile on the way acts', async (tileType) => {
    const { deps } = makeDeps({ board: makeBoard({ '2,1': { Tile_Type: 'Fire' }, '3,1': { Tile_Type: tileType } }) });
    const result = await logic.run({ ...INPUT, distance: 3 }, deps);
    expect(result.reason).toBe(REJECTIONS.WRONG_TILE_TYPE);
    expect(logic.present(result).content)
      .toBe('Your move crosses a wall, damaged wall or void tile. Only a Cloudborn can move onto those.');
    expect(deps.utils.damagePlayer).not.toHaveBeenCalled();
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
        spentAP: 1,
        newX: 2,
        newY: 1,
        layerId: 1,
        deleteReplyAfterMs: null,
      },
    });
    expect(deps.utils.setPlayerToTile).toHaveBeenCalledWith(1, 1, 2, 1, BODY_1);
    expect(deps.models.Players.update).toHaveBeenCalledWith(
      { Action_Points: 9, Free_Move: 0 },
      { where: { Discord_ID: DISCORD_ID, Player_ID: 1, Game_ID: 1 } },
    );
    expect(deps.models.Players.update).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['east', 4, 3],
    ['west', 2, 3],
    ['north', 3, 2],
    ['south', 3, 4],
    ['northeast', 4, 2],
    ['northwest', 2, 2],
    ['southeast', 4, 4],
    ['southwest', 2, 4],
  ])('direction %s lands on (%i, %i)', async (direction, x, y) => {
    // start from the middle of the board so every direction has a tile
    const { deps } = makeDeps({
      player: createFakePlayer({ Player_ID: 1, Discord_ID: DISCORD_ID, Tile_ID: 33, Action_Points: 10 }),
    });
    const result = await logic.run({ ...INPUT, direction }, deps);
    expect(result.ok).toBe(true);
    expect([result.data.newX, result.data.newY]).toEqual([x, y]);
    expect(deps.utils.setPlayerToTile).toHaveBeenCalledWith(1, 1, x, y, BODY_1);
  });

  // the board draws row 1 at the top, so north and up are both -y
  it.each([
    ['north', 'up'], ['north', 'n'],
    ['south', 'down'], ['south', 's'],
    ['west', 'left'], ['west', 'w'],
    ['east', 'right'], ['east', 'e'],
    ['northeast', 'ne'], ['northwest', 'nw'],
    ['southeast', 'se'], ['southwest', 'sw'],
  ])('the %s option and the %s path segment go the same way', (option, segment) => {
    const [dx, dy] = logic.DIRECTION_DELTAS[option];
    expect(logic.pathToTiles([3, 3], [[segment, '1'], ['']])).toEqual([[3, 3], [3 + dx, 3 + dy]]);
  });

  it('agrees with utils.getDirection about every direction', () => {
    const utils = require('../../../utils.js');
    const disagreements = Object.entries(logic.DIRECTION_DELTAS)
      .filter(([name, [dx, dy]]) => utils.getDirection([3, 3], [3 + dx, 3 + dy]) !== name)
      .map(([name]) => name);
    expect(disagreements).toEqual([]);
  });

  it('labels every /move choice with the direction it moves', () => {
    const catalog = require('../../../commandCatalog.js');
    const commands = catalog.COMMANDS || catalog;
    const choices = commands.move.options.direction.choices;
    const LABEL_TO_VALUE = {
      left: 'west', right: 'east', up: 'north', down: 'south',
      nw: 'northwest', ne: 'northeast', sw: 'southwest', se: 'southeast',
    };
    const mislabelled = choices.filter((c) => LABEL_TO_VALUE[c.name] !== c.value).map((c) => c.name);
    expect(mislabelled).toEqual([]);
    expect(choices).toHaveLength(8);
  });

  it.each([1, 2, 4])('charges a %i-tile move %i AP at moveCost 1', async (distance) => {
    const { deps } = makeDeps();
    const result = await logic.run({ ...INPUT, distance }, deps);
    expect(result.data.spentAP).toBe(distance);
  });

  it('does not charge for leaving the tile the player starts on, even if it is ice', async () => {
    const { deps } = makeDeps({ board: makeBoard({ '1,1': { Tile_Type: 'Ice' } }) });
    const result = await logic.run(INPUT, deps);
    expect(result.data.spentAP).toBe(1);
  });

  it('charges a Glutton double', async () => {
    const { deps } = makeDeps({ playerClass: createFakeClass({ Class_Name: 'Glutton' }) });
    const result = await logic.run(INPUT, deps);
    expect(result.data.spentAP).toBe(2);
    expect(deps.models.Players.update).toHaveBeenCalledWith(
      { Action_Points: 8, Free_Move: 0 },
      { where: { Discord_ID: DISCORD_ID, Player_ID: 1, Game_ID: 1 } },
    );
  });

  it.each([
    // [free movement, tiles walked, AP spent, free movement left]
    [2, 1, 0, 1],
    [2, 2, 0, 0],
    [2, 3, 1, 0],
    [0, 2, 2, 0],
  ])('with %i free movement, a %i-tile move spends %i AP and leaves %i', async (freeMove, distance, ap, left) => {
    const { deps } = makeDeps({
      player: createFakePlayer({ Player_ID: 1, Discord_ID: DISCORD_ID, Tile_ID: 11, Action_Points: 10, Free_Move: freeMove }),
    });
    const result = await logic.run({ ...INPUT, distance }, deps);
    expect(result.data.spentAP).toBe(ap);
    expect(deps.models.Players.update).toHaveBeenCalledWith(
      { Action_Points: 10 - ap, Free_Move: left },
      { where: { Discord_ID: DISCORD_ID, Player_ID: 1, Game_ID: 1 } },
    );
  });

  it.each([
    ['a zero-distance move', { distance: 0 }],
    ['a walk into the edge the player is standing on', { direction: 'west' }],
  ])('refuses %s, before anything happens', async (_what, move) => {
    const { deps } = makeDeps();
    const result = await logic.run({ ...INPUT, ...move }, deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.NO_MOVEMENT });
    expect(logic.present(result).content).toBe('That move would not take you anywhere. Move at least one tile!');
    expect(deps.utils.setPlayerToTile).not.toHaveBeenCalled();
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  it('lets a path loop back to where it started, and charges for every step', async () => {
    const { deps } = makeDeps();
    const result = await logic.run({ ...INPUT, path: 'right,1;down,1;left,1;up,1;' }, deps);
    expect(result.ok).toBe(true);
    expect([result.data.newX, result.data.newY]).toEqual([1, 1]);
    expect(result.data.spentAP).toBe(4);
    // they end on the tile they are already on, so nobody is re-placed
    expect(deps.utils.setPlayerToTile).not.toHaveBeenCalled();
  });

  it.each([
    [2, 'You moved from a Blank1 tile to a Blank1 tile! \nx2 \n'],
    [3, 'You moved from a Blank1 tile to a Blank1 tile! \nx3 \n'],
    [4, 'You moved from a Blank1 tile to a Blank1 tile! \nx4 \n'],
  ])('counts a run of %i identical steps once, as xN', async (distance, response) => {
    const { deps } = makeDeps();
    const result = await logic.run({ ...INPUT, distance }, deps);
    expect(result.data.response).toBe(response);
  });

  it('counts each run separately when the tiles change between them', async () => {
    const { deps } = makeDeps({ board: makeBoard({ '4,1': { Tile_Type: 'Blank2' } }) });
    const result = await logic.run({ ...INPUT, distance: 4 }, deps);
    expect(result.data.response).toBe(
      'You moved from a Blank1 tile to a Blank1 tile! \nx2 \n'
      + 'You moved from a Blank1 tile to a Blank2 tile! \n'
      + 'You moved from a Blank2 tile to a Blank1 tile! \n',
    );
  });

  it('clamps the destination to the layer bound', async () => {
    const { deps } = makeDeps({ layer: createFakeLayer({ Layer_ID: 1, X_Bound: 3, Y_Bound: 5 }) });
    const result = await logic.run({ ...INPUT, distance: 4 }, deps);
    expect(result.data.newX).toBe(3);
  });

  it.each([
    ['west', [1, 3]],
    ['north', [3, 1]],
    ['northwest', [1, 1]],
  ])('stops a walk %s off the board at the layer\'s (1,1) edge', async (direction, landing) => {
    const { deps } = makeDeps({
      player: createFakePlayer({ Player_ID: 1, Discord_ID: DISCORD_ID, Tile_ID: 33, Action_Points: 10 }),
    });
    const result = await logic.run({ ...INPUT, direction, distance: 4 }, deps);
    expect(result.ok).toBe(true);
    expect([result.data.newX, result.data.newY]).toEqual(landing);
    expect(deps.utils.setPlayerToTile).toHaveBeenCalledWith(1, 1, ...landing, BODY_1);
  });

  it('walks a custom path and ends where the path ends', async () => {
    const { deps } = makeDeps();
    const result = await logic.run({ ...INPUT, path: 'right,2;' }, deps);
    expect(result.ok).toBe(true);
    expect([result.data.newX, result.data.newY]).toEqual([3, 1]);
    expect(result.data.spentAP).toBe(2);
    expect(deps.utils.setPlayerToTile).toHaveBeenCalledWith(1, 1, 3, 1, BODY_1);
  });

  it('walks a bent path to the end of its last segment', async () => {
    const { deps } = makeDeps();
    const result = await logic.run({ ...INPUT, path: 'right,2;down,2;' }, deps);
    expect(result.ok).toBe(true);
    expect([result.data.newX, result.data.newY]).toEqual([3, 3]);
    expect(deps.utils.setPlayerToTile).toHaveBeenCalledWith(1, 1, 3, 3, BODY_1);
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
    // damagePlayer writes the HP and runs the death check
    expect(deps.utils.damagePlayer).toHaveBeenCalledWith(null, player, 3, 1);
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
    expect(deps.utils.damagePlayer).toHaveBeenCalledWith(trapper, player, 2, 1);
    expect(deps.models.Tiles.update).toHaveBeenCalledWith(
      { trapped: false, trapper: null },
      { where: { Tile_ID: 21 } },
    );
  });

  it('gives a Robot 1 HP on a storm tile and storms them a tile', async () => {
    const { deps } = makeDeps({
      board: makeBoard({ '2,1': { Tile_Type: 'Storm' } }),
      player: createFakePlayer({ Player_ID: 1, Class_ID: 19, Discord_ID: DISCORD_ID, Tile_ID: 11, Action_Points: 10, Health_Points: 10 }),
      playerClass: createFakeClass({ Class_ID: 19, Class_Name: 'Robot' }),
      random: (max) => (max === 7 ? 4 : 0), // 4 = east, onto (2,1)
    });
    const result = await logic.run(INPUT, deps);
    expect(result.ok).toBe(true);
    // capped at MAX_HP with the overflow banked, like every other HP gain
    expect(deps.models.Players.update).toHaveBeenCalledWith(
      { Health_Points: 10, MISSED_HP: 1 },
      { where: { Player_ID: 1 } },
    );
    // stormed east off (2,1), and placed once, where it landed
    expect(deps.utils.setPlayerToTile).toHaveBeenCalledTimes(1);
    expect(deps.utils.setPlayerToTile).toHaveBeenCalledWith(1, 1, 3, 1, BODY_1);
  });

  // random(7) picks the stormed direction: 2 is south, 4 is east
  it('storms a player on their last step, and they end where they land', async () => {
    const { deps } = makeDeps({
      board: makeBoard({ '2,1': { Tile_Type: 'Storm' } }),
      random: () => 2,
    });
    const result = await logic.run(INPUT, deps);
    expect(result.ok).toBe(true);
    // one south of the storm tile, not of the tile they stepped off
    expect([result.data.newX, result.data.newY]).toEqual([2, 2]);
    expect(deps.utils.setPlayerToTile).toHaveBeenCalledTimes(1);
    expect(deps.utils.setPlayerToTile).toHaveBeenCalledWith(1, 1, 2, 2, BODY_1);
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

  /** four other players on one tile */
  const FULL = { Player1: 7, Player2: 8, Player3: 9, Player4: 10 };

  /** random(7) answers from `directions` in order; everything else answers 0 */
  function stormsInOrder(...directions) {
    return (max) => (max === 7 ? directions.shift() : 0);
  }

  it('refuses a move that ends on a full tile, before anything happens', async () => {
    const { deps } = makeDeps({ board: makeBoard({ '2,1': FULL }) });
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.TILE_FULL });
    expect(logic.present(result).content).toBe('Your move crosses or ends on a full tile. Pick a path around it.');
    expect(deps.utils.setPlayerToTile).not.toHaveBeenCalled();
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  it('refuses a move that crosses a full tile, before any tile on the way acts', async () => {
    const { deps } = makeDeps({ board: makeBoard({ '2,1': { Tile_Type: 'Fire' }, '3,1': FULL }) });
    const result = await logic.run({ ...INPUT, distance: 3 }, deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.TILE_FULL });
    expect(deps.utils.damagePlayer).not.toHaveBeenCalled();
    expect(deps.utils.setPlayerToTile).not.toHaveBeenCalled();
  });

  it('may cross the tile it started on even when that tile is full', async () => {
    const { deps } = makeDeps({ board: makeBoard({ '1,1': { Player1: 1, Player2: 8, Player3: 9, Player4: 10 } }) });
    const result = await logic.run({ ...INPUT, path: 'right,1;left,1;down,1;' }, deps);
    expect(result.ok).toBe(true);
    expect([result.data.newX, result.data.newY]).toEqual([1, 2]);
  });

  it.each([
    ['a direction move', { distance: 2 }],
    ['a path', { path: 'right,1;down,1;' }],
  ])('refuses %s that crosses a storm, before anything happens', async (_what, move) => {
    const { deps } = makeDeps({ board: makeBoard({ '2,1': { Tile_Type: 'Storm' } }) });
    const result = await logic.run({ ...INPUT, ...move }, deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.WRONG_TILE_TYPE });
    expect(logic.present(result).content)
      .toBe('Your move crosses a storm tile. You can end a move on a storm, but not walk through one.');
    expect(deps.utils.setPlayerToTile).not.toHaveBeenCalled();
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  it.each([
    ['full', { '2,2': FULL }, 2],
    ['off the board', {}, 6],
    ['a wall', { '2,2': { Tile_Type: 'Wall' } }, 2],
    ['ice', { '2,2': { Tile_Type: 'Ice' } }, 2],
  ])('leaves a player on the storm when the tile it would move them onto is %s', async (_what, tiles, direction) => {
    const { deps } = makeDeps({
      board: makeBoard({ '2,1': { Tile_Type: 'Storm' }, ...tiles }),
      random: stormsInOrder(direction),
    });
    const result = await logic.run(INPUT, deps);
    expect(result.ok).toBe(true);
    expect([result.data.newX, result.data.newY]).toEqual([2, 1]);
    expect(result.data.spentAP).toBe(1);
    expect(result.data.response).toContain('so you stayed on the storm!');
    expect(deps.utils.setPlayerToTile).toHaveBeenCalledWith(1, 1, 2, 1, BODY_1);
  });

  it('lets a storm move a Cloudborn onto ice', async () => {
    const { deps } = makeDeps({
      board: makeBoard({ '2,1': { Tile_Type: 'Storm' }, '2,2': { Tile_Type: 'Ice' } }),
      player: createFakePlayer({ Player_ID: 1, Class_ID: 6, Discord_ID: DISCORD_ID, Tile_ID: 11, Action_Points: 10 }),
      playerClass: createFakeClass({ Class_ID: 6, Class_Name: 'Cloudborn' }),
      random: stormsInOrder(2),
    });
    const result = await logic.run(INPUT, deps);
    expect(result.ok).toBe(true);
    expect([result.data.newX, result.data.newY]).toEqual([2, 2]);
  });

  it('charges only the tiles reached when a tile kills the mover', async () => {
    const { deps } = makeDeps({ board: makeBoard({ '2,1': { Tile_Type: 'Fire' } }) });
    deps.utils.damagePlayer = jest.fn(async () => ({ Dead: true }));
    const result = await logic.run({ ...INPUT, distance: 3 }, deps);
    expect(result.ok).toBe(true);
    expect(result.data.spentAP).toBe(1);
    expect(deps.utils.setPlayerToTile).not.toHaveBeenCalled();
  });

  it('does not displace a storm-struck player onto forbidden terrain', async () => {
    const { deps } = makeDeps({
      board: makeBoard({ '2,1': { Tile_Type: 'Storm' }, '2,2': { Tile_Type: 'Void' } }),
      random: () => 2, // 2 = south of the storm, onto the void tile at (2,2); always re-rolled
    });
    const result = await logic.run(INPUT, deps);
    expect(result.ok).toBe(true);
    // every roll failed, so the player stays on the storm and the walk ends
    // where it was going
    expect([result.data.newX, result.data.newY]).toEqual([2, 1]);
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
    expect(deps.utils.setPlayerToTile).toHaveBeenCalledWith(1, 1, 2, 1, BODY_2);
    // body 2 is damaged through its own column
    expect(deps.utils.damagePlayer).toHaveBeenCalledWith(
      null, expect.objectContaining({ Player_ID: 1 }), 3, 2,
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
});

// ---------------------------------------------------------------------------
// internal logging (move.logic.js is the one logic file over the size
// threshold, so it logs its own steps - see tests/logicFileLogging.test.js)
// ---------------------------------------------------------------------------

describe('move internal logging', () => {
  function capturing() {
    const lines = [];
    const child = {
      debug: (obj, msg) => lines.push({ obj, msg }),
      info: () => {},
      error: () => {},
    };
    return { logger: { child: () => child }, lines };
  }

  const steps = (lines) => lines.map((line) => line.obj.function);

  it('records the walk it decided on, step by step', async () => {
    const { logger, lines } = capturing();
    const { deps } = makeDeps();
    deps.logger = logger;

    const result = await logic.run({ ...INPUT, distance: 3 }, deps);

    expect(result.ok).toBe(true);
    // 1,1 -> 4,1 is four coordinates, so three steps between them
    expect(steps(lines)).toEqual(['resolved', 'destination', 'cost', 'step', 'step', 'step', 'placed', 'charged']);

    const destination = lines.find((line) => line.obj.function === 'destination').obj;
    expect(destination).toMatchObject({ via: 'direction', direction: 'east', distance: 3, to: [4, 1], tilesWalked: 4 });

    const walked = lines.filter((line) => line.obj.function === 'step').map((line) => line.obj);
    expect(walked.map((step) => step.to)).toEqual([[2, 1], [3, 1], [4, 1]]);
    expect(walked.every((step) => step.of === 3)).toBe(true);

    expect(lines.find((line) => line.obj.function === 'placed').obj).toMatchObject({ at: [4, 1], layerId: 1 });
  });

  it('records the AP arithmetic including the ice discount', async () => {
    const { logger, lines } = capturing();
    const { deps } = makeDeps({ board: makeBoard({ '2,1': { Tile_Type: 'Ice' } }) });
    deps.logger = logger;

    await logic.run({ ...INPUT, distance: 2 }, deps);

    // two tiles stepped onto, one of them ice, so one billable at cost 1
    expect(lines.find((line) => line.obj.function === 'cost').obj).toMatchObject({
      tilesEntered: 2, iceTileDeduction: 1, freeMoveUsed: 0, billableTiles: 1, moveCost: 1, doubled: false, spentAP: 1,
    });
  });

  it('records a tile effect and where a lethal tile stopped the walk', async () => {
    const { logger, lines } = capturing();
    const { deps } = makeDeps({ board: makeBoard({ '2,1': { Tile_Type: 'Fire' } }) });
    deps.utils.damagePlayer = jest.fn(async () => ({ Dead: true }));
    deps.logger = logger;

    await logic.run({ ...INPUT, distance: 3 }, deps);

    expect(lines.find((line) => line.obj.function === 'tileEffect').obj)
      .toMatchObject({ effect: 'fireOnEntry', damage: 3, body: 1 });
    expect(lines.find((line) => line.obj.function === 'diedMidWalk').obj)
      .toMatchObject({ index: 0, at: [2, 1], tileType: 'Fire' });
    // the walk stopped, so neither the later steps nor the placement happened
    expect(steps(lines)).not.toContain('placed');
    expect(steps(lines).filter((step) => step === 'step')).toHaveLength(1);
  });

  it('records why a rejection happened, not just that it did', async () => {
    const { logger, lines } = capturing();
    const { deps } = makeDeps({ player: createFakePlayer({
      Player_ID: 1, Class_ID: 1, Game_ID: 1, Discord_ID: DISCORD_ID,
      Action_Points: 1, Health_Points: 10, Free_Move: 0, Tile_ID: 11, Tile_ID2: null,
    }) });
    deps.logger = logger;

    const result = await logic.run({ ...INPUT, distance: 3 }, deps);

    expect(result.reason).toBe(REJECTIONS.NOT_ENOUGH_AP);
    // the cost line is what makes the rejection explicable
    expect(lines.find((line) => line.obj.function === 'cost').obj).toMatchObject({ spentAP: 3, ap: 1 });
    expect(steps(lines)).not.toContain('step');
  });

  it('logs nothing at all when no logger is injected', async () => {
    const saved = globalThis.topLogger;
    globalThis.topLogger = undefined;
    try {
      const { deps } = makeDeps();
      // the guarantee that let this land without touching the other 600 tests
      await expect(logic.run(INPUT, deps)).resolves.toMatchObject({ ok: true });
    } finally {
      globalThis.topLogger = saved;
    }
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
