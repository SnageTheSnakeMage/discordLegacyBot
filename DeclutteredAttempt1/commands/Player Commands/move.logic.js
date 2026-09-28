/**
 * /move - walk a player <distance> tiles in <direction>, or along a custom
 * path, paying AP per tile and resolving whatever the tiles do to them.
 *
 * The rules:
 * - Row 1 is drawn at the top, so north/up is -y, south/down +y, west/left
 *   -x and east/right +x, for the direction option and path segments alike.
 * - Every layer runs from (1,1) to (X_Bound, Y_Bound); a direction move that
 *   would leave it stops at the edge. A path that would leave it is refused.
 * - Each path segment starts where the previous one ended.
 * - A move that would end where the player already is is refused.
 * - A move is checked before anything happens, and refused if any tile on
 *   it is full (the tile the player starts on aside), if it crosses a storm,
 *   or if it ends on ice and the player is not a Snowman. A storm may only be
 *   where a move ends.
 * - A player pays moveCost (doubled for a Glutton) per tile they step onto,
 *   not for the tile they start on. Ice stepped onto is free and free
 *   movement pays before AP does. A player killed partway pays only for the
 *   tiles they reached.
 * - A move that ends on a storm storms the player one tile off it in a random
 *   direction. If that tile is off the board, full, or (unless they are a
 *   Cloudborn) a wall, void or ice, they stay on the storm instead.
 *
 * parse/run/present per TESTING.md Part 1. run() takes plain data and a deps
 * bundle and returns a CommandResult; it never sees an interaction.
 *
 * This file also logs its own internals via stepLogger (commands/_logging.js),
 * which the other logic files do not: it is the only one over the size
 * threshold that tests/logicFileLogging.test.js enforces. A walk is a loop
 * with damage in it, so "rejected: NO_SUCH_TILE" does not say how far the
 * player got or what the tiles already did to them - the step lines do.
 *
 * This file must never import discord.js or the adapter.
 */
const { REJECTIONS } = require('../../enums.js');
const { messageFor } = require('../_messages.js');
const { stepLogger } = require('../_logging.js');
const defaultDeps = require('../_deps.js');

/** Class_ID 6 is Cloudborn - the only class allowed on wall/void terrain. */
const CLOUDBORN_CLASS_ID = 6;
/** Class_ID 19 is Robot, 15 is Stormchaser - both get a bonus on storm tiles. */
const ROBOT_CLASS_ID = 19;
const STORMCHASER_CLASS_ID = 15;

/** terrain a non-Cloudborn may not be stormed onto */
const STORM_FORBIDDEN_TILE_TYPES = ['Wall', 'Wall_Damaged', 'Void', 'Ice'];

/**
 * The board's y grows downwards (row 1 is drawn at the top), so north is -y
 * and south is +y; west is -x and east is +x. The direction option and path
 * segments share this table.
 */
const DIRECTION_DELTAS = {
  west: [-1, 0],
  east: [1, 0],
  north: [0, -1],
  south: [0, 1],
  northeast: [1, -1],
  northwest: [-1, -1],
  southeast: [1, 1],
  southwest: [-1, 1],
};

/** path segment direction -> the direction it names */
const PATH_DELTAS = {
  left: DIRECTION_DELTAS.west, w: DIRECTION_DELTAS.west,
  right: DIRECTION_DELTAS.east, e: DIRECTION_DELTAS.east,
  up: DIRECTION_DELTAS.north, n: DIRECTION_DELTAS.north,
  down: DIRECTION_DELTAS.south, s: DIRECTION_DELTAS.south,
  nw: DIRECTION_DELTAS.northwest,
  ne: DIRECTION_DELTAS.northeast,
  sw: DIRECTION_DELTAS.southwest,
  se: DIRECTION_DELTAS.southeast,
};

/** random 0-7 -> [dx, dy] for being stormed */
const RANDOM_DIRECTION_DELTAS = [
  [-1, 0],  // 0 west
  [-1, 1],  // 1 southwest
  [0, 1],   // 2 south
  [1, 1],   // 3 southeast
  [1, 0],   // 4 east
  [1, -1],  // 5 northeast
  [0, -1],  // 6 north
  [-1, -1], // 7 northwest
];

const PATH_REGEX = /^((?:left|right|up|down|ne|nw|se|sw|n|s|e|w),\d+;)+$/;

// player-facing wording, carried in a rejection's data.message
const MSG_NO_PLAYER = 'Player not found in game!, please register for the game you wish to move in.';
const MSG_NO_TILE = "Current tile not found! please register, or ask a Dev about why your not on the board";
const MSG_ICE_END = 'Cannot end a movement on an ice tile, please either provide a path that moves off the ice, or move onto a non-ice tile.';
const MSG_FULL_TILE = 'Your move crosses or ends on a full tile. Pick a path around it.';
const MSG_STORM_ON_PATH = 'Your move crosses a storm tile. You can end a move on a storm, but not walk through one.';
const MSG_NO_AP = 'Player does not enough action points for movement requested.';
const MSG_BAD_PATH_TILE = 'Invalid input path, your path goes to a nonexistent tile or a tile your path goes on could not be found. If you think this is a mistake contact snage.';
const MSG_BAD_PATH_DIRECTION = 'Invalid input path, your are using a direction that isnt: left,right,up,down,n,s,e,w,nw,ne,sw, or se';
const MSG_BAD_PATH_FORMAT = "Invalid input path, make sure your path uses a direction(left,right,up,down,n,s,e,w,nw,ne,sw,se) then a comma(,) and a number separated & ended by a semicolon(;). Also make sure it doesnt take you off the layer you are currently on. For example: 'sw,2;n,1;' and 'up,2;e,1;' are valid as long as they do not move to a tile that doesn't exist";

// ---------------------------------------------------------------------------
// pure path helpers
// ---------------------------------------------------------------------------

/**
 * "right,2;down,1;" -> [["right","2"],["down","1"]]
 * Distances stay strings; every consumer parseInt()s them.
 */
function inputPathToArray(inputPath) {
  return inputPath.split(';').map((row) => row.split(','));
}

/**
 * Prepends the command's own direction/distance to a path array, translating
 * the short direction name into the long one the direction option uses.
 * Throws on an unknown direction.
 */
function addStartToPathArray(initalMoveDirection, initalMoveDistance, pathArray) {
  switch (initalMoveDirection) {
    case 'ne': initalMoveDirection = 'northeast'; break;
    case 'nw': initalMoveDirection = 'northwest'; break;
    case 'se': initalMoveDirection = 'southeast'; break;
    case 'sw': initalMoveDirection = 'southwest'; break;
    case 'left': initalMoveDirection = 'west'; break;
    case 'right': initalMoveDirection = 'east'; break;
    case 'up': initalMoveDirection = 'north'; break;
    case 'down': initalMoveDirection = 'south'; break;
    default:
      throw new Error('Invalid inital movement direction cannot parse into complete path array');
  }
  pathArray.unshift([initalMoveDirection, initalMoveDistance]);
  return pathArray;
}

/**
 * Turns a path into the [x, y] of the start plus the end of every segment.
 * Each segment starts where the previous one ended. startingTile is an
 * [x, y] array.
 */
function pathToTiles(startingTile, path) {
  const tiles = [[startingTile[0], startingTile[1]]];
  let [x, y] = startingTile;
  for (const segment of path) {
    // a well-formed path ends in ';', so split() leaves a trailing [""]
    if (!segment[0]) continue;
    const delta = PATH_DELTAS[segment[0]];
    if (!delta) {
      throw new Error('Invalid input path, your are using a direction that isnt: left,w,right,e,up,n,down,s,nw,ne,sw, or se contact snage as this should not be possible.');
    }
    const distance = parseInt(segment[1], 10);
    x += delta[0] * distance;
    y += delta[1] * distance;
    tiles.push([x, y]);
  }
  return tiles;
}

/**
 * getTileCordinatesOfLine, but for a whole path: one flat list of every tile
 * the path crosses, start included, junctions not repeated.
 */
function getTileCordinatesOfPath(startingTile, path, utils) {
  const corners = pathToTiles(startingTile, path);
  let returnedTiles = [];
  for (let i = 0; i < corners.length - 1; i++) {
    const segment = utils.getTileCordinatesOfLine(corners[i], corners[i + 1]);
    returnedTiles = returnedTiles.concat(i === 0 ? segment : segment.slice(1));
  }
  if (returnedTiles.length === 0) returnedTiles = [corners[0]];
  return returnedTiles;
}

/**
 * Checks a raw path string: right shape, the end of every segment is a tile
 * that exists, and the destination is inside the layer's bounds. Segments
 * chain, as in pathToTiles. Returns a verdict so run() can turn it into a
 * rejection code.
 */
async function verifyInputPath(inputPath, layerId, startingTileXPosition, startingTileYPosition, deps = defaultDeps) {
  const { models } = deps;
  if (!PATH_REGEX.test(inputPath)) {
    return { valid: false, message: MSG_BAD_PATH_FORMAT };
  }
  const path = inputPathToArray(inputPath);
  for (const segment of path) {
    if (segment[0] && !PATH_DELTAS[segment[0]]) {
      return { valid: false, message: MSG_BAD_PATH_DIRECTION };
    }
  }
  const corners = pathToTiles([startingTileXPosition, startingTileYPosition], path);
  for (const [x, y] of corners.slice(1)) {
    const tile = await models.Tiles.findOne({ where: { Layer_ID: layerId, X_Position: x, Y_Position: y } });
    if (tile == null) {
      return { valid: false, message: MSG_BAD_PATH_TILE };
    }
  }
  const destination = corners[corners.length - 1];
  const curLayer = await models.Layers.findByPk(layerId);
  if (curLayer && (destination[0] < 1 || destination[1] < 1
    || curLayer.X_Bound < destination[0] || curLayer.Y_Bound < destination[1])) {
    return { valid: false, message: MSG_BAD_PATH_FORMAT };
  }
  return { valid: true, destination };
}

// ---------------------------------------------------------------------------
// tile-to-tile effects
// ---------------------------------------------------------------------------

/**
 * One tile of movement: what the tile being left does, what the tile being
 * entered does, and whether it was mined. Returns undefined normally,
 * { blocked: true, ... } when the player may not enter the tile at all,
 * { died: true } when the tile killed them, or { stormedBy: [dx, dy] } when
 * a storm is moving them; the walk decides where that leaves them.
 *
 * secondBody selects the twin's second body's columns.
 */
async function moveFromTiletoTile(startTile, endTile, player, secondBody, game, deps) {
  const { models, utils, random } = deps;
  const trace = stepLogger('move', deps);
  const body = secondBody ? 2 : 1;
  const currentHp = secondBody ? player.Health_Points2 : player.Health_Points;
  let stormedBy = null;

  switch (startTile.Tile_Type) {
    // leaving a fire tile burns the player
    case 'Fire':
      // damagePlayer re-reads the row before the death check, so a lethal
      // fire tile kills
      trace('tileEffect', { effect: 'fireOnExit', damage: game.fireDmg, body, playerId: player.Player_ID });
      if ((await utils.damagePlayer(null, player, game.fireDmg, body)).Dead) return { died: true };
      break;
    // leaving a smoke tile disperses it
    case 'Smoke':
      trace('tileEffect', { effect: 'smokeDispersed', tileId: startTile.Tile_ID });
      await utils.revertTileToBlank(startTile);
      break;
    default:
      break;
  }

  switch (endTile.Tile_Type) {
    // entering a fire tile burns the player
    case 'Fire':
      trace('tileEffect', { effect: 'fireOnEntry', damage: game.fireDmg, body, playerId: player.Player_ID });
      if ((await utils.damagePlayer(null, player, game.fireDmg, body)).Dead) return { died: true };
      break;
    case 'Storm':
      trace('tileEffect', { effect: 'storm', classId: player.Class_ID, playerId: player.Player_ID });
      // a Robot gains 1 HP
      if (player.Class_ID == ROBOT_CLASS_ID) {
        // capped, with the overflow banked as MISSED_HP like every other gain
        await models.Players.update(
          secondBody
            ? { Health_Points2: Math.min(currentHp + 1, player.MAX_HP) }
            : utils.hpGain(player, 1),
          { where: { Player_ID: player.Player_ID } },
        );
      }
      // a Stormchaser gains 1d4-2 AP
      if (player.Class_ID == STORMCHASER_CLASS_ID) {
        await models.Players.update({ Action_Points: player.Action_Points + (random(3) - 1) }, { where: { Player_ID: player.Player_ID } });
      }
      // and everyone is stormed one tile off it in a random direction
      stormedBy = rollStormDirection(deps);
      break;
    case 'Void':
    case 'Wall':
    case 'Wall_Damaged':
      // only a Cloudborn may stand on these
      if (player.Class_ID != CLOUDBORN_CLASS_ID) {
        trace('tileEffect', { effect: 'terrainBlocked', tileType: endTile.Tile_Type, classId: player.Class_ID });
        return {
          blocked: true,
          reason: REJECTIONS.WRONG_TILE_TYPE,
          data: { message: '[ERROR] Player ' + player.Discord_ID + ' cannot move onto void wall or wall damaged tiles' },
        };
      }
      break;
    default:
      break;
  }

  if (endTile.trapped) {
    const trapper = await models.Players.findByPk(endTile.trapper);
    if (!trapper) {
      // a real invariant violation, not something a player can cause
      throw new Error('Mine without trapper found. Please contact snage.');
    }
    const mineDmg = game.mineDmg;
    trace('tileEffect', { effect: 'mine', damage: mineDmg, body, trapperId: trapper.Player_ID, tileId: endTile.Tile_ID });
    // a lethal mine kills, and credits the trapper
    const afterMine = await utils.damagePlayer(trapper, player, mineDmg, body);
    await models.Tiles.update({ trapped: false, trapper: null }, { where: { Tile_ID: endTile.Tile_ID } });
    if (afterMine.Dead) return { died: true };
  }
  return stormedBy ? { stormedBy } : undefined;
}

/** A storm picks one direction at random; the walk decides what happens. */
function rollStormDirection(deps) {
  return RANDOM_DIRECTION_DELTAS[deps.random(7)] || null;
}

/** the DIRECTION_DELTAS name of a one-tile step, for the reply */
function directionName([dx, dy]) {
  const entry = Object.entries(DIRECTION_DELTAS).find(([, d]) => d[0] === dx && d[1] === dy);
  return entry ? entry[0] : 'somewhere';
}

function findWalkTile([x, y], layerId, deps) {
  return deps.models.Tiles.findOne({ where: { Layer_ID: layerId, X_Position: x, Y_Position: y } });
}

/**
 * Why a player may not be stormed onto `tile`, or null when they may: it is
 * off the board, full, or, unless they are a Cloudborn, a wall, void or ice.
 */
function stormLandingRefusal(tile, className, deps) {
  if (!tile) return 'offBoard';
  if (!deps.utils.tileHasRoom(tile)) return 'full';
  if (className != 'Cloudborn' && STORM_FORBIDDEN_TILE_TYPES.includes(tile.Tile_Type)) return 'terrain';
  return null;
}

/**
 * What a move costs: moveCost (doubled for a Glutton) per tile stepped onto,
 * with ice free and free movement paying before AP does.
 */
function moveCost(enteredTileTypes, player, className, game) {
  const tilesEntered = enteredTileTypes.length;
  const iceTileDeduction = enteredTileTypes.filter((type) => type == 'Ice').length;
  const payableTiles = Math.max(tilesEntered - iceTileDeduction, 0);
  const freeMoveUsed = Math.min(Math.max(player.Free_Move || 0, 0), payableTiles);
  const billableTiles = payableTiles - freeMoveUsed;
  const spentAP = className == 'Glutton'
    ? (2 * game.moveCost) * billableTiles
    : game.moveCost * billableTiles;
  return { tilesEntered, iceTileDeduction, freeMoveUsed, billableTiles, spentAP };
}

// ---------------------------------------------------------------------------
// parse / run / present
// ---------------------------------------------------------------------------

function parse(raw, actor) {
  return {
    gameId: raw.game ?? null,
    direction: raw.direction,
    distance: raw.distance,
    path: raw.path ?? null,
    body: raw.body === 2 ? 2 : 1,
    discordId: actor.discordId,
  };
}

async function run(input, deps = defaultDeps) {
  const { models, utils } = deps;
  const trace = stepLogger('move', deps);

  // falsy, so game 0 falls back to the oldest game too
  const gameId = input.gameId || await utils.getOldestActiveGameId(input.discordId);
  const game = await models.Games.findByPk(gameId);
  if (!game) return { ok: false, reason: REJECTIONS.NO_SUCH_GAME, data: { gameId } };

  const player = await models.Players.findOne({ where: { Game_ID: gameId, Discord_ID: input.discordId } });
  if (!player) return { ok: false, reason: REJECTIONS.NOT_IN_GAME, data: { message: MSG_NO_PLAYER } };

  const playerClass = await models.Classes.findByPk(player.Class_ID);

  const secondBody = input.body === 2;
  const originalTile = await models.Tiles.findByPk(secondBody ? player.Tile_ID2 : player.Tile_ID);
  if (!originalTile) return { ok: false, reason: REJECTIONS.NO_SUCH_TILE, data: { message: MSG_NO_TILE } };

  trace('resolved', {
    gameId,
    playerId: player.Player_ID,
    class: playerClass && playerClass.Class_Name,
    body: secondBody ? 2 : 1,
    from: [originalTile.X_Position, originalTile.Y_Position],
    layerId: originalTile.Layer_ID,
    ap: player.Action_Points,
    freeMove: player.Free_Move,
  });

  if (input.path != null) {
    const verdict = await verifyInputPath(input.path, originalTile.Layer_ID, originalTile.X_Position, originalTile.Y_Position, deps);
    trace('pathVerified', { path: input.path, valid: verdict.valid });
    if (!verdict.valid) return { ok: false, reason: REJECTIONS.INVALID_PATH, data: { message: verdict.message } };
  }

  if (player.Dead) return { ok: false, reason: REJECTIONS.PLAYER_DEAD };

  const gameStateVerdict = utils.checkGameState(game, playerClass.Class_Name == 'Clockwatcher');
  if (gameStateVerdict.blocked) return { ok: false, reason: gameStateVerdict.reason };

  //#region Calculation of New Position
  let newX = originalTile.X_Position;
  let newY = originalTile.Y_Position;
  // iceChecklistAndTileList is every coordinate the player passes through,
  // the tile they start on included. It drives the ice check, the movement
  // cost and the tile-to-tile walk.
  let iceChecklistAndTileList;

  if (input.path != null) {
    iceChecklistAndTileList = getTileCordinatesOfPath(
      [originalTile.X_Position, originalTile.Y_Position],
      inputPathToArray(input.path),
      utils,
    );
    const destination = iceChecklistAndTileList[iceChecklistAndTileList.length - 1];
    newX = destination[0];
    newY = destination[1];
  } else {
    const delta = DIRECTION_DELTAS[input.direction];
    if (!delta) {
      // the slash command only offers the eight valid values
      throw new Error('Invalid direction, contact snage as this should not be possible.');
    }
    newX += delta[0] * input.distance;
    newY += delta[1] * input.distance;
  }

  // a walk off the edge stops at the edge: every layer runs from (1,1) to
  // (X_Bound, Y_Bound)
  const currentLayer = await models.Layers.findByPk(originalTile.Layer_ID);
  newX = Math.max(1, Math.min(currentLayer.X_Bound, newX));
  newY = Math.max(1, Math.min(currentLayer.Y_Bound, newY));

  if (input.path == null) {
    iceChecklistAndTileList = utils.getTileCordinatesOfLine(
      [originalTile.X_Position, originalTile.Y_Position],
      [newX, newY],
    );
  }
  //#endregion Calculation of New Position

  trace('destination', {
    via: input.path != null ? 'path' : 'direction',
    direction: input.path != null ? null : input.direction,
    distance: input.path != null ? null : input.distance,
    to: [newX, newY],
    // the clamp above is silent, so record what the layer allowed
    bounds: [currentLayer.X_Bound, currentLayer.Y_Bound],
    tilesWalked: iceChecklistAndTileList.length,
  });

  // a move has to go somewhere: distance 0, a path back to the start, or a
  // walk into the edge the player is already standing on
  if (newX === originalTile.X_Position && newY === originalTile.Y_Position) {
    return { ok: false, reason: REJECTIONS.NO_MOVEMENT };
  }

  // the whole walk is checked before anything happens: every tile exists,
  // none is full (the tile the player is moving from always has room for
  // them), a storm may only be where the walk ends, and nobody but a Snowman
  // may end on ice
  const walk = iceChecklistAndTileList;
  const plannedTypes = [];
  for (let cord = 0; cord < walk.length; cord++) {
    const tile = await findWalkTile(walk[cord], originalTile.Layer_ID, deps);
    if (!tile) return { ok: false, reason: REJECTIONS.NO_SUCH_TILE };
    const last = cord == walk.length - 1;
    if (cord > 0) {
      if (tile.Tile_ID !== originalTile.Tile_ID && !utils.tileHasRoom(tile)) {
        trace('refused', { reason: 'full', at: walk[cord] });
        return { ok: false, reason: REJECTIONS.TILE_FULL, data: { message: MSG_FULL_TILE } };
      }
      if (!last && tile.Tile_Type == 'Storm') {
        trace('refused', { reason: 'stormOnPath', at: walk[cord] });
        return { ok: false, reason: REJECTIONS.WRONG_TILE_TYPE, data: { message: MSG_STORM_ON_PATH } };
      }
      plannedTypes.push(tile.Tile_Type);
    }
    if (last && tile.Tile_Type == 'Ice' && playerClass.Class_Name != 'Snowman') {
      return { ok: false, reason: REJECTIONS.WRONG_TILE_TYPE, data: { message: MSG_ICE_END } };
    }
  }

  const quote = moveCost(plannedTypes, player, playerClass.Class_Name, game);

  // the numbers a player disputes most often: how many tiles they were
  // charged for, what the ice and free movement took off, and what the
  // Glutton doubling did
  trace('cost', {
    ...quote,
    moveCost: game.moveCost,
    doubled: playerClass.Class_Name == 'Glutton',
    ap: player.Action_Points,
  });

  if (player.Action_Points < quote.spentAP) {
    return { ok: false, reason: REJECTIONS.NOT_ENOUGH_AP, data: { message: MSG_NO_AP } };
  }

  // set when a fire tile or mine kills the mover mid-walk
  let died = false;

  // a run of identical steps is written once, followed by "xN" for the
  // whole run; repeatLine holds that count until the run ends
  let response = '';
  let lastStringAddedToResponse = '';
  let amountOfRepeats = 0;
  let repeatLine = '';
  const note = (line) => {
    response += repeatLine + line;
    repeatLine = '';
    lastStringAddedToResponse = '';
  };

  const enteredTileTypes = [];

  for (let cord = 0; cord < walk.length - 1; cord++) {
    const cur_Tile = await findWalkTile(walk[cord], originalTile.Layer_ID, deps);
    const nxt_Tile = await findWalkTile(walk[cord + 1], originalTile.Layer_ID, deps);
    if (!cur_Tile || !nxt_Tile) return { ok: false, reason: REJECTIONS.NO_SUCH_TILE };

    if (lastStringAddedToResponse != `You moved from a ${cur_Tile.Tile_Type} tile to a ${nxt_Tile.Tile_Type} tile! \n`) {
      response += repeatLine;
      repeatLine = '';
      if (nxt_Tile.trapped) {
        response += `You moved from a ${cur_Tile.Tile_Type} tile to a ${nxt_Tile.Tile_Type} tile IT WAS TRAPPED took ${game.mineDmg}! \n`;
      } else {
        response += `You moved from a ${cur_Tile.Tile_Type} tile to a ${nxt_Tile.Tile_Type} tile! \n`;
      }
      lastStringAddedToResponse = `You moved from a ${cur_Tile.Tile_Type} tile to a ${nxt_Tile.Tile_Type} tile! \n`;
      amountOfRepeats = 1;
    } else {
      amountOfRepeats++;
      repeatLine = `x${amountOfRepeats} \n`;
    }

    // one line per tile crossed: this is the record that says how far the
    // walk actually got, which the entry/exit pair around run() cannot
    trace('step', {
      index: cord,
      of: walk.length - 1,
      from: [cur_Tile.X_Position, cur_Tile.Y_Position],
      to: [nxt_Tile.X_Position, nxt_Tile.Y_Position],
      fromType: cur_Tile.Tile_Type,
      toType: nxt_Tile.Tile_Type,
      trapped: !!nxt_Tile.trapped,
    });

    enteredTileTypes.push(nxt_Tile.Tile_Type);

    // also holds the trapped-tile damage logic
    const blocked = await moveFromTiletoTile(cur_Tile, nxt_Tile, player, secondBody, game, deps);
    // a tile can kill the mover. playerDeathLogic has already taken them off
    // the board, so the walk stops here rather than placing a corpse.
    if (blocked && blocked.died) {
      trace('diedMidWalk', { index: cord, at: [nxt_Tile.X_Position, nxt_Tile.Y_Position], tileType: nxt_Tile.Tile_Type });
      died = true;
      walk.length = cord + 2;
      break;
    }
    if (blocked && blocked.stormedBy) {
      // a storm is only ever the last tile: the player ends wherever it
      // moves them, or on the storm if it has nowhere legal to move them
      const landingAt = [walk[cord + 1][0] + blocked.stormedBy[0], walk[cord + 1][1] + blocked.stormedBy[1]];
      const landing = await findWalkTile(landingAt, originalTile.Layer_ID, deps);
      const refusal = stormLandingRefusal(landing, playerClass.Class_Name, deps);
      const direction = directionName(blocked.stormedBy);
      if (refusal) {
        trace('stormedNowhere', { at: walk[cord + 1], refused: landingAt, refusal });
        note(`A storm tried to move you ${direction}, but that way was blocked, so you stayed on the storm! \n`);
      } else {
        trace('stormed', { from: walk[cord + 1], to: landingAt });
        walk[cord + 1] = landingAt;
        note(`You were stormed one tile ${direction}! \n`);
      }
      continue;
    }
    if (blocked) {
      trace('blocked', { index: cord, reason: blocked.reason, tileType: nxt_Tile.Tile_Type });
      return { ok: false, reason: blocked.reason, data: blocked.data };
    }
  }

  response += repeatLine;

  [newX, newY] = walk[walk.length - 1];

  // put the player on the destination tile (and take them off the old one)
  const moved = newX !== originalTile.X_Position || newY !== originalTile.Y_Position;
  if (!died && moved) {
    await utils.setPlayerToTile(player.Player_ID, originalTile.Layer_ID, newX, newY, { body: secondBody ? 2 : 1 });
    trace('placed', { at: [newX, newY], layerId: originalTile.Layer_ID });
  }

  // a player who dies partway pays only for the tiles they reached
  const charged = moveCost(enteredTileTypes, player, playerClass.Class_Name, game);
  trace('charged', { ...charged, quoted: quote.spentAP });

  // deduct action points & update free movement
  await models.Players.update(
    {
      Action_Points: player.Action_Points - charged.spentAP,
      Free_Move: Math.max(player.Free_Move || 0, 0) - charged.freeMoveUsed,
    },
    {
      where: {
        Discord_ID: input.discordId,
        Player_ID: player.Player_ID,
        Game_ID: gameId,
      },
    },
  );

  return {
    ok: true,
    kind: 'moved',
    data: {
      response,
      spentAP: charged.spentAP,
      newX,
      newY,
      layerId: originalTile.Layer_ID,
      // a Spy's movement log is deleted three seconds after it is posted
      deleteReplyAfterMs: playerClass.Class_Name == 'Spy' ? 3000 : null,
    },
  };
}

function present(result) {
  if (!result.ok) return { content: messageFor(result.reason, result.data) };
  return { content: result.data.response };
}

module.exports = {
  parse,
  run,
  present,
  // exported for direct testing
  inputPathToArray,
  addStartToPathArray,
  verifyInputPath,
  pathToTiles,
  getTileCordinatesOfPath,
  moveFromTiletoTile,
  rollStormDirection,
  DIRECTION_DELTAS,
};
