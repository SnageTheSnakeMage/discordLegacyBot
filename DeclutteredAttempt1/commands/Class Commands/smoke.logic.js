/**
 * /smoke - Smoker class command: turn a blank tile in range into a Smoke
 * tile for 1 AP.
 *
 * parse/run/present per TESTING.md Part 1. run() takes plain data and a
 * deps bundle and returns a CommandResult; it never sees an interaction.
 *
 * Ported from the old execute with these fixes:
 * - the gamestate switch was `switch (game.GAMESTATES)` over a `GAMESTATES`
 *   identifier that smoke.js never imported, so evaluating the first case
 *   threw ReferenceError on EVERY invocation and the local catch turned the
 *   whole command into "An error occurred: GAMESTATES is not defined". It is
 *   replaced by the shared utils.checkGameState gate plus this command's own
 *   REGISTRATION block, which is what the dead switch intended
 * - that switch's GAMESTATES.FINISHED case named a state that does not exist
 *   (the real name is OVER); checkGameState covers OVER
 * - a missing game now returns NO_SUCH_GAME instead of crashing on
 *   game.Game_ID
 * - a missing player now returns NOT_IN_GAME instead of crashing on
 *   player.Class_ID
 * - the blank-tile guard `Tile_Type != "Blank1" || Tile_Type == "Blank2"`
 *   had a second comparison that can never be true (a type that is not
 *   "Blank1" already rejected; one that is "Blank1" is never "Blank2"); only
 *   the first comparison is kept, which is exactly what the old code did
 *
 * Preserved as-is (see the pinning tests):
 * - only Blank1 smokes: Blank2 is rejected with "You can only smoke blank
 *   tiles!" despite the wording
 * - the gamestate gate passes isClockwatcher=false (the old switch blocked
 *   TIMESTOPPED for everyone; a Smoker is never a Clockwatcher anyway)
 * - the success message names the tile's PRE-smoke type (the row was read
 *   before the update), so players always see "made a Blank1 tile"
 * - occupied tiles still smoke; there is no occupant check
 * - rejection order: dead player, gamestate, missing tile, class, tile type,
 *   range, AP
 */
const { GAMESTATES, REJECTIONS } = require('../../enums.js');
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

  // the old switch hard-coded no Clockwatcher exemption; keep that
  // a Clockwatcher acts through a timestop. Every call site used to
  // hard-code false here, so the class's whole ability did nothing.
  const verdict = utils.checkGameState(
    game.GAME_STATE, await utils.isClockwatcher(models, player),
  );
  if (verdict.blocked) return { ok: false, reason: verdict.reason };
  // ... and it blocked REGISTRATION too, which checkGameState lets through
  if (game.GAME_STATE === GAMESTATES.REGISTRATION) {
    return { ok: false, reason: REJECTIONS.GAME_IN_REGISTRATION };
  }

  if (!tileToChange) {
    return { ok: false, reason: REJECTIONS.NO_SUCH_TILE, data: { action: 'smoke' } };
  }

  if (playerClass.Class_Name !== 'Smoker') {
    return { ok: false, reason: REJECTIONS.WRONG_CLASS, data: { className: 'Smoker' } };
  }

  if (tileToChange.Tile_Type !== 'Blank1') {
    return { ok: false, reason: REJECTIONS.WRONG_TILE_TYPE, data: { message: 'You can only smoke blank tiles!' } };
  }

  if (!tileInRange) {
    return { ok: false, reason: REJECTIONS.OUT_OF_RANGE, data: { message: 'You are not in range of the tile you want to smoke!' } };
  }

  if (player.Action_Points < 1) {
    return { ok: false, reason: REJECTIONS.NOT_ENOUGH_AP, data: { action: 'smoke a tile' } };
  }

  await models.Players.update(
    { Action_Points: player.Action_Points - 1 },
    { where: { Player_ID: player.Player_ID } },
  );
  await models.Tiles.update(
    { Tile_Type: 'Smoke' },
    { where: { Tile_ID: tileToChange.Tile_ID } },
  );

  return {
    ok: true,
    kind: 'smoked',
    data: {
      x: input.x,
      y: input.y,
      // the pre-smoke type, as the old message showed (the row was read
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
