/**
 * /change-gamestate - dev-only: move a game through its life.
 *
 * parse/run/present per TESTING.md Part 1. run() takes plain data and a deps
 * bundle and returns a CommandResult; it never sees an interaction. The
 * process.env.DEV_ID gate stays in the adapter and arrives here as input.isDev.
 *
 * The four GAMESTATES are the only thing this command sets. Time stop, the
 * finale, sandbox mode and the game clock are flags on the row, and /gameflags
 * is what sets those.
 *
 * The clock follows the state here: a game being played runs, and anything else
 * does not. utils.setGameState is what writes both, so the pair cannot end up
 * disagreeing, and it resets the AP timestamp when the clock starts so an
 * unpaused game is not immediately paid for the time it spent stopped.
 */
const { REJECTIONS, GAMESTATES } = require('../../enums.js');
const { messageFor } = require('../_messages.js');
const defaultDeps = require('../_deps.js');

function parse(raw, actor) {
  return {
    gameId: raw.game ?? null,
    gamestate: raw.gamestate ?? null,
    isDev: actor.isDev === true,
    discordId: actor.discordId,
  };
}

async function run(input, deps = defaultDeps) {
  const { models, utils } = deps;

  if (!input.isDev) {
    return {
      ok: false,
      reason: REJECTIONS.NOT_DEV,
      data: { message: 'You must be a dev to use this command!' },
    };
  }

  const changes = await utils.setGameState(input.gameId, input.gamestate, {
    gameActive: input.gamestate === GAMESTATES.ACTIVE,
    db: models,
  });
  if (!changes) {
    return { ok: false, reason: REJECTIONS.NO_SUCH_GAME, data: { gameId: input.gameId } };
  }

  return {
    ok: true,
    kind: 'gamestateChanged',
    data: { gameId: input.gameId, gamestate: changes.GAME_STATE, gameActive: changes.gameActive },
  };
}

function present(result) {
  if (!result.ok) return { content: messageFor(result.reason, result.data) };
  const d = result.data;
  const clock = d.gameActive ? 'AP is being distributed' : 'the clock is stopped';
  return { content: `Game ${d.gameId} has been changed to ${d.gamestate}! (${clock})` };
}

module.exports = { parse, run, present };
