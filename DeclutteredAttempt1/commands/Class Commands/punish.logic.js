/**
 * /punish - UNFINISHED class command (issue #84). It advertises "spend 4 AP
 * to deal (targets Missed AP+HP) damage to another player in range", but the
 * Punisher class has no row in the database and the attack itself was never
 * written: what shipped is leftover /shoot code operating on an `amount`
 * variable that is declared nowhere in the file.
 *
 * parse/run/present per TESTING.md Part 1. run() takes plain data and a deps
 * bundle and returns a CommandResult; it never sees an interaction.
 *
 * Ported from the old execute with these fixes, each of which was a crash
 * before (see the conversion commit):
 * - utils.getOldestGameId() was called with no argument, and that helper
 *   throws "missing playerDiscordID" without one, so the default-game path
 *   always errored; it now receives the punisher's discord id
 * - a missing game row crashed on game.GAME_STATE -> NO_SUCH_GAME
 * - a missing player row crashed on player.Class_ID -> NOT_IN_GAME
 * - a null attacker tile crashed on shootersTile.Layer_ID before its own
 *   "You are not on the board!" guard could run; the guard now runs first
 * - a null target tile crashed on targetTile.X_Position (building the attack
 *   path) before its own "That tile is not on the board!" guard could run;
 *   the guard now runs first
 * - `interaction.options.getInteger('body')` read an option this command's
 *   builder never declares, so it was always null and the Tile_ID2 branch
 *   could never be taken; only Tile_ID is read now
 * - the leftover attack loop is NOT ported. Every branch of it reaches
 *   `amount--` or `amount * player.Damage`, and `amount` is never declared,
 *   so a punish that passed every guard could only end in a ReferenceError -
 *   after possibly damaging one wall tile on the way. Rather than keep a
 *   half-write followed by a crash, run() rejects where the loop stood. No
 *   REJECTIONS code means "this command is not implemented", so this uses
 *   the closest one: WRONG_CLASS naming the Punisher class that no player
 *   can be, because it does not exist in the database.
 *
 * Preserved as-is (each pinned by a test):
 * - punish writes nothing at all, ever: the legacy AP deduction sat after
 *   the loop, so no AP was ever actually spent
 * - the gamestate gate passes isClockwatcher=false, so a Clockwatcher is
 *   blocked by a timestop here too
 * - the not-enough-AP message still talks about shooting
 * - the AP cost is a flat 4, not game.shootCost
 * - the target player is looked up by Discord_ID alone (no Game_ID filter)
 * - only the target's Tile_ID is checked, never Tile_ID2, so a Twin's second
 *   body cannot be punished
 * - the Classes lookup is dropped: its only reader was the Hunter check
 *   inside the unported loop
 *
 * This is a port, not a finish: nothing here implements the Missed AP + HP
 * damage the description promises. That is still issue #84.
 */
const { REJECTIONS } = require('../../enums.js');
const { messageFor } = require('../_messages.js');
const defaultDeps = require('../_deps.js');

const REQUIRED_AP = 4;

function parse(raw, actor) {
  return {
    x: raw.x,
    y: raw.y,
    targetDiscordId: raw.target,
    gameId: raw.game ?? null,
    discordId: actor.discordId,
  };
}

async function run(input, deps = defaultDeps) {
  const { models, utils } = deps;

  const gameId = input.gameId ?? await utils.getOldestGameId(input.discordId);
  const game = await models.Games.findByPk(gameId);
  if (!game) return { ok: false, reason: REJECTIONS.NO_SUCH_GAME, data: { gameId } };

  const player = await models.Players.findOne({ where: { Discord_ID: input.discordId, Game_ID: gameId } });
  if (!player) return { ok: false, reason: REJECTIONS.NOT_IN_GAME };

  // the legacy body option was never declared on this command, so this was
  // always the Tile_ID branch
  const attackersTile = await models.Tiles.findByPk(player.Tile_ID);
  // the old code dereferenced a null attacker tile here (crash fix; the
  // legacy guard message is kept byte-identical)
  if (!attackersTile) {
    return { ok: false, reason: REJECTIONS.NOT_IN_GAME, data: { message: 'You are not on the board! Are you registered in that game?' } };
  }

  // looked up by Discord_ID alone, exactly as before - no Game_ID filter
  const targetPlayer = await models.Players.findOne({
    where: { Discord_ID: input.targetDiscordId, Game_ID: game.Game_ID },
  });

  const targetTile = await models.Tiles.findOne({ where: { Layer_ID: attackersTile.Layer_ID, X_Position: input.x, Y_Position: input.y } });
  // the old code dereferenced a null target tile building the attack path
  // (crash fix); NO_SUCH_TILE's default text is the legacy string
  if (!targetTile) return { ok: false, reason: REJECTIONS.NO_SUCH_TILE };

  // get all tiles between player and target
  const attackPath = utils.getTileCordinatesOfLine(
    [attackersTile.X_Position, attackersTile.Y_Position],
    [targetTile.X_Position, targetTile.Y_Position],
  );

  // the old code hardcoded isClockwatcher=false here, so even Clockwatchers
  // are blocked by a timestop
  const verdict = utils.checkGameState(game.GAME_STATE, false);
  if (verdict.blocked) return { ok: false, reason: verdict.reason };

  if (player.Action_Points < REQUIRED_AP) {
    return { ok: false, reason: REJECTIONS.NOT_ENOUGH_AP, data: { message: "You don't have enough AP to shoot that much!" } };
  }

  if (!input.targetDiscordId || !targetPlayer) {
    return { ok: false, reason: REJECTIONS.TARGET_NOT_IN_GAME, data: { message: 'That mention does not correspond to a player registered in that game!' } };
  }

  if (targetPlayer.Tile_ID != targetTile.Tile_ID) {
    return { ok: false, reason: REJECTIONS.TARGET_NOT_ON_TILE, data: { message: "That player isnt on that tile!" } };
  }

  // -1 cus we dont want to count the tile the player is on
  if (player.Range_ < attackPath.length - 1) {
    return {
      ok: false,
      reason: REJECTIONS.OUT_OF_RANGE,
      data: { message: `That tile is ${(attackPath.length - 1) - player.Range_} tiles out of range!` },
    };
  }

  // Everything past this point was the copied /shoot attack loop, which could
  // only throw (see the header). The class is unimplemented and no player can
  // be a Punisher, so the command stops here and charges nothing.
  return { ok: false, reason: REJECTIONS.WRONG_CLASS, data: { className: 'Punisher' } };
}

function present(result) {
  // punish has no implemented success path: every run() outcome is a
  // rejection, so there is no success branch to render.
  return { content: messageFor(result.reason, result.data) };
}

module.exports = { parse, run, present };
