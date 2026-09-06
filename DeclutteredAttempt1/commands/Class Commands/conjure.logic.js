/**
 * /conjure - Druid class command: turn any non-gateway tile in range into
 * a Storm tile for 4 AP.
 *
 * parse/run/present per TESTING.md Part 1. run() takes plain data and a
 * deps bundle and returns a CommandResult; it never sees an interaction.
 *
 * Ported from the old execute with these fixes:
 * - a missing game now returns NO_SUCH_GAME instead of crashing on
 *   game.Game_ID (the old catch turned that into "An error occurred: ...")
 * - a missing player now returns NOT_IN_GAME instead of crashing on
 *   player.Class_ID
 *
 * Preserved as-is (see the pinning tests):
 * - the gamestate gate passes isClockwatcher=false unconditionally, exactly
 *   like the old checkGameStateAndReply(gamestate, false, interaction) call
 * - the success message names the tile's PRE-conjure type (the row was read
 *   before the update), so players see "made a Blank1 tile", never "Storm"
 * - occupied tiles, Storm tiles and every other non-gateway type still get
 *   conjured on; only Gateway_Open/Gateway_Locked are blocked
 * - rejection order: dead player, gamestate, missing tile, class, gateway,
 *   range, AP (conjure checks dead/gamestate BEFORE the missing-tile check,
 *   unlike burn)
 */
const { REJECTIONS } = require('../../enums.js');
const { messageFor } = require('../_messages.js');
const defaultDeps = require('../_deps.js');

function parse(raw, actor) {
  return {
    x: raw.x,
    y: raw.y,
    gameId: raw.game ?? null,
    discordId: actor.discordId,
    username: actor.username,
  };
}

async function run(input, deps = defaultDeps) {
  const { models, utils } = deps;

  const gameId = input.gameId ?? await utils.getOldestActiveGameId(input.discordId);
  const game = await models.Games.findByPk(gameId);
  if (!game) return { ok: false, reason: REJECTIONS.NO_SUCH_GAME, data: { gameId } };

  const player = await models.Players.findOne({ where: { Game_ID: game.Game_ID, Discord_ID: input.discordId } });
  if (!player) return { ok: false, reason: REJECTIONS.NOT_IN_GAME };

  const playerClass = await models.Classes.findByPk(player.Class_ID);
  const playerTile = await models.Tiles.findByPk(player.Tile_ID);
  const tileInRange = utils.getTileCordinatesOfLine(
    [playerTile.X_Position, playerTile.Y_Position],
    [input.x, input.y],
  ).length <= player.Range_;
  const tileToChange = await models.Tiles.findOne({
    where: { X_Position: input.x, Y_Position: input.y, Layer_ID: playerTile.Layer_ID },
  });

  if (player.Dead) return { ok: false, reason: REJECTIONS.PLAYER_DEAD };

  // the old code hard-coded isClockwatcher=false here; keep that
  const verdict = utils.checkGameState(game.GAME_STATE, false);
  if (verdict.blocked) return { ok: false, reason: verdict.reason };

  if (!tileToChange) {
    return { ok: false, reason: REJECTIONS.NO_SUCH_TILE, data: { action: 'conjure a storm on' } };
  }

  if (playerClass.Class_Name !== 'Druid') {
    return { ok: false, reason: REJECTIONS.WRONG_CLASS, data: { className: 'Druid' } };
  }

  if (tileToChange.Tile_Type === 'Gateway_Open' || tileToChange.Tile_Type === 'Gateway_Locked') {
    return { ok: false, reason: REJECTIONS.WRONG_TILE_TYPE, data: { message: 'You cannot conjure a storm on a gateway tile!' } };
  }

  if (!tileInRange) {
    return { ok: false, reason: REJECTIONS.OUT_OF_RANGE, data: { message: 'You are not in range of the tile you want to conjure a storm on!' } };
  }

  if (player.Action_Points < 4) {
    return { ok: false, reason: REJECTIONS.NOT_ENOUGH_AP, data: { action: 'conjure a storm on a tile' } };
  }

  await models.Players.update(
    { Action_Points: player.Action_Points - 4 },
    { where: { Player_ID: player.Player_ID } },
  );
  await models.Tiles.update(
    { Tile_Type: 'Storm' },
    { where: { Tile_ID: tileToChange.Tile_ID } },
  );

  return {
    ok: true,
    kind: 'conjured',
    data: {
      x: input.x,
      y: input.y,
      // the pre-conjure type, as the old message showed (the row was read
      // before the update)
      previousTileType: tileToChange.Tile_Type,
      layerId: tileToChange.Layer_ID,
      username: input.username,
    },
  };
}

function present(result) {
  if (!result.ok) return { content: messageFor(result.reason, result.data) };
  const d = result.data;
  return { content: `${d.username} made a ${d.previousTileType} tile on coordinates (${d.x}, ${d.y}) on layer ${d.layerId}!` };
}

module.exports = { parse, run, present };
