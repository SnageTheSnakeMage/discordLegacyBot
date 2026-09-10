/**
 * /swap - Switchmate class command: trade tiles with any player in the game.
 *
 * parse/run/present per TESTING.md Part 1. run() takes plain data and a deps
 * bundle and returns a CommandResult; it never sees an interaction.
 *
 * Ported from the old execute with these fixes, each of which was a crash or
 * a comparison that could never hold (see the conversion commit):
 * - execute called an undefined `deferReply(interaction)` helper, so every
 *   invocation threw ReferenceError before any game logic ran; the adapter
 *   now uses plain `interaction.deferReply()`
 * - `utils.getOldestGameId()` was called with no argument; that function
 *   throws "missing playerDiscordID" for a falsy id, so omitting the game
 *   option always failed. It now receives the actor's discord id
 * - a missing game row crashed on `game.GAME_STATE` -> NO_SUCH_GAME
 * - `player.Class != "Switchmate"` compared against a column that does not
 *   exist on Players (see database/Models/Players.js - the class name lives
 *   on Classes), so the equality could never hold and the command answered
 *   "You are not a Switchmate!" for everyone, Switchmates included. The check
 *   now loads the player's class row and compares Class_Name
 * - that same class check dereferenced `player` before the `if (!player)`
 *   guard below it, so a player who was not in the game crashed instead of
 *   being told; the NOT_IN_GAME guard now runs first, and its message is the
 *   one the old (unreachable) branch was written to send
 * - a missing tile row for either side crashed on `playersTIle.Layer_ID` ->
 *   NO_SUCH_TILE
 *
 * Preserved as-is (each pinned by a test):
 * - the command is free. The description advertises 4 AP, but the old code
 *   never checked or deducted any, and neither does this
 * - there is no Dead check, so a dead Switchmate can still swap
 * - the gamestate gate is called with isClockwatcher = false, so even a
 *   Clockwatcher Switchmate is blocked by a timestop
 * - only `Players.Tile_ID` moves. The Tiles.PlayerN occupancy slots are left
 *   pointing at whoever was there before, and Tile_ID2 (a Twin's second
 *   body) is never considered
 */
const { REJECTIONS } = require('../../enums.js');
const { messageFor } = require('../_messages.js');
const defaultDeps = require('../_deps.js');

function parse(raw, actor) {
  return {
    victimDiscordId: raw.victim,
    victimUsername: raw.victimUsername ?? null,
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

  const player = await models.Players.findOne({ where: { Game_ID: gameId, Discord_ID: input.discordId } });
  const victim = await models.Players.findOne({ where: { Game_ID: gameId, Discord_ID: input.victimDiscordId } });

  // the old code passed isClockwatcher = false unconditionally
  // a Clockwatcher acts through a timestop. Every call site used to
  // hard-code false here, so the class's whole ability did nothing.
  const verdict = utils.checkGameState(
    game.GAME_STATE, await utils.isClockwatcher(models, player),
  );
  if (verdict.blocked) return { ok: false, reason: verdict.reason };

  // moved ahead of the class check, which used to dereference a null player
  if (!player) {
    return { ok: false, reason: REJECTIONS.NOT_IN_GAME, data: { message: 'You are not in this game!' } };
  }

  const playerClass = await models.Classes.findByPk(player.Class_ID);
  if (!playerClass || playerClass.Class_Name !== 'Switchmate') {
    return { ok: false, reason: REJECTIONS.WRONG_CLASS, data: { className: 'Switchmate' } };
  }

  if (!victim) {
    return { ok: false, reason: REJECTIONS.TARGET_NOT_IN_GAME, data: { message: 'The victim is not in this game!' } };
  }

  const playersTile = await models.Tiles.findByPk(player.Tile_ID);
  const victimsTile = await models.Tiles.findByPk(victim.Tile_ID);
  if (!playersTile || !victimsTile) return { ok: false, reason: REJECTIONS.NO_SUCH_TILE };

  // loose equality, as before: the coordinate columns are numeric but a
  // DECIMAL slot can arrive as a string from the driver
  if (playersTile.Layer_ID == victimsTile.Layer_ID
    && playersTile.X_Position == victimsTile.X_Position
    && playersTile.Y_Position == victimsTile.Y_Position) {
    return { ok: false, reason: REJECTIONS.SAME_TILE };
  }

  // no AP is spent. Both sides of the position invariant are written: this
  // used to move Players.Tile_ID only, leaving the Tiles.PlayerN slots
  // pointing at whoever was there before (#78).
  await deps.utils.swapPlayerTiles(player.Player_ID, victim.Player_ID);

  return {
    ok: true,
    kind: 'swapped',
    data: {
      victimUsername: input.victimUsername,
      victimDiscordId: input.victimDiscordId,
      gameId,
    },
  };
}

function present(result) {
  if (!result.ok) return { content: messageFor(result.reason, result.data) };
  // concatenation, not a template literal, so an absent username renders
  // exactly as it did before
  return { content: 'You have swapped places with ' + result.data.victimUsername };
}

module.exports = { parse, run, present };
