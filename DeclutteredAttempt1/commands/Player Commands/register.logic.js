/**
 * /register - add a player to a game in its registration phase.
 *
 * parse/run/present per TESTING.md Part 1. run() takes plain data and a
 * deps bundle and returns a CommandResult; it never sees an interaction.
 *
 * Ported from the old execute/validateRegistrationInput flow with
 * these fixes, each of which was a crash or a dead write before (see the
 * conversion commit):
 * - every helper referenced logger200, which was scoped to execute(), so
 *   the default-game path, the not-in-registration path, the game-full
 *   path and the whole already-registered check crashed with
 *   ReferenceError; the loggers are dropped and the written flow restored
 * - a missing game now returns NO_SUCH_GAME instead of crashing on
 *   game.GAME_STATE (the old try/catch only guarded a findByPk throw,
 *   never the null result its "Game not found" message was written for)
 * - handleRegistrationError's cleanup destroy is dropped: it read
 *   `registrationData` out of scope (its where-clause could never be
 *   built) and was gated on `!error.message == "..."`, a comparison that
 *   is never true; the error path itself also crashed on logger200, so
 *   errors already ended at the central handler - registerPlayer faults
 *   now simply throw to events/interactionCreate.js
 *
 * Preserved as-is:
 * - the "game is full" gate compares the player count against
 *   game.playerMax, which is not a Games column, so against the real
 *   schema it never fires (count >= undefined is false)
 * - the default game is the oldest REGISTRATION game across ALL players
 *   (the old code passed null for the actor, not their id)
 * - a fault while looking up an existing registration counts as "not
 *   registered" and registration proceeds
 */
const { GAMESTATES, REJECTIONS } = require('../../enums.js');
const { messageFor } = require('../_messages.js');
const defaultDeps = require('../_deps.js');

/**
 * #144: the icon used to have to be exactly 80x80 and exactly a PNG. The
 * renderer scales whatever it is given into a quadrant of a tile, so the size
 * never mattered - only the shape, because a non-square icon is what comes
 * out stretched. Any square image is fine.
 *
 * FORMATS is not "any image/*", which is the one thing the issue's wording
 * would allow and the renderer cannot: node-canvas here is built against
 * libpng and libjpeg only (see the Dockerfile's apk line), so a WebP or an
 * AVIF would upload happily, fail to decode, and fall back to default.png -
 * a player with no face and no error. An icon that cannot be drawn is
 * refused at registration instead, while it can still be explained.
 */
const ICON_REQUIREMENTS = {
  FORMATS: ['image/png', 'image/jpeg'],
};

function parse(raw, actor) {
  return {
    gameId: raw.game ?? null,
    // plain data: { contentType, width, height, url } - never a discord.js
    // Attachment (registerPlayer only reads .url)
    icon: raw.icon ?? null,
    discordId: actor.discordId,
  };
}

async function run(input, deps = defaultDeps) {
  const { models, utils } = deps;

  const gameId = input.gameId
    ?? await utils.getOldestGamestateGameId(null, GAMESTATES.REGISTRATION);

  const game = await models.Games.findByPk(gameId);
  if (!game) {
    return { ok: false, reason: REJECTIONS.NO_SUCH_GAME, data: { gameId, message: 'Game not found. Please check the game ID.' } };
  }

  if (game.GAME_STATE !== GAMESTATES.REGISTRATION) {
    return { ok: false, reason: REJECTIONS.GAME_NOT_IN_REGISTRATION, data: { message: 'Cannot register for games not in registration phase.' } };
  }

  // preserved quirk: playerMax is not a Games column, so this is inert
  // against the real schema (count >= undefined is false)
  if (await models.Players.count({ where: { Game_ID: gameId } }) >= game.playerMax) {
    return { ok: false, reason: REJECTIONS.TILE_FULL, data: { message: 'Game is full. Please try another game.' } };
  }

  const icon = input.icon;
  if (!ICON_REQUIREMENTS.FORMATS.includes(icon.contentType)) {
    return { ok: false, reason: REJECTIONS.WRONG_TILE_TYPE, data: { message: 'The file is a ' + icon.contentType + ' file. Player icon must be a PNG or JPEG image' } };
  }
  if (icon.width !== icon.height) {
    return { ok: false, reason: REJECTIONS.INVALID_AMOUNT, data: { message: `Player icon must be square - that one is ${icon.width}x${icon.height}. Any size is fine, it gets scaled to the tile.` } };
  }

  let existingPlayer;
  try {
    existingPlayer = await models.Players.findOne({
      where: { Game_ID: gameId, Discord_ID: input.discordId },
    });
  } catch {
    // legacy: a lookup fault counts as "not registered"
    existingPlayer = null;
  }
  if (existingPlayer) {
    return { ok: false, reason: REJECTIONS.ALREADY_REGISTERED, data: { message: 'You are already registered in this game' } };
  }

  // faults in here (Twin spawn collision, download failure, DB errors)
  // throw to the central handler
  await utils.registerPlayer(gameId, input.discordId, icon);

  return { ok: true, kind: 'registered', data: { gameId } };
}

function present(result) {
  if (!result.ok) return { content: messageFor(result.reason, result.data) };
  return { content: 'Player registered! Use the stats command to see where you are, your class, and your stats' };
}

module.exports = { parse, run, present };
