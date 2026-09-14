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
 * - no Dead check on the CALLER: a dead hitman can still check their target
 * - the gamestate gate is called with isClockwatcher hardcoded false, as the
 *   old checkGameStateAndReply call did
 * - the hitman check is the loose `Class_ID != 10`
 *
 * Reassignment: a target that is dead, or that the hitman does not have, is
 * replaced with a random living player before the answer is presented, rather
 * than reported as "No current target...". Previously the only way to get a
 * new one was to wait for the next AP distribution, which does the same thing
 * in utils.distributeAP - so a hitman whose target died could be told they had
 * none for up to a whole interval.
 *
 * Two deliberate differences from the distributeAP version of this rule:
 * - the hitman is excluded from their own candidate list. distributeAP picks
 *   from every living player, so it can and does hand a hitman themselves.
 * - NO_TARGET now means "there is nobody left to target", not "your target
 *   row is missing", so its legacy wording survives for the case where the
 *   hitman is the last player standing.
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
  const { models, utils, random } = deps;

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

  let target = player.Hitman_Target == null
    ? null
    : await models.Players.findOne({ where: { Game_ID: gameId, Player_ID: player.Hitman_Target } });

  // a dead or missing target is not a target: hand out a new one now, so the
  // hitman never reads a stale name and never has to wait out an AP interval
  // for distributeAP to notice
  let reassigned = false;
  if (!target || target.Dead) {
    const candidates = (await models.Players.findAll({ where: { Game_ID: gameId, Dead: false } }))
      // a hitman is not their own target, unlike the distributeAP version
      .filter((candidate) => candidate.Player_ID !== player.Player_ID);
    if (candidates.length === 0) {
      return { ok: false, reason: REJECTIONS.NO_TARGET, data: { message: 'No current target...' } };
    }
    // getRandomInt(max) is INCLUSIVE of max, so index by length - 1; passing
    // the length rolls one past the end and hands back undefined
    target = candidates[random(candidates.length - 1)];
    await models.Players.update(
      { Hitman_Target: target.Player_ID },
      { where: { Game_ID: gameId, Player_ID: player.Player_ID } },
    );
    reassigned = true;
  }

  return {
    ok: true,
    kind: 'target',
    data: {
      targetDiscordId: target.Discord_ID,
      reassigned,
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
  // the legacy line is unchanged; a reassignment only adds a line above it,
  // so a hitman knows the name changed and why
  const line = 'Target: <@' + d.targetDiscordId + '> ' + ', Location: (' + d.x + ', ' + d.y + ') layer: ' + d.layerId + ', Class: ' + d.className;
  return { content: d.reassigned ? 'Your last target is gone, so you have a new one.\n' + line : line };
}

module.exports = { parse, run, present };
