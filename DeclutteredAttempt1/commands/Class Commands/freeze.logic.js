/**
 * /freeze - Snowman class command: turn any non-gateway tile in range into
 * an Ice tile for 3 AP.
 *
 * parse/run/present per TESTING.md Part 1. run() takes plain data and a
 * deps bundle and returns a CommandResult; it never sees an interaction.
 *
 * Ported from the old execute with these fixes, each of which was a crash
 * before (see the conversion commit):
 * - the old file never defined playerClass, playerTile, tileInRange or
 *   tileToChange (they exist in the sibling /burn but were dropped from
 *   this copy), so every invocation that passed the gamestate gate threw a
 *   ReferenceError; the lookups are reconstructed to match /burn's
 * - getOldestGameId was called with no argument, so the default-game path
 *   always resolved undefined and crashed on game.Game_ID; it now receives
 *   the player's discord id like every other command
 * - a missing game now returns NO_SUCH_GAME instead of crashing on
 *   game.Game_ID
 * - a missing player now returns NOT_IN_GAME instead of crashing
 *
 * Preserved as-is (see the pinning tests):
 * - there is NO dead check: a dead Snowman can still freeze (unlike /burn)
 * - the gamestate gate runs BEFORE every tile/class check, with
 *   isClockwatcher=false hard-coded, exactly like the old
 *   checkGameStateAndReply(gamestate, false, interaction) call
 * - the success message names the tile's PRE-freeze type (the row was read
 *   before the update) and carries no username prefix ("You have made a...")
 * - occupied tiles, Ice tiles and every other non-gateway type still
 *   freeze; only Gateway_Open/Gateway_Locked are blocked
 * - rejection order: gamestate, missing tile, class, gateway, range, AP
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

  const gameId = input.gameId ?? await utils.getOldestGameId(input.discordId);
  const game = await models.Games.findByPk(gameId);
  if (!game) return { ok: false, reason: REJECTIONS.NO_SUCH_GAME, data: { gameId } };

  const player = await models.Players.findOne({ where: { Game_ID: game.Game_ID, Discord_ID: input.discordId } });
  if (!player) return { ok: false, reason: REJECTIONS.NOT_IN_GAME };

  // the old code gated on gamestate before any other check, with
  // isClockwatcher hard-coded false; keep both
  const verdict = utils.checkGameState(game.GAME_STATE, false);
  if (verdict.blocked) return { ok: false, reason: verdict.reason };

  const playerClass = await models.Classes.findByPk(player.Class_ID);
  const playerTile = await models.Tiles.findByPk(player.Tile_ID);
  const tileInRange = utils.getTileCordinatesOfLine(
    [playerTile.X_Position, playerTile.Y_Position],
    [input.x, input.y],
  ).length <= player.Range_;
  const tileToChange = await models.Tiles.findOne({
    where: { X_Position: input.x, Y_Position: input.y, Layer_ID: playerTile.Layer_ID },
  });

  if (!tileToChange) {
    return { ok: false, reason: REJECTIONS.NO_SUCH_TILE, data: { action: 'freeze' } };
  }

  if (playerClass.Class_Name !== 'Snowman') {
    return { ok: false, reason: REJECTIONS.WRONG_CLASS, data: { className: 'Snowman' } };
  }

  if (tileToChange.Tile_Type === 'Gateway_Open' || tileToChange.Tile_Type === 'Gateway_Locked') {
    return { ok: false, reason: REJECTIONS.WRONG_TILE_TYPE, data: { message: 'You cannot freeze a gateway tile!' } };
  }

  if (!tileInRange) {
    return { ok: false, reason: REJECTIONS.OUT_OF_RANGE, data: { message: 'You are not in range of the tile you want to freeze!' } };
  }

  if (player.Action_Points < 3) {
    return { ok: false, reason: REJECTIONS.NOT_ENOUGH_AP, data: { action: 'freeze a tile' } };
  }

  await models.Players.update(
    { Action_Points: player.Action_Points - 3 },
    { where: { Player_ID: player.Player_ID } },
  );
  await models.Tiles.update(
    { Tile_Type: 'Ice' },
    { where: { Tile_ID: tileToChange.Tile_ID } },
  );

  return {
    ok: true,
    kind: 'frozen',
    data: {
      x: input.x,
      y: input.y,
      // the pre-freeze type, as the old message showed (the row was read
      // before the update)
      previousTileType: tileToChange.Tile_Type,
      layerId: tileToChange.Layer_ID,
    },
  };
}

function present(result) {
  if (!result.ok) return { content: messageFor(result.reason, result.data) };
  const d = result.data;
  return { content: `You have made a ${d.previousTileType} tile on coordinates (${d.x}, ${d.y}) on layer ${d.layerId}!` };
}

module.exports = { parse, run, present };
