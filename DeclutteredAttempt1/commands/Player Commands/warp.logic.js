/**
 * /warp - teleport to a random tile on the layer above or below, for 2AP.
 *
 * Anyone standing on a Gateway_Open tile warps to a random open gateway on the
 * neighbouring layer; a Dimensional Hopper may warp from any tile, and lands
 * on any usable one.
 *
 * The cost is charged only once the player has actually moved, so a warp that
 * finds nowhere to land costs nothing.
 *
 * parse/run/present per TESTING.md Part 1. run() takes plain data and a deps
 * bundle and returns a CommandResult; it never sees an interaction.
 *
 * Quirks kept on purpose (each pinned by a test in warp.test.js):
 * - the filter loops splice while iterating with for-in, so the element that
 *   shifts into a removed index is never examined: full gateways and walls
 *   survive the filter and can be picked.
 * - the non-gateway branch runs that filter pass repeatedly (the outer of
 *   two nested loops over the same array, whose variable the inner one
 *   shadows), so it removes more than one pass would, and re-rolls the
 *   destination once per pass.
 * - the class comparison is loose (`==`) against `hopperClass?.Class_ID`, so
 *   a player with a null Class_ID counts as a Dimensional Hopper when the
 *   class row is missing.
 * - the "could not find a layer" wording is missing a space.
 */
const { REJECTIONS } = require('../../enums.js');
const { messageFor } = require('../_messages.js');
const defaultDeps = require('../_deps.js');

const AP_COST = 2;

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
    || tile.Tile_Type == 'Ice'
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

  // a Clockwatcher acts through a timestop
  const verdict = utils.checkGameState(
    game, await utils.isClockwatcher(models, player),
  );
  if (verdict.blocked) return { ok: false, reason: verdict.reason };

  const hopperClass = await models.Classes.findOne({ where: { Class_Name: 'Dimensional Hopper' } });
  const viaGateway = currentTile.Tile_Type == 'Gateway_Open';
  const isHopper = player.Class_ID == hopperClass?.Class_ID;
  if (!isHopper && !viaGateway) {
    return { ok: false, reason: REJECTIONS.NOT_ON_GATEWAY };
  }

  if (player.Action_Points < AP_COST) {
    return { ok: false, reason: REJECTIONS.NOT_ENOUGH_AP, data: { action: 'warp' } };
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
    // quirk: two nested for-in loops over the same array and
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
    // the loop never ran: the layer has no tiles at all
    if (!newTile) return noneLeft;
  }

  // setPlayerToTile moves both sides of the position invariant: the player's
  // Tile_ID and the PlayerN slots of the old and new tiles
  await deps.utils.setPlayerToTile(
    player.Player_ID, newTile.Layer_ID, newTile.X_Position, newTile.Y_Position,
  );
  await models.Players.update(
    { Action_Points: player.Action_Points - AP_COST },
    { where: { Player_ID: player.Player_ID } },
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
