/**
 * /upgrade - spend AP to raise your health, damage or range by a number of
 * steps, each step costing more than the last.
 *
 * parse/run/present per TESTING.md Part 1. run() takes plain data and a deps
 * bundle and returns a CommandResult; it never sees an interaction.
 *
 * Ported from the old execute with these fixes, every one of which was a
 * crash or an unreachable write before (the old catch turned the first of
 * them into "There was an error while executing this command!" on EVERY
 * invocation, so nothing below it ever ran):
 * - the three `logger.debug(...)` calls referenced an undefined `logger`
 *   (the file only ever defined `logger200`), so /upgrade threw
 *   ReferenceError before touching the player. The logging is dropped.
 * - a missing game now returns NO_SUCH_GAME instead of crashing on
 *   game.GAME_STATE, and a missing player NOT_IN_GAME instead of crashing
 *   on player.Player_ID
 * - utils.getUpgradePrice computes a price into `returnedCost` and never
 *   returns it, so `price` was always undefined: the AP check
 *   (`player.Action_Points < price`) could never be true and the
 *   confirmation label read "for undefined AP". The pricing switch it
 *   describes is reproduced here (still over utils' own
 *   getHPAndRangePriceScaled / getDamagePriceScaled, so the scaling maths
 *   is unchanged), and the price is actually used.
 * - that same helper guarded its whole damage branch with
 *   `initalCost == 12`, making the cost-14 and cost-16 cases unreachable,
 *   and called `getDamagePriceScaled` as a bare identifier (a
 *   ReferenceError - it is a method on the utils object). Damage now prices
 *   at every step.
 * - the confirmation flow could never confirm anything: `ButtonBuilder` and
 *   `ButtonStyle` were never imported and `response` was never assigned, so
 *   building the buttons threw and the inner catch always replied
 *   "Confirmation not received within 1 minute, cancelling..." - every
 *   upgrade write was dead code. The upgrade is now applied directly, which
 *   is the behaviour the writes were written for. There is no button
 *   prompt: a logic layer cannot own an interaction component collector.
 *
 * Preserved as-is (see the pinning tests):
 * - the gamestate gate passes isClockwatcher=false unconditionally, exactly
 *   like the old checkGameStateAndReply(gamestate, false, interaction) call,
 *   so a Clockwatcher cannot upgrade during a timestop
 * - a cost column outside its ladder (HP/RANGE 4,5,7,10 - DAMAGE 12,14,16)
 *   throws, as both the old price helper and the old buy-index switch did
 * - the cost ladder advances exactly ONE step per command, however many
 *   steps were bought, and stops at the top of the ladder
 * - buying for body 2 checks the BODY 1 stat against the max, and pays out
 *   of the shared Action_Points / cost columns
 * - the default-game lookup is getOldestActiveGameId (not getOldestGameId)
 * - rejection order: price ladder, dead, gamestate, AP, stat cap
 */
const { REJECTIONS } = require('../../enums.js');
const { messageFor } = require('../_messages.js');
const defaultDeps = require('../_deps.js');

// the two cost ladders, copied from the old rangeAndHpCostArray /
// damageCostArray
const HP_AND_RANGE_COSTS = [4, 5, 7, 10];
const DAMAGE_COSTS = [12, 14, 16];

const STATS = {
  Health_Points: {
    costs: HP_AND_RANGE_COSTS,
    costColumn: 'HP_COST',
    column: 'Health_Points',
    column2: 'Health_Points2',
    maxColumn: 'MAX_HP',
    costError: 'Incorrect initial range and/or health cost for player',
    label: 'health',
    capSeparator: ' ',
  },
  Range_: {
    costs: HP_AND_RANGE_COSTS,
    costColumn: 'RANGE_COST',
    column: 'Range_',
    column2: 'Range2',
    maxColumn: 'MAX_RANGE',
    costError: 'Incorrect initial range and/or health cost for player',
    label: 'range',
    // the old message had no space before the number here; kept byte-identical
    capSeparator: '',
  },
  Damage: {
    costs: DAMAGE_COSTS,
    costColumn: 'DAMAGE_COST',
    column: 'Damage',
    column2: 'Damage2',
    maxColumn: 'MAX_DAMAGE',
    costError: 'Incorrect initial damage cost for player',
    label: 'damage',
    capSeparator: '',
  },
};

/**
 * The price of `amount` further steps for a player who is `buyIndex` steps
 * up the ladder. This is the switch from utils.getUpgradePrice: pay the
 * running total for (buyIndex + amount) steps, less what the earlier steps
 * would have cost. The scaling itself still comes from utils.
 */
function priceFor(utils, stat, buyIndex, amount) {
  const { costs } = STATS[stat];
  const alreadyPaid = costs.slice(0, buyIndex).reduce((sum, c) => sum + c, 0);
  const scaled = stat === 'Damage'
    ? utils.getDamagePriceScaled(amount + buyIndex)
    : utils.getHPAndRangePriceScaled(amount + buyIndex);
  return scaled - alreadyPaid;
}

function parse(raw, actor) {
  return {
    stat: raw.stat,
    amount: raw.amount ?? 1,
    gameId: raw.game ?? null,
    body: raw.body === 2 ? 2 : 1,
    discordId: actor.discordId,
  };
}

async function run(input, deps = defaultDeps) {
  const { models, utils } = deps;

  const gameId = input.gameId ?? await utils.getOldestActiveGameId(input.discordId);
  const game = await models.Games.findByPk(gameId);
  if (!game) return { ok: false, reason: REJECTIONS.NO_SUCH_GAME, data: { gameId } };

  const player = await models.Players.findOne({ where: { Game_ID: gameId, Discord_ID: input.discordId } });
  if (!player) return { ok: false, reason: REJECTIONS.NOT_IN_GAME };

  const spec = STATS[input.stat];
  // the slash command constrains stat to the three choices; anything else is
  // a fault, not a player mistake
  if (!spec) throw new Error('Unknown stat to upgrade: ' + input.stat);

  const buyIndex = spec.costs.indexOf(player[spec.costColumn]);
  if (buyIndex === -1) throw new Error(spec.costError);

  const price = priceFor(utils, input.stat, buyIndex, input.amount);

  if (player.Dead) return { ok: false, reason: REJECTIONS.PLAYER_DEAD };

  // the old code hard-coded isClockwatcher=false here; keep it
  const verdict = utils.checkGameState(game.GAME_STATE, false);
  if (verdict.blocked) return { ok: false, reason: verdict.reason };

  if (player.Action_Points < price) {
    return {
      ok: false,
      reason: REJECTIONS.NOT_ENOUGH_AP,
      data: { message: "You don't have enough AP to upgrade that much!\n You need " + (price - player.Action_Points) + " more AP." },
    };
  }

  // the cap check reads the body-1 stat whichever body is being bought,
  // exactly as before
  if (player[spec.column] + input.amount > player[spec.maxColumn]) {
    return {
      ok: false,
      reason: REJECTIONS.INVALID_AMOUNT,
      data: { message: "You can't upgrade your " + spec.label + ' past' + spec.capSeparator + player[spec.maxColumn] + '! Unless you kill some people :)' },
    };
  }

  const statColumn = input.body === 1 ? spec.column : spec.column2;
  const topOfLadder = spec.costs[spec.costs.length - 1];
  const nextCost = buyIndex === spec.costs.length - 1 ? topOfLadder : spec.costs[buyIndex + 1];

  await models.Players.update(
    { Action_Points: player.Action_Points - price },
    { where: { Player_ID: player.Player_ID } },
  );
  await models.Players.update(
    { [statColumn]: player[statColumn] + input.amount },
    { where: { Player_ID: player.Player_ID } },
  );
  await models.Players.update(
    { [spec.costColumn]: nextCost },
    { where: { Player_ID: player.Player_ID } },
  );

  return {
    ok: true,
    kind: 'upgraded',
    data: {
      stat: input.stat,
      amount: input.amount,
      price,
      body: input.body,
      statColumn,
      newCost: nextCost,
      playerId: player.Player_ID,
    },
  };
}

function present(result) {
  if (!result.ok) return { content: messageFor(result.reason, result.data) };
  const d = result.data;
  return { content: 'Successfully upgraded ' + d.stat + ' by ' + d.amount + ' for ' + d.price + ' AP!' };
}

module.exports = { parse, run, present };
