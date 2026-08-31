/**
 * /grid_dev - dev-only: render any game's layer and DM the image to the dev.
 *
 * parse/run/present per TESTING.md Part 1. run() takes plain data and a deps
 * bundle and returns a CommandResult; it never sees an interaction. The
 * process.env.DEV_ID gate stays in the adapter and arrives here as
 * input.isDev (Part 1, order-of-work item 6).
 *
 * Ported with no behaviour change to the rendering path. What moved:
 * - the per-command try/catch is gone; events/interactionCreate.js is the
 *   single error handler (TESTING.md Part 1, an accepted change: the old
 *   `Error: ${error.message}` reply becomes the central handler's message)
 * - the AttachmentBuilder is gone; present() returns a plain file descriptor
 *   and commands/_adapter.js toDiscord() builds the attachment
 *
 * Preserved as-is:
 * - both options are declared as STRINGS, so the game id and the layer id
 *   reach utils.GenerateGameGridImage as strings, exactly as before
 * - GenerateGameGridImage is called with two arguments only. The third
 *   (playerID) stays absent, which is what gives the dev full trap/all-layer
 *   sight inside that helper
 * - there is no gamestate gate and no player lookup: the dev renders any
 *   layer of any game in any state, exactly as before
 * - a non-dev caller is still turned away before anything is rendered; the
 *   adapter returns silently for them (see grid_dev.js), so the NOT_DEV
 *   result here is the defence-in-depth path for any other caller of run()
 */
const { REJECTIONS } = require('../../enums.js');
const { messageFor } = require('../_messages.js');
const defaultDeps = require('../_deps.js');

function parse(raw, actor) {
  return {
    gameId: raw.game ?? null,
    layerId: raw.layer ?? null,
    isDev: actor.isDev === true,
    discordId: actor.discordId,
  };
}

async function run(input, deps = defaultDeps) {
  const { utils } = deps;

  if (!input.isDev) return { ok: false, reason: REJECTIONS.NOT_DEV };

  // two arguments only - see the header note on playerID
  const buffer = await utils.GenerateGameGridImage(input.gameId, input.layerId);

  return {
    ok: true,
    kind: 'grid',
    data: { buffer, gameId: input.gameId, layerId: input.layerId },
  };
}

function present(result) {
  if (!result.ok) return { content: messageFor(result.reason, result.data) };
  return { files: [{ buffer: result.data.buffer, name: 'grid.png' }] };
}

module.exports = { parse, run, present };
