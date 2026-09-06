/**
 * /change-gamestate - dev-only: set a game's GAME_STATE.
 *
 * parse/run/present per TESTING.md Part 1. run() takes plain data and a deps
 * bundle and returns a CommandResult; it never sees an interaction. The
 * process.env.DEV_ID gate stays in the adapter and arrives here as
 * input.isDev (Part 1, order-of-work item 6).
 *
 * Ported from the old execute with one fix, which was a dead write before:
 * - the update wrote `GAMESTATES.gamestateNonEnum` - a literal property
 *   lookup of a key that does not exist on the enum - so every invocation
 *   wrote GAME_STATE: undefined (a not-null column) while still replying
 *   "has been changed to X!". The selected value is now written.
 *
 * Preserved as-is:
 * - the value is written verbatim, exactly as the option's choice list
 *   supplies it. The "Finished" choice's value is the mixed-case 'Inactive',
 *   which is NOT GAMESTATES.INACTIVE; the choice list lives in the command's
 *   `data` and is out of scope for this conversion, so 'Inactive' is written
 *   as given.
 * - no existence check on the game: updating a Game_ID that matches no row
 *   still reports success, exactly as the old .then(...) reply did.
 */
const { REJECTIONS } = require('../../enums.js');
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
  const { models } = deps;

  if (!input.isDev) {
    return {
      ok: false,
      reason: REJECTIONS.NOT_DEV,
      data: { message: 'You must be a dev to use this command!' },
    };
  }

  await models.Games.update(
    { GAME_STATE: input.gamestate },
    { where: { Game_ID: input.gameId } },
  );

  return {
    ok: true,
    kind: 'gamestateChanged',
    data: { gameId: input.gameId, gamestate: input.gamestate },
  };
}

function present(result) {
  if (!result.ok) return { content: messageFor(result.reason, result.data) };
  const d = result.data;
  return { content: `Game ${d.gameId} has been changed to ${d.gamestate}!` };
}

module.exports = { parse, run, present };
