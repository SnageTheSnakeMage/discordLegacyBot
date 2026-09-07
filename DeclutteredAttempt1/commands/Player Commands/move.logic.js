/**
 * /move - walk a player <distance> tiles in <direction>, or along a custom
 * path, paying AP per tile and resolving whatever the tiles do to them.
 *
 * parse/run/present per TESTING.md Part 1. run() takes plain data and a deps
 * bundle and returns a CommandResult; it never sees an interaction.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE IS LONGER THAN THE OTHER CONVERSIONS
 *
 * move.js was mid-rewrite when it was converted. Large parts of it could not
 * run at all: `execute` assigned to a `const` (`originalTile`) on its second
 * statement, so EVERY invocation threw "Assignment to constant variable"
 * before any movement happened. Everything downstream of that line was
 * therefore dead code, and "port what it does" has no answer for dead code -
 * so what is ported here is what each block plainly *intends*, with every
 * crash fixed and every fix listed below. Behaviour decisions live in this
 * file (not in the adapter and not in utils) so that a revert is one file.
 *
 * CRASHES / DEAD CODE FIXED (each one made the command unusable):
 *  - `originalTile` was declared `const` then reassigned for the body-2 case:
 *    a guaranteed TypeError on every /move. Body selection now happens once,
 *    before the path is verified (the order the newer
 *    validateAndParseMoveCommandInput helper used).
 *  - the new position was computed by `calculateMovement`, an async method
 *    called without await that mutated its own locals (so the caller's
 *    newX/newY never changed) and read an out-of-scope `bodyToMove`. The
 *    direction -> delta table is now applied inline.
 *  - the path branch called `this.verifyInputPath(direction, distance,
 *    inputPathToArray(path))` - the argument list of `addStartToPathArray`,
 *    against the signature of `verifyInputPath` - and then iterated the
 *    returned Promise with for..in (zero iterations). Path handling is now
 *    explicit: verify the path, expand it to coordinates, walk it.
 *  - `pathToTiles` read `.X_Position` off its `startingTile` argument, which
 *    both call sites pass as an `[x, y]` array, so every destination was
 *    [NaN, NaN]. It now reads the array.
 *  - `getTileCordinatesOfPath` indexed `tiles[tile + 1]` with a for..in
 *    string key ("0" + 1 === "01"), so it always dereferenced undefined; it
 *    also nested each segment instead of producing a flat coordinate list.
 *  - the movement loop had the same `[cord + 1]` string-concat bug.
 *  - `if(cord == iceChecklistAndTileList.length)` could never be true (for..in
 *    keys stop one below length), so the "cannot end on ice" rule never fired.
 *    It now tests the last tile of the walk.
 *  - `if(!player.Class_ID == 6)` is `(!Class_ID) == 6` - always false - so the
 *    wall/void/damaged-wall guard never fired. It is now `Class_ID != 6`
 *    (6 = Cloudborn, per the comment beside it) and returns a rejection.
 *  - `this.setPlayerToTile(...)` does not exist on the command module; the
 *    real one lives in utils. It is called through deps.utils now.
 *  - the twin (body 2) half of moveFromTiletoTile read bare `fireDmg` and
 *    `mineDmg` (never declared - ReferenceError) and `this.getRandomInt`
 *    (not a method of the command module). They are game.fireDmg,
 *    game.mineDmg and deps.random.
 *  - a missing game row crashed on game.GAME_STATE; a coordinate with no tile
 *    row crashed on tile.Tile_Type. Both are rejections now.
 *  - a valid path ends in ';', so inputPathToArray always produced a trailing
 *    [""] segment, which fell into verifyInputPath's `default:` and threw -
 *    i.e. no path input could ever be accepted. inputPathToArray still
 *    returns that segment (its contract is pinned by a test); the two
 *    consumers skip it.
 *  - movePlayerToRandomSurroundingTile passed a findAll array as a tile and
 *    called moveFromTiletoTile with four wrong arguments, then re-rolled by
 *    reading .Tile_Type off that array (always undefined, so the re-roll
 *    never happened) with no recursion bound. It now resolves the target
 *    tile, re-rolls a bounded number of times when the terrain is forbidden,
 *    and moves the player with utils.setPlayerToTile.
 *
 * ODD-BUT-WORKING BEHAVIOUR DELIBERATELY KEPT (pinned by tests):
 *  - the tile list includes the tile the player starts on, so a one-tile move
 *    is billed as two tiles of movement.
 *  - "north" is +Y for the direction option but -Y for path segments ("up").
 *    The two halves of the command have always disagreed; both are preserved.
 *  - the /move choice labels are inverted (label "left" -> value "east").
 *  - the ice-check query has no Layer_ID in its where clause; the movement
 *    loop's query does.
 *  - coordinates are clamped to the layer's upper bound only (Math.min), with
 *    no floor at 1.
 *  - repeated identical steps collapse to "x2" forever: amountOfRepeats is
 *    assigned 1 and never incremented.
 *  - Free_Move is written through Math.min(..., 0), so it can only ever be
 *    set to zero or a negative number.
 *  - a path segment's destination is measured from the STARTING tile rather
 *    than from the end of the previous segment (both in verifyInputPath and
 *    in pathToTiles).
 *  - the storm displacement happens mid-walk, and the final setPlayerToTile
 *    then puts the player on the requested destination anyway.
 *
 * This file must never import discord.js or the adapter.
 */
const { REJECTIONS } = require('../../enums.js');
const { messageFor } = require('../_messages.js');
const defaultDeps = require('../_deps.js');

/** Class_ID 6 is Cloudborn - the only class allowed on wall/void terrain. */
const CLOUDBORN_CLASS_ID = 6;
/** Class_ID 19 is Robot, 15 is Stormchaser - both get a bonus on storm tiles. */
const ROBOT_CLASS_ID = 19;
const STORMCHASER_CLASS_ID = 15;

/** terrain a storm may not dump a non-Cloudborn onto */
const STORM_FORBIDDEN_TILE_TYPES = ['Wall', 'Wall_Damaged', 'Void', 'Ice'];

/**
 * direction option value -> [dx, dy] per unit of distance.
 * NOTE north is +Y here. Path segments below use the opposite convention;
 * that disagreement is legacy behaviour, not a typo in the port.
 */
const DIRECTION_DELTAS = {
  west: [-1, 0],
  east: [1, 0],
  north: [0, 1],
  south: [0, -1],
  northeast: [1, 1],
  northwest: [-1, 1],
  southeast: [1, -1],
  southwest: [-1, -1],
};

/** path segment direction -> [dx, dy] per unit of distance (up is -Y here). */
const PATH_DELTAS = {
  left: [-1, 0], w: [-1, 0],
  right: [1, 0], e: [1, 0],
  up: [0, -1], n: [0, -1],
  down: [0, 1], s: [0, 1],
  nw: [-1, -1],
  ne: [1, -1],
  sw: [-1, 1],
  se: [1, 1],
};

/** random 0-7 -> [dx, dy], exactly the switch in movePlayerToRandomSurroundingTile */
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

const PATH_REGEX = /^((?:left|right|up|down|ne|nw|se|sw),\d+;)+$/;

// player-facing wording that predates REJECTIONS; carried verbatim so the
// text a player sees is byte-identical to the legacy command's.
const MSG_NO_PLAYER = 'Player not found in game!, please register for the game you wish to move in.';
const MSG_NO_TILE = "Current tile not found! please register, or ask a Dev about why your not on the board";
const MSG_ICE_END = 'Cannot end a movement on an ice tile, please either provide a path that moves off the ice, or move onto a non-ice tile.';
const MSG_NO_AP = 'Player does not enough action points for movement requested.';
const MSG_BAD_PATH_TILE = 'Invalid input path, your path goes to a nonexistent tile or a tile your path goes on could not be found. If you think this is a mistake contact snage.';
const MSG_BAD_PATH_DIRECTION = 'Invalid input path, your are using a direction that isnt: left,right,up,down,nw,ne,sw, or se';
const MSG_BAD_PATH_FORMAT = "Invalid input path, make sure your path uses a direction(left,right,up,down,nw,ne,sw,se) then a comma(,) and a number separated & ended by a semicolon(;). Also make sure it doesnt take you off the layer you are currently on. For example: 'sw,2;n,1;' and 'up,2;e,1;' are valid as long as they do not move to a tile that doesn't exist";

// ---------------------------------------------------------------------------
// pure path helpers (issue #88 - moved out of move.js so they can be tested)
// ---------------------------------------------------------------------------

/**
 * "right,2;down,1;" -> [["right","2"],["down","1"]]
 * Distances stay strings, exactly as the legacy split produced them; every
 * consumer parseInt()s them.
 */
function inputPathToArray(inputPath) {
  return inputPath.split(';').map((row) => row.split(','));
}

/**
 * Prepends the command's own direction/distance to a path array, translating
 * the short direction name into the long one the direction option uses.
 * Throws on an unknown direction, as before.
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
 * startingTile is an [x, y] array.
 *
 * QUIRK PRESERVED: every segment is measured from the STARTING tile, not from
 * the end of the previous segment.
 */
function pathToTiles(startingTile, path) {
  const tiles = [[startingTile[0], startingTile[1]]];
  for (const segment of path) {
    // a well-formed path ends in ';', so split() leaves a trailing [""]
    // segment; skipping it is what makes any path usable at all (legacy
    // threw on it every time)
    if (!segment[0]) continue;
    const delta = PATH_DELTAS[segment[0]];
    if (!delta) {
      throw new Error('Invalid input path, your are using a direction that isnt: left,w,right,e,up,n,down,s,nw,ne,sw, or se contact snage as this should not be possible.');
    }
    const distance = parseInt(segment[1], 10);
    tiles.push([startingTile[0] + delta[0] * distance, startingTile[1] + delta[1] * distance]);
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
 * Checks a raw path string: right shape, every segment lands on a tile that
 * exists, and the destination is inside the layer's bounds.
 *
 * Legacy threw strings from here; it returns a verdict now so run() can turn
 * it into a rejection code. The wording is unchanged.
 *
 * QUIRK PRESERVED: each segment is checked from the STARTING tile, so only
 * the corner tiles are checked and only relative to where the walk began.
 */
async function verifyInputPath(inputPath, layerId, startingTileXPosition, startingTileYPosition, deps = defaultDeps) {
  const { models } = deps;
  if (!PATH_REGEX.test(inputPath)) {
    return { valid: false, message: MSG_BAD_PATH_FORMAT };
  }
  const path = inputPathToArray(inputPath);
  let destination = [startingTileXPosition, startingTileYPosition];
  for (const segment of path) {
    // trailing [""] from the mandatory final ';' - see pathToTiles
    if (!segment[0]) continue;
    const delta = PATH_DELTAS[segment[0]];
    if (!delta) {
      return { valid: false, message: MSG_BAD_PATH_DIRECTION };
    }
    const distance = parseInt(segment[1], 10);
    const x = startingTileXPosition + delta[0] * distance;
    const y = startingTileYPosition + delta[1] * distance;
    const tile = await models.Tiles.findOne({ where: { Layer_ID: layerId, X_Position: x, Y_Position: y } });
    if (tile == null) {
      return { valid: false, message: MSG_BAD_PATH_TILE };
    }
    destination = [x, y];
  }
  const curLayer = await models.Layers.findByPk(layerId);
  if (curLayer && (curLayer.X_Bound < destination[0] || curLayer.Y_Bound < destination[1])) {
    return { valid: false, message: MSG_BAD_PATH_FORMAT };
  }
  return { valid: true, destination };
}

// ---------------------------------------------------------------------------
// tile-to-tile effects
// ---------------------------------------------------------------------------

/**
 * One tile of movement: what the tile being left does, what the tile being
 * entered does, and whether it was mined. Returns undefined normally, or
 * { blocked: true, ... } when the player may not enter the tile at all.
 *
 * secondBody selects the twin's second body's columns.
 */
async function moveFromTiletoTile(startTile, endTile, player, secondBody, game, deps) {
  const { models, utils, random } = deps;
  const body = secondBody ? 2 : 1;
  const hpColumn = secondBody ? 'Health_Points2' : 'Health_Points';
  const currentHp = secondBody ? player.Health_Points2 : player.Health_Points;

  switch (startTile.Tile_Type) {
    // leaving a fire tile burns the player
    case 'Fire':
      // damagePlayer re-reads the row before the death check; this used to
      // hand playerDeathLogic the pre-damage row, so fire never killed
      if ((await utils.damagePlayer(null, player, game.fireDmg, body)).Dead) return { died: true };
      break;
    // leaving a smoke tile disperses it
    case 'Smoke':
      await utils.revertTileToBlank(startTile);
      break;
    default:
      break;
  }

  switch (endTile.Tile_Type) {
    // entering a fire tile burns the player
    case 'Fire':
      // damagePlayer re-reads the row before the death check; this used to
      // hand playerDeathLogic the pre-damage row, so fire never killed
      if ((await utils.damagePlayer(null, player, game.fireDmg, body)).Dead) return { died: true };
      break;
    case 'Storm':
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
      // and everyone is thrown one tile in a random direction
      await movePlayerToRandomSurroundingTile(player.Player_ID, startTile.Layer_ID, startTile.X_Position, startTile.Y_Position, deps);
      break;
    case 'Void':
    case 'Wall':
    case 'Wall_Damaged':
      // only a Cloudborn may stand on these
      if (player.Class_ID != CLOUDBORN_CLASS_ID) {
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
    // same here: a lethal mine now actually kills, and credits the trapper
    const afterMine = await utils.damagePlayer(trapper, player, mineDmg, body);
    await models.Tiles.update({ trapped: false, trapper: null }, { where: { Tile_ID: endTile.Tile_ID } });
    if (afterMine.Dead) return { died: true };
  }
  return undefined;
}

/**
 * Throws a player one tile in a random direction (storm tiles). Re-rolls when
 * the terrain would be illegal for their class, up to a bounded number of
 * attempts - the legacy version recursed with no bound.
 */
async function movePlayerToRandomSurroundingTile(playerId, layer, x, y, deps, attempt = 0) {
  const { models, utils, random } = deps;
  const player = await models.Players.findByPk(playerId);
  const playerClass = player ? await models.Classes.findByPk(player.Class_ID) : null;

  const delta = RANDOM_DIRECTION_DELTAS[random(7)];
  if (!delta) return;
  const newX = x + delta[0];
  const newY = y + delta[1];
  const newTile = await models.Tiles.findOne({ where: { Layer_ID: layer, X_Position: newX, Y_Position: newY } });

  // a storm may not put a player somewhere they could not normally walk,
  // unless they are a Cloudborn
  const forbidden = !newTile
    || (playerClass && playerClass.Class_Name != 'Cloudborn' && STORM_FORBIDDEN_TILE_TYPES.includes(newTile.Tile_Type));
  if (forbidden) {
    if (attempt >= RANDOM_DIRECTION_DELTAS.length) return;
    return movePlayerToRandomSurroundingTile(playerId, layer, x, y, deps, attempt + 1);
  }
  await utils.setPlayerToTile(playerId, layer, newX, newY);
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

  // legacy used a falsy check here, so game 0 falls back to the oldest game
  const gameId = input.gameId || await utils.getOldestActiveGameId(input.discordId);
  const game = await models.Games.findByPk(gameId);
  if (!game) return { ok: false, reason: REJECTIONS.NO_SUCH_GAME, data: { gameId } };

  const player = await models.Players.findOne({ where: { Game_ID: gameId, Discord_ID: input.discordId } });
  if (!player) return { ok: false, reason: REJECTIONS.NOT_IN_GAME, data: { message: MSG_NO_PLAYER } };

  const playerClass = await models.Classes.findByPk(player.Class_ID);

  const secondBody = input.body === 2;
  const originalTile = await models.Tiles.findByPk(secondBody ? player.Tile_ID2 : player.Tile_ID);
  if (!originalTile) return { ok: false, reason: REJECTIONS.NO_SUCH_TILE, data: { message: MSG_NO_TILE } };

  if (input.path != null) {
    const verdict = await verifyInputPath(input.path, originalTile.Layer_ID, originalTile.X_Position, originalTile.Y_Position, deps);
    if (!verdict.valid) return { ok: false, reason: REJECTIONS.INVALID_PATH, data: { message: verdict.message } };
  }

  if (player.Dead) return { ok: false, reason: REJECTIONS.PLAYER_DEAD };

  const gameStateVerdict = utils.checkGameState(game.GAME_STATE, playerClass.Class_Name == 'Clockwatcher');
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

  // clamp to the layer's far edge (upper bound only, as before)
  const currentLayer = await models.Layers.findByPk(originalTile.Layer_ID);
  newX = Math.min(currentLayer.X_Bound, newX);
  newY = Math.min(currentLayer.Y_Bound, newY);

  if (input.path == null) {
    iceChecklistAndTileList = utils.getTileCordinatesOfLine(
      [originalTile.X_Position, originalTile.Y_Position],
      [newX, newY],
    );
  }
  //#endregion Calculation of New Position

  // ice: every ice tile crossed is a tile the player does not pay for, and
  // nobody but a Snowman may stop on one
  let iceTileDeduction = 0;
  for (let cord = 0; cord < iceChecklistAndTileList.length; cord++) {
    // NOTE: no Layer_ID in this where clause - legacy behaviour, kept
    const tile = await models.Tiles.findOne({
      where: {
        X_Position: iceChecklistAndTileList[cord][0],
        Y_Position: iceChecklistAndTileList[cord][1],
      },
    });
    if (!tile) return { ok: false, reason: REJECTIONS.NO_SUCH_TILE };
    if (tile.Tile_Type == 'Ice') {
      iceTileDeduction++;
    }
    if (cord == iceChecklistAndTileList.length - 1 && tile.Tile_Type == 'Ice' && playerClass.Class_Name != 'Snowman') {
      return { ok: false, reason: REJECTIONS.WRONG_TILE_TYPE, data: { message: MSG_ICE_END } };
    }
  }

  const billableTiles = iceChecklistAndTileList.length - (iceTileDeduction + player.Free_Move);
  const spentAP = playerClass.Class_Name == 'Glutton'
    ? (2 * game.moveCost) * billableTiles
    : game.moveCost * billableTiles;

  if (player.Action_Points < spentAP) {
    return { ok: false, reason: REJECTIONS.NOT_ENOUGH_AP, data: { message: MSG_NO_AP } };
  }

  // set when a fire tile or mine kills the mover mid-walk

  let died = false;

  let response = '';
  let lastStringAddedToResponse = '';
  let amountOfRepeats = 0;

  for (let cord = 0; cord < iceChecklistAndTileList.length - 1; cord++) {
    const cur_Tile = await models.Tiles.findOne({ where: { X_Position: iceChecklistAndTileList[cord][0], Y_Position: iceChecklistAndTileList[cord][1], Layer_ID: originalTile.Layer_ID } });
    const nxt_Tile = await models.Tiles.findOne({ where: { X_Position: iceChecklistAndTileList[cord + 1][0], Y_Position: iceChecklistAndTileList[cord + 1][1], Layer_ID: originalTile.Layer_ID } });
    if (!cur_Tile || !nxt_Tile) return { ok: false, reason: REJECTIONS.NO_SUCH_TILE };

    if (lastStringAddedToResponse != `You moved from a ${cur_Tile.Tile_Type} tile to a ${nxt_Tile.Tile_Type} tile! \n`) {
      if (nxt_Tile.trapped) {
        response += `You moved from a ${cur_Tile.Tile_Type} tile to a ${nxt_Tile.Tile_Type} tile IT WAS TRAPPED took ${game.mineDmg}! \n`;
      } else {
        response += `You moved from a ${cur_Tile.Tile_Type} tile to a ${nxt_Tile.Tile_Type} tile! \n`;
      }
      lastStringAddedToResponse = `You moved from a ${cur_Tile.Tile_Type} tile to a ${nxt_Tile.Tile_Type} tile! \n`;
      // assigned, never incremented (legacy), so a run of identical steps
      // always renders as "x2"
      amountOfRepeats = 1;
    } else {
      response += `x${amountOfRepeats + 1} \n`;
    }

    // also holds the trapped-tile damage logic
    const blocked = await moveFromTiletoTile(cur_Tile, nxt_Tile, player, secondBody, game, deps);
    // a tile can now kill the mover. playerDeathLogic has already taken them
    // off the board, so the walk stops here rather than placing a corpse.
    if (blocked && blocked.died) { died = true; break; }
    if (blocked) return { ok: false, reason: blocked.reason, data: blocked.data };
  }

  // put the player on the destination tile (and take them off the old one)
  if (!died) {
    await utils.setPlayerToTile(player.Player_ID, originalTile.Layer_ID, newX, newY);
  }

  // deduct action points & update free movement
  await models.Players.update(
    {
      Action_Points: player.Action_Points - spentAP,
      Free_Move: Math.min(player.Free_Move - billableTiles, 0),
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
      spentAP,
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
  // exported for direct testing (issue #88) and reuse
  inputPathToArray,
  addStartToPathArray,
  verifyInputPath,
  pathToTiles,
  getTileCordinatesOfPath,
  moveFromTiletoTile,
  movePlayerToRandomSurroundingTile,
  DIRECTION_DELTAS,
};
