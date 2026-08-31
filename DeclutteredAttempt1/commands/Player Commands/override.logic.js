/**
 * /override - a Dead Medium spends one of their chaos-council overrides.
 *
 * parse/run/present per TESTING.md Part 1. run() takes plain data and a
 * deps bundle and returns a CommandResult; it never sees an interaction.
 *
 * The legacy command was unfinished (issue #85) and could not complete a
 * single execution. Ported with these fixes, each a crash or a dead read:
 * - it referenced an out-of-scope `client` to fetch the dead-chat channel
 *   and the poll message (ReferenceError on every invocation); the poll is
 *   never read or written by the reachable logic, so run() does neither and
 *   the success result says so instead of pretending
 * - it fell back to `utils.getOldestActiveGame`, which does not exist
 *   (TypeError whenever the game option was absent or unknown); the port
 *   resolves the id via utils.getOldestActiveGameId and rejects with
 *   NO_SUCH_GAME when the game cannot be found
 * - a missing player now returns NOT_IN_GAME instead of crashing on
 *   player.Class_ID
 * - it read interaction.options.getInteger('pollOption') but the option is
 *   registered as 'option', so the value was always null; parse reads the
 *   registered name
 * - rejections called interaction.reply after deferReply (which throws
 *   InteractionAlreadyReplied); the adapter edits the deferred reply
 *
 * Preserved as-is: the gate passes only a player who is BOTH dead AND a
 * Medium (the message says "Dead or Medium" but the legacy condition
 * `!player.Dead || Class_Name != "Medium"` rejects everyone else), and no
 * gamestate is ever checked - the legacy command had no gamestate gate.
 */
const { REJECTIONS } = require('../../enums.js');
const { messageFor } = require('../_messages.js');
const defaultDeps = require('../_deps.js');

function parse(raw, actor) {
  return {
    pollOption: raw.option,
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

  // legacy condition verbatim: only a dead Medium gets past this
  if (!player.Dead || playerClass.Class_Name !== 'Medium') {
    return { ok: false, reason: REJECTIONS.NOT_DEAD_OR_MEDIUM };
  }

  if (player.cCOverides <= 0) {
    return { ok: false, reason: REJECTIONS.NO_OVERRIDES };
  }

  await models.Players.update({ cCOverides: player.cCOverides - 1 }, { where: { Player_ID: player.Player_ID } });
  await models.Games.update({ overrider: player.Discord_ID }, { where: { Game_ID: game.Game_ID } });

  // the poll itself is untouched - applying the override to the chaos
  // council poll is not implemented yet (issue #85)
  return {
    ok: true,
    kind: 'override-recorded',
    data: {
      gameId: game.Game_ID,
      pollOption: input.pollOption,
      overridesLeft: player.cCOverides - 1,
    },
  };
}

function present(result) {
  if (!result.ok) return { content: messageFor(result.reason, result.data) };
  // the legacy command sent nothing on success (the deferred reply was left
  // hanging); this notice replaces that silence until #85 lands
  return { content: 'Your override has been recorded, but applying it to the chaos council poll is not implemented yet.' };
}

module.exports = { parse, run, present };
