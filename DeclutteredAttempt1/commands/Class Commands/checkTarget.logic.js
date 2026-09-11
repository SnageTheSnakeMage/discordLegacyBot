/**
 * /check-target - Hitman class command: show your current target's location,
 * name and class.
 *
 * parse/run/present per TESTING.md Part 1. Ported from the old execute with
 * these fixes, each of which was a crash before (see the conversion commit):
 * - a missing game now returns NO_SUCH_GAME instead of crashing on
 *   game.GAME_STATE
 * - a missing player now returns NOT_IN_GAME instead of crashing on
 *   player.Class_ID
 * - the target lookup's where-clause used the Games row object itself
 *   ({ Game_ID: game }) instead of the id, so it could never match a row
 *   (Sequelize rejects a model instance as a where value); it now uses
 *   gameId, which is what every other lookup in the command uses
 *
 * Preserved as-is (pinned by tests):
 * - the success message reads X_Position, Y_Position, Layer_ID and Class off
 *   the target's PLAYERS row; none of those are Players columns, so the
 *   message renders them as "undefined" exactly as the source line would
 * - no Dead check: a dead hitman can still check their target
 * - the gamestate gate is called with isClockwatcher hardcoded false, as the
 *   old checkGameStateAndReply call did
 * - the hitman check is the loose `Class_ID != 10`
 */
const { REJECTIONS } = require('../../enums.js');
const { messageFor } = require('../_messages.js');
const defaultDeps = require('../_deps.js');

function parse(raw, actor) {
  return {
    gameId: raw.game ?? null,
    discordId: actor.discordId,
  };
}

async function run(input, deps = defaultDeps) {
  const { models, utils } = deps;

  const gameId = input.gameId ?? await utils.getOldestGameId(input.discordId);
  const game = await models.Games.findByPk(gameId);
  if (!game) return { ok: false, reason: REJECTIONS.NO_SUCH_GAME, data: { gameId } };

  // the lookup is hoisted above the gate so a Clockwatcher can act through a
  // timestop; the NOT_IN_GAME rejection stays below it, so rejection ORDER
  // is unchanged
  const player = await models.Players.findOne({ where: { Game_ID: gameId, Discord_ID: input.discordId } });
  // a Clockwatcher acts through a timestop. Every call site used to
  // hard-code false here, so the class's whole ability did nothing.
  const verdict = utils.checkGameState(
    game.GAME_STATE, await utils.isClockwatcher(models, player),
  );
  if (verdict.blocked) return { ok: false, reason: verdict.reason };

  if (!player) return { ok: false, reason: REJECTIONS.NOT_IN_GAME };

  if (player.Class_ID != 10) {
    return { ok: false, reason: REJECTIONS.WRONG_CLASS, data: { className: 'hitman' } };
  }

  const target = await models.Players.findOne({ where: { Game_ID: gameId, Player_ID: player.Hitman_Target } });
  if (!target) {
    return { ok: false, reason: REJECTIONS.NO_TARGET, data: { message: 'No current target...' } };
  }

  return {
    ok: true,
    kind: 'target',
    data: {
      targetDiscordId: target.Discord_ID,
      // quirk preserved: these are not Players columns, so they are
      // undefined and render as "undefined", exactly as the old message did
      x: target.X_Position,
      y: target.Y_Position,
      layerId: target.Layer_ID,
      className: target.Class,
    },
  };
}

function present(result) {
  if (!result.ok) return { content: messageFor(result.reason, result.data) };
  const d = result.data;
  return { content: 'Target: <@' + d.targetDiscordId + '> ' + ', Location: (' + d.x + ', ' + d.y + ') layer: ' + d.layerId + ', Class: ' + d.className };
}

module.exports = { parse, run, present };
