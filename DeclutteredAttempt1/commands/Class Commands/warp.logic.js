/**
 * /warp - teleport to a random tile on the layer above or below.
 *
 * Gateway_Open tiles warp you to a random open gateway on the neighbouring
 * layer; a Dimensional Hopper warps to any random usable tile.
 *
 * parse/run/present per TESTING.md Part 1. run() takes plain data and a deps
 * bundle and returns a CommandResult; it never sees an interaction.
 *
 * Ported from the old execute() with these fixes, each of which was a crash,
 * a dead write or a comparison that could never be true:
 * - `if (!newLayer)` read a variable declared in a later, narrower block, so
 *   EVERY invocation died with `ReferenceError: newLayer is not defined`
 *   before touching the database. The lookup it obviously refers to is
 *   hoisted to that point; the check itself stays exactly where it was
 *   written (so it still runs before the gamestate gate).
 * - `utils.getOldestGameId()` was called with no argument, which throws
 *   "missing playerDiscordID"; it now gets the actor's discord id, like
 *   every other converted command.
 * - the boolean option was read as `getBoolean('up?')` but registered as
 *   `up-or-down`, so it was always null and warp always went DOWN, silently
 *   ignoring the player's required input. The option is now read by its real
 *   name (see warp.js), so `up` reaches the logic.
 * - a stray brace put the teleport write and both success replies INSIDE the
 *   non-gateway branch, so (a) warping from a Gateway_Open tile picked a
 *   destination and then did nothing at all - no write, no reply, the
 *   interaction hung deferred - and (b) the `currentTile.Tile_Type ==
 *   "Gateway_Open"` test that chooses the success wording sat in the branch
 *   where that can never be true, making the gateway message unreachable.
 *   The write and the wording choice now apply to both branches.
 * - the destination was indexed with `getRandomInt(possibleTiles.length)`,
 *   and getRandomInt is INCLUSIVE of max (utils.js:40), so it could return
 *   `length` and crash on `undefined.Tile_ID`. It now indexes with
 *   `length - 1`, the pattern utils itself documents.
 * - the non-gateway branch checked "no tiles left" only from inside its
 *   loop, so an empty tile list fell through to `newTile.Tile_ID` and
 *   crashed; an empty list now returns the same NO_AVAILABLE_TILE rejection
 *   the loop would have.
 * - missing game / player / current tile / current layer rows dereferenced
 *   null; they are now rejections.
 *
 * Preserved quirks (each pinned by a test in warp.test.js):
 * - the filter loops splice while iterating with for-in, so the element that
 *   shifts into a removed index is never examined: full gateways and walls
 *   survive the filter and can be warped onto.
 * - the non-gateway branch runs that filter pass repeatedly (the outer of
 *   two nested loops over the same array, whose variable the inner one
 *   shadows), so it removes more than one pass would, and re-rolls the
 *   destination once per pass.
 * - checkGameState is called with isClockwatcher hard-coded false, so a
 *   Clockwatcher cannot warp during a timestop.
 * - the class comparison is loose (`==`) against `hopperClass?.Class_ID`, so
 *   a player with a null Class_ID counts as a Dimensional Hopper when the
 *   class row is missing.
 * - only Players.Tile_ID is written; the destination tile's PlayerN slot is
 *   not claimed and the old tile is not vacated.
 * - the "could not find a layer" wording is missing a space, as it always
 *   was.
 */
const { REJECTIONS } = require('../../enums.js');
const { messageFor } = require('../_messages.js');
const defaultDeps = require('../_deps.js');

function parse(raw, actor) {
  return {
    up: raw['up-or-down'] === true,
    gameId: raw.game ?? null,
    discordId: actor.discordId,
  };
}

/** true when all four player slots on a tile are taken */
function isFull(tile) {
  return tile.Player1 != null && tile.Player2 != null
    && tile.Player3 != null && tile.Player4 != null;
}

/** the tile types the non-gateway branch refuses to land on */
function isUnusable(tile) {
  return isFull(tile)
    || tile.Tile_Type == 'Void'
    || tile.Tile_Type == 'Wall'
    || tile.Tile_Type == 'Wall_Damaged'
    || tile.Tile_Type == 'Gateway_Locked';
}

async function run(input, deps = defaultDeps) {
  const { models, utils } = deps;
  const direction = input.up ? 'layer above' : 'layer below';

  const gameId = input.gameId ?? await utils.getOldestGameId(input.discordId);
  const game = await models.Games.findByPk(gameId);
  if (!game) return { ok: false, reason: REJECTIONS.NO_SUCH_GAME, data: { gameId } };

  const player = await models.Players.findOne({ where: { Game_ID: gameId, Discord_ID: input.discordId } });
  if (!player) return { ok: false, reason: REJECTIONS.NOT_IN_GAME };

  const currentTile = await models.Tiles.findOne({ where: { Tile_ID: player.Tile_ID } });
  if (!currentTile) return { ok: false, reason: REJECTIONS.NO_SUCH_TILE };

  const currentLayer = await models.Layers.findOne({ where: { Layer_ID: currentTile.Layer_ID } });
  if (!currentLayer) return { ok: false, reason: REJECTIONS.NO_SUCH_LAYER };

  const newLayer = input.up
    ? await models.Layers.findOne({ where: { Layer_ID: currentLayer.Layer_Above } })
    : await models.Layers.findOne({ where: { Layer_ID: currentLayer.Layer_Below } });
  if (!newLayer) {
    return {
      ok: false,
      reason: REJECTIONS.NO_SUCH_LAYER,
      data: { message: 'Could not find a' + direction + ' layer: ' + currentLayer.Layer_ID },
    };
  }

  // a Clockwatcher acts through a timestop. Every call site used to
  // hard-code false here, so the class's whole ability did nothing.
  const verdict = utils.checkGameState(
    game.GAME_STATE, await utils.isClockwatcher(models, player),
  );
  if (verdict.blocked) return { ok: false, reason: verdict.reason };

  const hopperClass = await models.Classes.findOne({ where: { Class_Name: 'Dimensional Hopper' } });
  const viaGateway = currentTile.Tile_Type == 'Gateway_Open';
  const isHopper = player.Class_ID == hopperClass?.Class_ID;
  if (!isHopper && !viaGateway) {
    return { ok: false, reason: REJECTIONS.NOT_ON_GATEWAY };
  }

  let newTile;
  if (viaGateway) {
    const possibleTiles = await models.Tiles.findAll({ where: { Layer_ID: newLayer.Layer_ID, Tile_Type: 'Gateway_Open' } });
    // quirk: splicing while iterating with for-in skips whichever tile shifts
    // into the removed index, so some full gateways survive
    for (const tile in possibleTiles) {
      if (isFull(possibleTiles[tile])) possibleTiles.splice(tile, 1);
    }
    if (possibleTiles.length == 0) {
      return {
        ok: false,
        reason: REJECTIONS.NO_AVAILABLE_TILE,
        data: { message: 'There are no available(not full or locked) gateways on the ' + direction + ' you!' },
      };
    }
    newTile = possibleTiles[deps.random(possibleTiles.length - 1)];
  } else {
    const possibleTiles = await models.Tiles.findAll({ where: { Layer_ID: newLayer.Layer_ID } });
    const noneLeft = {
      ok: false,
      reason: REJECTIONS.NO_AVAILABLE_TILE,
      data: { message: 'There are no available(not full, wall, damaged wall, void, ice, or locked gateway) tiles on the ' + direction + ' you!' },
    };
    // quirk: the legacy code nested two for-in loops over the same array and
    // the inner one shadowed the outer's variable, so the filter pass below
    // runs once per surviving index of the ORIGINAL array (and the
    // destination is re-rolled each time). `pass < possibleTiles.length` is
    // what for-in did: an index that no longer exists is never visited.
    const initialLength = possibleTiles.length;
    for (let pass = 0; pass < initialLength && pass < possibleTiles.length; pass++) {
      for (const tile in possibleTiles) {
        if (isUnusable(possibleTiles[tile])) possibleTiles.splice(tile, 1);
      }
      if (possibleTiles.length == 0) return noneLeft;
      newTile = possibleTiles[deps.random(possibleTiles.length - 1)];
    }
    // the loop never ran (no tiles on the layer at all); the legacy code
    // crashed here instead of rejecting
    if (!newTile) return noneLeft;
  }

  // both sides of the position invariant: this used to write
  // Players.Tile_ID only, leaving the destination tile's PlayerN slots
  // unclaimed and the old tile still naming the hopper (#78)
  await deps.utils.setPlayerToTile(
    player.Player_ID, newTile.Layer_ID, newTile.X_Position, newTile.Y_Position,
  );

  return {
    ok: true,
    kind: 'warped',
    data: { up: input.up, viaGateway, tileId: newTile.Tile_ID, layerId: newLayer.Layer_ID },
  };
}

function present(result) {
  if (!result.ok) return { content: messageFor(result.reason, result.data) };
  const direction = result.data.up ? 'layer above' : 'layer below';
  if (result.data.viaGateway) {
    return { content: 'Teleported to a random gateway tile on the ' + direction + ' you!\n Check out where you are with the board command!' };
  }
  return { content: 'Teleported to a random tile on the ' + direction + ' you!\n Check out where you are with the stats or board command!' };
}

module.exports = { parse, run, present };
