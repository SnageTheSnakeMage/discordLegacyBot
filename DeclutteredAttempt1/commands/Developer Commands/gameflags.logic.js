/**
 * /gameflags - the four Games booleans that are conditions on a game rather
 * than points in its life. GAMESTATES holds the life (/change-gamestate);
 * everything here can be true or false independently of it and of each other.
 *
 * parse/run/present per TESTING.md Part 1. run() takes plain data and a deps
 * bundle and returns a CommandResult; it never sees an interaction.
 *
 * Three subcommands, one logic file, dispatching on input.subcommand the way
 * sandbox.logic.js does:
 *
 * - `set` is the dev's, and reaches any game and any flag.
 * - `sandbox` is for a player testing in a sandbox game: the same switches,
 *   limited to a game that has the sandbox flag and that they are registered
 *   in, and it cannot touch `sandbox` itself - turning that off would hand
 *   them a live game, and turning it on elsewhere would make one.
 * - `show` reads, so it is open to anyone and takes no flag.
 *
 * gameActive is written through utils.setGameState rather than directly,
 * because the clock and the gamestate have to agree: a game in REGISTRATION or
 * OVER cannot have a running clock, and starting the clock resets the AP
 * timestamp so a game is not paid for the time it spent stopped.
 */
const { GAMESTATES, GAME_FLAGS, REJECTIONS } = require('../../enums.js');
const { messageFor } = require('../_messages.js');
const defaultDeps = require('../_deps.js');

// The flags a player may set on their own sandbox game. `sandbox` is absent on
// purpose - see the header.
const PLAYER_SETTABLE_FLAGS = Object.freeze([
  GAME_FLAGS.gameActive, GAME_FLAGS.timeStopped, GAME_FLAGS.finale,
]);

function parse(raw, actor) {
  return {
    subcommand: raw.subcommand ?? null,
    flag: raw.flag ?? null,
    // a boolean option arrives as a real boolean; null means it was omitted
    value: raw.value ?? null,
    gameId: raw.game ?? null,
    isDev: actor.isDev === true,
    discordId: actor.discordId,
  };
}

/**
 * The game to act on. An explicit id wins; otherwise the oldest game being
 * played, which is what a dev running this without an id means.
 *
 * Resolved here rather than with utils.getOldestActiveGameId because that
 * helper answers `games.length` when it finds nothing - a game id of 0 for an
 * empty database - and "there is no such game" should be a rejection.
 */
async function resolveGame(input, models) {
  if (input.gameId != null) {
    const game = await models.Games.findByPk(input.gameId);
    if (!game) return { ok: false, reason: REJECTIONS.NO_SUCH_GAME, data: { gameId: input.gameId } };
    return { ok: true, game };
  }
  const playing = await models.Games.findAll({ where: { GAME_STATE: GAMESTATES.ACTIVE } });
  if (playing.length === 0) {
    return {
      ok: false,
      reason: REJECTIONS.NO_SUCH_GAME,
      data: { message: 'No game is being played, so there is none to default to. Pass a game id.' },
    };
  }
  return { ok: true, game: playing.reduce((a, b) => (a.Game_ID <= b.Game_ID ? a : b)) };
}

/** Every flag on a game, for `show` and for the reply after a `set`. */
function flagsOf(game) {
  return {
    gameActive: !!game.gameActive,
    timeStopped: !!game.timeStopped,
    finale: !!game.finale,
    sandbox: !!game.sandbox,
  };
}

async function writeFlag(game, flag, value, deps) {
  const { models, utils } = deps;
  if (flag === GAME_FLAGS.gameActive) {
    // the clock is the one flag the gamestate has a say in
    if (value && game.GAME_STATE !== GAMESTATES.ACTIVE && game.GAME_STATE !== GAMESTATES.DEV_PAUSED) {
      return {
        ok: false,
        reason: REJECTIONS.CLOCK_NOT_ALLOWED,
        data: { gameId: game.Game_ID, gamestate: game.GAME_STATE },
      };
    }
    await utils.setGameState(game.Game_ID, null, { gameActive: value, db: models });
  } else {
    await models.Games.update({ [flag]: value }, { where: { Game_ID: game.Game_ID } });
  }
  const after = await models.Games.findByPk(game.Game_ID);
  return {
    ok: true,
    kind: 'flagSet',
    data: {
      gameId: game.Game_ID, flag, value: !!value,
      gamestate: after.GAME_STATE, flags: flagsOf(after),
    },
  };
}

async function run(input, deps = defaultDeps) {
  const { models } = deps;

  if (input.subcommand === 'set' && !input.isDev) {
    return { ok: false, reason: REJECTIONS.NOT_DEV };
  }

  const resolved = await resolveGame(input, models);
  if (!resolved.ok) return resolved;
  const game = resolved.game;

  if (input.subcommand === 'show') {
    return {
      ok: true,
      kind: 'flagList',
      data: { gameId: game.Game_ID, gamestate: game.GAME_STATE, flags: flagsOf(game) },
    };
  }

  if (input.subcommand === 'sandbox') {
    if (!game.sandbox) {
      return { ok: false, reason: REJECTIONS.NOT_SANDBOX, data: { gameId: game.Game_ID } };
    }
    // a sandbox game is still someone's game: only its own players get to
    // move its clock around
    const player = await models.Players.findOne({
      where: { Game_ID: game.Game_ID, Discord_ID: input.discordId },
    });
    if (!player) return { ok: false, reason: REJECTIONS.NOT_IN_GAME, data: { gameId: game.Game_ID } };
    if (!PLAYER_SETTABLE_FLAGS.includes(input.flag)) {
      return { ok: false, reason: REJECTIONS.NO_SUCH_FLAG, data: { flag: input.flag } };
    }
    return writeFlag(game, input.flag, input.value === true, deps);
  }

  // `set`: the dev, any flag
  if (!Object.keys(GAME_FLAGS).includes(input.flag)) {
    return { ok: false, reason: REJECTIONS.NO_SUCH_FLAG, data: { flag: input.flag } };
  }
  return writeFlag(game, input.flag, input.value === true, deps);
}

/** "gameActive: on, timeStopped: off, ..." in the enum's order. */
function describeFlags(flags) {
  return Object.keys(GAME_FLAGS).map((flag) => `${flag}: ${flags[flag] ? 'on' : 'off'}`).join(', ');
}

function present(result) {
  if (!result.ok) return { content: messageFor(result.reason, result.data) };
  const d = result.data;
  if (result.kind === 'flagList') {
    return { content: `Game ${d.gameId} is ${d.gamestate} - ${describeFlags(d.flags)}` };
  }
  return {
    content: `Game ${d.gameId}: ${d.flag} is now ${d.value ? 'on' : 'off'}.`
      + `\nIt is ${d.gamestate} - ${describeFlags(d.flags)}`,
  };
}

module.exports = { parse, run, present };
