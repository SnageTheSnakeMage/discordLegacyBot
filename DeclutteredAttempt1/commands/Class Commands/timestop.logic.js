/**
 * /timestop - Clockwatcher class command: set the game's timeStopped flag for 4
 * AP distributions, so only Clockwatchers can act.
 *
 * parse/run/present per TESTING.md Part 1. run() takes plain data and a deps
 * bundle and returns a CommandResult; it never sees an interaction.
 *
 * The flag is the whole write. The game stays in whatever gamestate it was in
 * and keeps whatever else is true of it, which is what lets a timestop happen
 * during a finale without either one losing track of the other.
 *
 * The rules, each pinned by a test:
 * - there is NO gamestate gate: /timestop works in every gamestate, including
 *   OVER and DEV_PAUSED, and re-stopping an already stopped game just resets
 *   timestopTurns to 4
 * - there is NO dead check: a dead Clockwatcher can still stop time
 * - the 12 AP is a *threshold*, never spent - no Players row is written, so a
 *   Clockwatcher can stop time as often as they like
 * - the reported minutes come from the game row read before the update
 *   (AP_INTERVAL_MIN * 4), and the AP threshold and turn count are both
 *   hard-coded, not read from the game
 * - a missing player is NOT_IN_GAME, a missing class row is "not a
 *   Clockwatcher", and a game that cannot be resolved is NO_SUCH_GAME
 */
const { REJECTIONS } = require('../../enums.js');
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
  //a flag, not a gamestate: the game carries on being whatever it was, so a
  //timestop during a finale no longer ends by dropping the game back to ACTIVE
  //and running the finale transition again
  await models.Games.update(
    { timeStopped: true, timestopTurns: TIMESTOP_TURNS },
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
