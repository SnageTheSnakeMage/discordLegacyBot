/**
 * /heal - Doctor class command: turn any non-gateway tile in range into a
 * Heal tile for 5 AP.
 *
 * parse/run/present per TESTING.md Part 1. run() takes plain data and a deps
 * bundle and returns a CommandResult; it never sees an interaction.
 *
 * Ported from the old execute with these fixes, each of which was a crash
 * before (the old catch turned them into "An error occurred: ..."):
 * - the default-game lookup called utils.getOldestGameId() with no argument,
 *   which throws "missing playerDiscordID"; so /heal without the game option
 *   never worked. The actor's discord id is now passed, as board/burn do.
 * - a missing game now returns NO_SUCH_GAME instead of crashing on
 *   game.Game_ID
 * - a missing player now returns NOT_IN_GAME instead of crashing on
 *   player.Class_ID
 *
 * Preserved as-is (see the pinning tests):
 * - the gamestate gate passes isClockwatcher=false unconditionally, exactly
 *   like the old checkGameStateAndReply(gamestate, false, interaction) call
 * - the gamestate gate runs BEFORE the "no tile there" check, so a bad
 *   coordinate during a paused game reports the pause
 * - there is no dead-player check at all (unlike /burn)
 * - the success message names the tile's PRE-heal type (the row was read
 *   before the update), so players see "made a Blank1 tile", never "Heal"
 * - occupied tiles, existing Heal tiles and every other non-gateway type
 *   still heal; only Gateway_Open/Gateway_Locked are blocked
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

  // the old code hard-coded isClockwatcher=false here, and gated before any
  // of the coordinate checks; keep both
  // a Clockwatcher acts through a timestop. Every call site used to
  // hard-code false here, so the class's whole ability did nothing.
  const verdict = utils.checkGameState(
    game.GAME_STATE, await utils.isClockwatcher(models, player),
  );
  if (verdict.blocked) return { ok: false, reason: verdict.reason };

  if (!tileToChange) {
    return { ok: false, reason: REJECTIONS.NO_SUCH_TILE, data: { action: 'heal' } };
  }

  if (playerClass.Class_Name !== 'Doctor') {
    return { ok: false, reason: REJECTIONS.WRONG_CLASS, data: { className: 'Doctor' } };
  }

  if (tileToChange.Tile_Type === 'Gateway_Open' || tileToChange.Tile_Type === 'Gateway_Locked') {
    return { ok: false, reason: REJECTIONS.WRONG_TILE_TYPE, data: { message: 'You cannot heal a gateway tile!' } };
  }

  if (!tileInRange) {
    return { ok: false, reason: REJECTIONS.OUT_OF_RANGE, data: { message: 'You are not in range of the tile you want to heal!' } };
  }

  if (player.Action_Points < 5) {
    return { ok: false, reason: REJECTIONS.NOT_ENOUGH_AP, data: { action: 'heal a tile' } };
  }

  await models.Players.update(
    { Action_Points: player.Action_Points - 5 },
    { where: { Player_ID: player.Player_ID } },
  );
  await models.Tiles.update(
    { Tile_Type: 'Heal' },
    { where: { Tile_ID: tileToChange.Tile_ID } },
  );

  return {
    ok: true,
    kind: 'healed',
    data: {
      x: input.x,
      y: input.y,
      // the pre-heal type, as the old message showed (the row was read
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
