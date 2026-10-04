/**
 * /upgrade - spend AP to raise your health, damage or range by a number of
 * steps, each step costing more than the last.
 *
 * parse/run/present per TESTING.md Part 1. run() takes plain data and a deps
 * bundle and returns a CommandResult; it never sees an interaction.
 *
 * The rules:
 * - the price comes from utils.upgradePrice, over the cost ladders in
 *   utils.upgradeLadders (HP/RANGE 4,5,7,10 - DAMAGE 12,14,16); a cost column
 *   off its ladder throws
 * - the cost ladder advances exactly ONE step per command, however many
 *   steps were bought, and stops at the top of the ladder
 * - buying for body 2 checks the BODY 1 stat against the max, and pays out
 *   of the shared Action_Points / cost columns
 * - the default-game lookup is getOldestActiveGameId (not getOldestGameId)
 * - rejection order: price ladder, dead, gamestate, AP, stat cap
 * - the upgrade is applied directly, with no confirmation prompt
 */
const { REJECTIONS } = require('../../enums.js');
const { messageFor } = require('../_messages.js');
const defaultDeps = require('../_deps.js');

const STATS = {
  Health_Points: {
    costColumn: 'HP_COST',
    column: 'Health_Points',
    column2: 'Health_Points2',
    maxColumn: 'MAX_HP',
    costError: 'Incorrect initial range and/or health cost for player',
    label: 'health',
    capSeparator: ' ',
  },
  Range_: {
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
    costColumn: 'DAMAGE_COST',
    column: 'Damage',
    column2: 'Damage2',
    maxColumn: 'MAX_DAMAGE',
    costError: 'Incorrect initial damage cost for player',
    label: 'damage',
    capSeparator: '',
  },
};

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
  const badAmount = deps.utils.amountRejection(input.amount);
  if (badAmount) return badAmount;

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

  const ladder = utils.upgradeLadders[input.stat];
  const buyIndex = ladder.indexOf(player[spec.costColumn]);
  if (buyIndex === -1) throw new Error(spec.costError);

  const price = utils.upgradePrice(input.stat, buyIndex, input.amount);

  if (player.Dead) return { ok: false, reason: REJECTIONS.PLAYER_DEAD };

  // a Clockwatcher acts through a timestop
  const verdict = utils.checkGameState(
    game, await utils.isClockwatcher(models, player),
  );
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
  const topOfLadder = ladder[ladder.length - 1];
  const nextCost = buyIndex === ladder.length - 1 ? topOfLadder : ladder[buyIndex + 1];

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
