/**
 * /dig - Gravedigger class command: turn any empty non-gateway tile in
 * range into a Void tile for 4 AP.
 *
 * parse/run/present per TESTING.md Part 1. run() takes plain data and a
 * deps bundle and returns a CommandResult; it never sees an interaction.
 *
 * Ported from the old execute with these fixes:
 * - the player lookup used `Player_ID: playerDiscordID` (an integer PK
 *   compared to a discord snowflake - can never match), so every dig
 *   crashed on player.Class_ID; it now looks up by Discord_ID and a
 *   missing player returns NOT_IN_GAME
 * - a missing game now returns NO_SUCH_GAME instead of crashing on
 *   game.Game_ID (the old catch turned that into "An error occurred: ...")
 * - getOldestGameId was called with NO argument, so the no-game-option
 *   default always resolved undefined and crashed; it now receives the
 *   actor's discord id like the other converted commands
 *
 * Preserved as-is (see the pinning tests):
 * - the gamestate gate runs BEFORE the missing-tile check, and passes
 *   isClockwatcher=false unconditionally, exactly like the old
 *   checkGameStateAndReply(gamestate, false, interaction) call
 * - there is no dead-player check: a dead Gravedigger can still dig
 * - the success message names the tile's PRE-dig type (the row was read
 *   before the update), so players see "made a Blank1 tile", never "Void"
 * - rejection order: gamestate, missing tile, class, gateway, occupied,
 *   range, AP
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

  const playerClass = await models.Classes.findByPk(player.Class_ID);
  const playerTile = await models.Tiles.findByPk(player.Tile_ID);
  const tileInRange = utils.getTileCordinatesOfLine(
    [playerTile.X_Position, playerTile.Y_Position],
    [input.x, input.y],
  ).length <= player.Range_;
  const tileToChange = await models.Tiles.findOne({
    where: { X_Position: input.x, Y_Position: input.y, Layer_ID: playerTile.Layer_ID },
  });

  // the old code hard-coded isClockwatcher=false here, and gated BEFORE
  // verifying the tile; keep both
  // a Clockwatcher acts through a timestop. Every call site used to
  // hard-code false here, so the class's whole ability did nothing.
  const verdict = utils.checkGameState(
    game.GAME_STATE, await utils.isClockwatcher(models, player),
  );
  if (verdict.blocked) return { ok: false, reason: verdict.reason };

  if (!tileToChange) {
    return { ok: false, reason: REJECTIONS.NO_SUCH_TILE, data: { action: 'dig' } };
  }

  if (playerClass.Class_Name !== 'Gravedigger') {
    return { ok: false, reason: REJECTIONS.WRONG_CLASS, data: { className: 'Gravedigger' } };
  }

  if (tileToChange.Tile_Type === 'Gateway_Open' || tileToChange.Tile_Type === 'Gateway_Locked') {
    return { ok: false, reason: REJECTIONS.WRONG_TILE_TYPE, data: { message: 'You cannot dig a gateway tile!' } };
  }

  if (tileToChange.Player1 != null || tileToChange.Player2 != null
    || tileToChange.Player3 != null || tileToChange.Player4 != null) {
    // legacy wording says "this tile", the TILE_OCCUPIED default says "that"
    return { ok: false, reason: REJECTIONS.TILE_OCCUPIED, data: { message: 'There is a player on this tile!' } };
  }

  if (!tileInRange) {
    return { ok: false, reason: REJECTIONS.OUT_OF_RANGE, data: { message: 'You are not in range of the tile you want to dig!' } };
  }

  if (player.Action_Points < 4) {
    return { ok: false, reason: REJECTIONS.NOT_ENOUGH_AP, data: { action: 'dig a tile' } };
  }

  await models.Players.update(
    { Action_Points: player.Action_Points - 4 },
    { where: { Player_ID: player.Player_ID } },
  );
  await models.Tiles.update(
    { Tile_Type: 'Void' },
    { where: { Tile_ID: tileToChange.Tile_ID } },
  );

  return {
    ok: true,
    kind: 'dug',
    data: {
      x: input.x,
      y: input.y,
      // the pre-dig type, as the old message showed (the row was read
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
