/**
 * /trap - Minesweeper class command: plant a mine on a tile in range for 1 AP.
 *
 * parse/run/present per TESTING.md Part 1. run() takes plain data and a
 * deps bundle and returns a CommandResult; it never sees an interaction.
 *
 * Ported from the old execute with these fixes:
 * - the default-game lookup called `utils.getOldestGameId()` with NO
 *   argument, so it returned undefined, `Games.findByPk(undefined)` found
 *   nothing and the very next line threw on `game.Game_ID` - every /trap
 *   without an explicit game option died in the local catch as
 *   "An error occurred: Cannot read properties of null". The actor's discord
 *   id is now passed, exactly as board does
 * - a missing game now returns NO_SUCH_GAME instead of crashing on
 *   game.Game_ID
 * - a missing player now returns NOT_IN_GAME instead of crashing on
 *   player.Class_ID
 * - the per-command try/catch is gone; events/interactionCreate.js is the
 *   single error handler (accepted behaviour change, see the conversion
 *   commit)
 *
 * Preserved as-is (see the pinning tests):
 * - the gamestate gate passes isClockwatcher=false, so a Clockwatcher is
 *   blocked during a timestop like everyone else (the old
 *   checkGameStateAndReply call hard-coded false)
 * - REGISTRATION is NOT blocked: the old gate only stopped OVER, DEV_PAUSED
 *   and TIMESTOPPED, unlike most other class commands
 * - there is no Dead check, so a dead Minesweeper can still plant mines
 * - the target tile's type and occupancy are never checked: walls, void and
 *   occupied tiles can all be trapped, and an already-trapped tile is simply
 *   re-trapped with the new trapper
 * - the target tile is looked up on the player's own layer only, so trapping
 *   across layers is impossible
 * - rejection order: gamestate, missing tile, class, range, AP
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

  // the old call hard-coded no Clockwatcher exemption; keep that
  const verdict = utils.checkGameState(game.GAME_STATE, false);
  if (verdict.blocked) return { ok: false, reason: verdict.reason };

  if (!tileToChange) {
    return { ok: false, reason: REJECTIONS.NO_SUCH_TILE, data: { action: 'trap' } };
  }

  if (playerClass.Class_Name !== 'Minesweeper') {
    return { ok: false, reason: REJECTIONS.WRONG_CLASS, data: { className: 'Minesweeper' } };
  }

  if (!tileInRange) {
    return { ok: false, reason: REJECTIONS.OUT_OF_RANGE, data: { message: 'You are not in range of the tile you want to trap!' } };
  }

  if (player.Action_Points < 1) {
    return { ok: false, reason: REJECTIONS.NOT_ENOUGH_AP, data: { action: 'trap a tile' } };
  }

  await models.Players.update(
    { Action_Points: player.Action_Points - 1 },
    { where: { Player_ID: player.Player_ID } },
  );
  await models.Tiles.update(
    { trapped: true, trapper: player.Player_ID },
    { where: { Tile_ID: tileToChange.Tile_ID } },
  );

  return {
    ok: true,
    kind: 'trapped',
    data: {
      x: input.x,
      y: input.y,
      layerId: tileToChange.Layer_ID,
    },
  };
}

function present(result) {
  if (!result.ok) return { content: messageFor(result.reason, result.data) };
  const d = result.data;
  return { content: `You have planted a mine on coordinates (${d.x}, ${d.y}) on layer ${d.layerId}!` };
}

module.exports = { parse, run, present };
