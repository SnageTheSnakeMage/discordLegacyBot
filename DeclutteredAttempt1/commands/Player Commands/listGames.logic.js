/**
 * /listgames - list every game with its state, chaos event and winner.
 *
 * parse/run/present per TESTING.md Part 1. Straight port of the old
 * execute: a read-only findAll over Games formatted one block per game.
 * The only thing dropped is the logger200 child logger, which was
 * assigned and never used.
 *
 * Preserved as-is: with zero games the reply content is the empty
 * string; a null winner renders as the literal text "null" and a chaos
 * event missing from the ChaosEvents enum renders its description as
 * "undefined" (plain string concatenation, exactly as before).
 */
const { ChaosEvents } = require('../../enums.js');
const { messageFor } = require('../_messages.js');
const defaultDeps = require('../_deps.js');

// /listgames takes no options and ignores the actor
function parse() {
  return {};
}

async function run(_input, deps = defaultDeps) {
  const { models } = deps;
  const games = await models.Games.findAll();
  return {
    ok: true,
    kind: 'gameList',
    data: {
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
  let gameList = '';
  for (const g of result.data.games) {
    gameList += 'Game ID:' + g.gameId + ' - Game State: ' + g.gameState
      + '\n Current Chaos Council Event: ' + g.chaosEvent + ' - ' + ChaosEvents[g.chaosEvent]
      + ',\n Winner: ' + g.winner + '\n--------\n';
  }
  return { content: gameList };
}

module.exports = { parse, run, present };
