/**
 * /timestop - Clockwatcher class command: put the game into TIMESTOPPED for
 * 4 AP distributions, so only Clockwatchers can act.
 *
 * parse/run/present per TESTING.md Part 1. run() takes plain data and a
 * deps bundle and returns a CommandResult; it never sees an interaction.
 *
 * Ported from the old execute with these fixes, each a crash before (see the
 * conversion commit):
 * - the update wrote `GAMESTATES.TIMESTOPPED` but the old file never
 *   required enums.js, so every successful invocation threw a
 *   ReferenceError before the game was ever stopped; GAMESTATES is imported
 *   here and the same value is written
 * - it fell back to `utils.getOldestActiveGame`, which does not exist
 *   (TypeError whenever the game option was absent or named an unknown
 *   game); the port resolves the id via utils.getOldestActiveGameId and
 *   rejects with NO_SUCH_GAME when no game can be found
 * - a missing player now returns NOT_IN_GAME instead of crashing on
 *   player.Class_ID, and a missing class row is treated as "not a
 *   Clockwatcher" instead of crashing on playerClass.Class_Name
 * - both rejections called interaction.reply after the reply was already
 *   deferred (InteractionAlreadyReplied); the adapter edits the deferred
 *   reply instead. Their wording is unchanged, carried on data.message.
 *
 * Preserved as-is (see the pinning tests):
 * - there is NO gamestate gate: /timestop works in every gamestate,
 *   including OVER and DEV_PAUSED, and re-stopping an already TIMESTOPPED
 *   game just resets timestopTurns to 4
 * - there is NO dead check: a dead Clockwatcher can still stop time
 * - the 12 AP is a *threshold*, never spent - no Players row is written, so
 *   a Clockwatcher can stop time as often as they like
 * - the reported minutes come from the game row read before the update
 *   (AP_INTERVAL_MIN * 4), and the AP threshold and turn count are both
 *   hard-coded, not read from the game
 */
const { GAMESTATES, REJECTIONS } = require('../../enums.js');
const { messageFor } = require('../_messages.js');
const defaultDeps = require('../_deps.js');

const TIMESTOP_AP_COST = 12;
const TIMESTOP_TURNS = 4;

function parse(raw, actor) {
  return {
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

  if (!playerClass || playerClass.Class_Name !== 'Clockwatcher') {
    return {
      ok: false,
      reason: REJECTIONS.WRONG_CLASS,
      data: { className: 'Clockwatcher', message: 'Only clockwatchers can stop time!' },
    };
  }

  if (player.Action_Points < TIMESTOP_AP_COST) {
    return {
      ok: false,
      reason: REJECTIONS.NOT_ENOUGH_AP,
      data: { needed: TIMESTOP_AP_COST, has: player.Action_Points, message: "You don't have enough AP!" },
    };
  }

  // the AP is only a threshold - the old command never deducted it
  await models.Games.update(
    { GAME_STATE: GAMESTATES.TIMESTOPPED, timestopTurns: TIMESTOP_TURNS },
    { where: { Game_ID: game.Game_ID } },
  );

  return {
    ok: true,
    kind: 'timestopped',
    data: {
      gameId: game.Game_ID,
      turns: TIMESTOP_TURNS,
      // read off the pre-update game row, exactly as the old message did
      minutes: game.AP_INTERVAL_MIN * TIMESTOP_TURNS,
    },
  };
}

function present(result) {
  if (!result.ok) return { content: messageFor(result.reason, result.data) };
  const d = result.data;
  return { content: "Time has been stopped! You have " + d.minutes + " minutes all to yourself!\n and any other clockwatchers..." };
}

module.exports = { parse, run, present };
