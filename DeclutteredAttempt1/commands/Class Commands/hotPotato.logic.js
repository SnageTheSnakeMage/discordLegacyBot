/**
 * /hotpotato - Hot Potato class command: swap classes with a player in range
 * for 12 AP.
 *
 * parse/run/present per TESTING.md Part 1. run() takes plain data and a deps
 * bundle and returns a CommandResult; it never sees an interaction.
 *
 * Ported from the old execute with these fixes, each of which was a crash or
 * an always-false comparison before (see the conversion commit):
 * - execute called an undefined `deferReply(interaction)` helper, so every
 *   invocation threw ReferenceError before any game logic ran; the adapter
 *   now uses plain `interaction.deferReply()`
 * - `utils.getOldestGameId()` was called with no argument; the surviving
 *   definition throws "missing playerDiscordID" for a falsy id, so omitting
 *   the game option always failed. It now receives the actor's discord id
 * - a missing game / missing player / missing player tile crashed on
 *   `game.GAME_STATE`, `player.Tile_ID` and `playersTile.Layer_ID`; they now
 *   return NO_SUCH_GAME / NOT_IN_GAME / NO_SUCH_TILE
 * - `player.Class != "Hot Potato"` compared against a column that does not
 *   exist on Players (see database/Models/Players.js - the class name lives
 *   on Classes), so the equality could never hold and the command always
 *   answered "You are not a Hot Potato!". The check now loads the player's
 *   class row and compares Class_Name
 * - coordinates with no tile on the player's layer crashed on
 *   `victimTile.Tile_ID`; they now return TARGET_NOT_ON_TILE, the same
 *   answer the player got for a victim standing somewhere else
 *
 * Preserved as-is: the 12 AP is checked but never actually deducted, and the
 * success line appends utils.hotPotatoSwap's return value verbatim, which is
 * undefined for classes with no special case - so the player sees a trailing
 * "undefined". Both are pinned by tests.
 */
const { REJECTIONS } = require('../../enums.js');
const { messageFor } = require('../_messages.js');
const defaultDeps = require('../_deps.js');

const AP_COST = 12;

function parse(raw, actor) {
  return {
    victimDiscordId: raw.victim,
    victimUsername: raw.victimUsername ?? null,
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

  const player = await models.Players.findOne({ where: { Game_ID: gameId, Discord_ID: input.discordId } });
  if (!player) return { ok: false, reason: REJECTIONS.NOT_IN_GAME };

  // the old code passed isClockwatcher = false unconditionally
  // a Clockwatcher acts through a timestop. Every call site used to
  // hard-code false here, so the class's whole ability did nothing.
  const verdict = utils.checkGameState(
    game.GAME_STATE, await utils.isClockwatcher(models, player),
  );
  if (verdict.blocked) return { ok: false, reason: verdict.reason };

  const playerClass = await models.Classes.findByPk(player.Class_ID);
  if (!playerClass || playerClass.Class_Name !== 'Hot Potato') {
    return { ok: false, reason: REJECTIONS.WRONG_CLASS, data: { className: 'Hot Potato' } };
  }

  const victim = await models.Players.findOne({ where: { Game_ID: gameId, Discord_ID: input.victimDiscordId } });
  if (!victim) return { ok: false, reason: REJECTIONS.TARGET_NOT_IN_GAME, data: { role: 'victim' } };

  const playersTile = await models.Tiles.findByPk(player.Tile_ID);
  if (!playersTile) return { ok: false, reason: REJECTIONS.NO_SUCH_TILE };

  // the victim's tile is looked up on the player's own layer, so a victim on
  // another layer never matches
  const victimTile = await models.Tiles.findOne({
    where: { Layer_ID: playersTile.Layer_ID, X_Position: input.x, Y_Position: input.y },
  });
  if (!victimTile || victim.Tile_ID !== victimTile.Tile_ID) {
    return { ok: false, reason: REJECTIONS.TARGET_NOT_ON_TILE, data: { role: 'victim' } };
  }

  const lineLength = utils.getTileCordinatesOfLine(
    [playersTile.X_Position, playersTile.Y_Position],
    [victimTile.X_Position, victimTile.Y_Position],
  ).length;
  if (lineLength > player.Range_) {
    return { ok: false, reason: REJECTIONS.OUT_OF_RANGE, data: { role: 'victim' } };
  }

  if (player.Action_Points < AP_COST) {
    return { ok: false, reason: REJECTIONS.NOT_ENOUGH_AP, data: { action: 'swap classes' } };
  }

  // the old code never spent the 12 AP; only the class ids move
  const extraResponse = await utils.hotPotatoSwap(player, victim, input.username, input.victimUsername);
  await models.Players.update({ Class_ID: victim.Class_ID }, { where: { Player_ID: player.Player_ID } });
  await models.Players.update({ Class_ID: player.Class_ID }, { where: { Player_ID: victim.Player_ID } });

  return {
    ok: true,
    kind: 'classesSwapped',
    data: {
      victimUsername: input.victimUsername,
      victimDiscordId: input.victimDiscordId,
      extraResponse,
    },
  };
}

function present(result) {
  if (!result.ok) return { content: messageFor(result.reason, result.data) };
  const d = result.data;
  // concatenation, not a template literal, so an absent extraResponse renders
  // exactly as it did before
  return { content: 'You have swapped classes with ' + d.victimUsername + '!\n' + d.extraResponse };
}

module.exports = { parse, run, present };
