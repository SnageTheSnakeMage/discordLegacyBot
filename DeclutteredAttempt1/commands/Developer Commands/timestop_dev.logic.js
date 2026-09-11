/**
 * /timestop-dev - dev-only: toggle a game between DEV_PAUSED and ACTIVE.
 *
 * parse/run/present per TESTING.md Part 1. run() takes plain data and a deps
 * bundle and returns a CommandResult; it never sees an interaction. The
 * process.env.DEV_ID gate stays in the adapter and arrives here as
 * input.isDev (Part 1, order-of-work item 6).
 *
 * Ported from the old execute with these fixes, each of which was a crash or
 * an impossible read before (see the conversion commit):
 * - the pause/unpause branch read `models.Games.findByPk(gameID).GAME_STATE`
 *   off the *unawaited* promise (always undefined) and compared it to a bare
 *   `GAMESTATES`, which this file never required - so every single
 *   invocation threw a ReferenceError before anything was written. The row
 *   is awaited and enums.js is imported, which is what makes the toggle the
 *   old code obviously intended actually happen.
 * - the unpause branch also wrote `GAMESTATES.ACTIVE` from that same
 *   undefined binding; the pause branch used `utils.GAMESTATES.DEV_PAUSED`,
 *   which does resolve. Both now write the same values from enums.js.
 * - the default-game fallback called `utils.getOldestActiveGame()`, which
 *   does not exist (TypeError whenever the game option was absent), and then
 *   read `.Game_ID` off its result; the port resolves the id through
 *   utils.getOldestActiveGameId() and rejects with NO_SUCH_GAME when no game
 *   row can be found, instead of dereferencing null.
 *
 * Preserved as-is (see the pinning tests):
 * - the fallback is called with NO player id, exactly as the old
 *   `getOldestActiveGame()` call was: this is a dev command, so the oldest
 *   active game overall is used, not the oldest one the caller is in.
 * - despite the name, the command pauses (DEV_PAUSED), it does not TIMESTOP.
 * - there is no gamestate gate and no player lookup: the dev pauses a game in
 *   any state, and any state other than DEV_PAUSED becomes DEV_PAUSED - so
 *   pausing an OVER or REGISTRATION game is allowed, exactly as before.
 */
const { GAMESTATES, REJECTIONS } = require('../../enums.js');
const { messageFor } = require('../_messages.js');
const defaultDeps = require('../_deps.js');

function parse(raw, actor) {
  return {
    gameId: raw.game ?? null,
    isDev: actor.isDev === true,
    discordId: actor.discordId,
  };
}

async function run(input, deps = defaultDeps) {
  const { models, utils } = deps;

  if (!input.isDev) return { ok: false, reason: REJECTIONS.NOT_DEV };

  // no player id: the old fallback was the game-wide getOldestActiveGame()
  const gameId = input.gameId ?? await utils.getOldestActiveGameId();
  const game = await models.Games.findByPk(gameId);
  if (!game) return { ok: false, reason: REJECTIONS.NO_SUCH_GAME, data: { gameId } };

  if (game.GAME_STATE === GAMESTATES.DEV_PAUSED) {
    await models.Games.update(
      { GAME_STATE: GAMESTATES.ACTIVE },
      { where: { Game_ID: gameId } },
    );
    return { ok: true, kind: 'unpaused', data: { gameId } };
  }

  await models.Games.update(
    { GAME_STATE: GAMESTATES.DEV_PAUSED },
    { where: { Game_ID: gameId } },
  );
  return { ok: true, kind: 'paused', data: { gameId } };
}

function present(result) {
  if (!result.ok) return { content: messageFor(result.reason, result.data) };
  if (result.kind === 'unpaused') return { content: `Game ${result.data.gameId} is unpaused!` };
  return { content: `Game ${result.data.gameId} has been paused!` };
}

module.exports = { parse, run, present };
