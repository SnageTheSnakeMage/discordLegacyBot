/**
 * /listgames - list every game with its state, chaos event and winner.
 *
 * parse/run/present per TESTING.md Part 1. Straight port of the old
 * execute: a read-only findAll over Games formatted one block per game.
 * The only thing dropped is the logger200 child logger, which was
 * assigned and never used.
 *
 * Fixed: zero games used to render as the empty string, and Discord
 * refuses to send an empty message, so the command died in the central
 * handler and the player saw "There was an error while executing this
 * command!" instead of "there are no games". It now renders the
 * NO_GAMES notice; the wording lives in _messages.js.
 *
 * Preserved as-is: a null winner renders as the literal text "null" and
 * a chaos event missing from the ChaosEvents enum renders its
 * description as "undefined" (plain string concatenation, as before).
 */
const { ChaosEvents, GAMESTATES } = require('../../enums.js');
const { messageFor, noticeFor } = require('../_messages.js');
const defaultDeps = require('../_deps.js');

/** the gamestate option's escape hatch: every game, unfiltered */
const ALL = 'ALL';

/**
 * /listgames ignores the actor, and takes one option: which gamestate to
 * list. It defaults to REGISTRATION because the usual reason to run this is
 * to find a game to join, and a server that has played a few games otherwise
 * buries those under every finished one.
 */
function parse(raw) {
  return { gamestate: (raw && raw.gamestate) || GAMESTATES.REGISTRATION };
}

async function run(input, deps = defaultDeps) {
  const { models } = deps;
  // filtered in the query rather than after it: there is no reason to read
  // every finished game off disk to throw it away
  const games = input.gamestate === ALL
    ? await models.Games.findAll()
    : await models.Games.findAll({ where: { GAME_STATE: input.gamestate } });
  return {
    ok: true,
    kind: 'gameList',
    data: {
      gamestate: input.gamestate,
      games: games.map((g) => ({
        gameId: g.Game_ID,
        gameState: g.GAME_STATE,
        chaosEvent: g.CURR_CC_EVENT,
        winner: g.winner,
      })),
    },
  };
}

function present(result) {
  if (!result.ok) return { content: messageFor(result.reason, result.data) };
  // Discord will not send an empty message, so an empty list needs words -
  // and which filter produced the empty list is the useful part
  if (result.data.games.length === 0) {
    return { content: noticeFor('NO_GAMES', { gamestate: result.data.gamestate }) };
  }
  let gameList = '';
  for (const g of result.data.games) {
    gameList += 'Game ID:' + g.gameId + ' - Game State: ' + g.gameState
      + '\n Current Chaos Council Event: ' + g.chaosEvent + ' - ' + ChaosEvents[g.chaosEvent]
      + ',\n Winner: ' + g.winner + '\n--------\n';
  }
  return { content: gameList };
}

module.exports = { parse, run, present };
