/**
 * /create-game - dev-only. Inserts one Games row in the REGISTRATION state,
 * every column taken from an option or its legacy default.
 *
 * parse/run/present per TESTING.md Part 1. run() takes plain data and a deps
 * bundle and returns a CommandResult; it never sees an interaction.
 *
 * Ported straight across - the old execute had no crash, no dead write and no
 * impossible comparison, so nothing here is a behaviour change. The dev gate
 * stays in the adapter (it returns silently for non-devs, exactly as before)
 * and arrives here as input.isDev, so the gate is also a testable rejection.
 *
 * Preserved as-is:
 * - `chaos-council-boolean` is declared as an INTEGER option but defaults to
 *   the boolean `true`, so an omitted option writes `true` while a supplied
 *   one writes a number. Odd, but that is what shipped.
 * - `current-chaos-council-event` is documented as "defaults to null" and
 *   actually defaults to the string "BOOOORRRINNNG".
 * - the confirmation number is `Games.count()` taken after the insert, i.e.
 *   the number of games that exist, not the new row's Game_ID.
 */
const { GAMESTATES, REJECTIONS } = require('../../enums.js');
const { messageFor } = require('../_messages.js');
const defaultDeps = require('../_deps.js');

function parse(raw, actor) {
  return {
    apDistributionInterval: raw['ap-distribution-interval'] ?? 720,
    chestAmount: raw['chest-amount'] ?? 0,
    currentChaosCouncilEvent: raw['current-chaos-council-event'] ?? 'BOOOORRRINNNG',
    movementCost: raw['movement-cost'] ?? 1,
    shootCost: raw['shoot-cost'] ?? 2,
    fireDamage: raw['fire-damage'] ?? 1,
    mineDamage: raw['mine-damage'] ?? 1,
    classBlacklist: raw['class-blacklist'] ?? '',
    chaosCouncilBoolean: raw['chaos-council-boolean'] ?? true,
    classDupeLimit: raw['class-dupe-limit'] ?? 2,
    finalePlayerThreshold: raw['finale-player-threshold'] ?? 4,
    maxStatIncrease: raw['max-stat-increase'] ?? 1,
    apAmount: raw['ap-amount'] ?? 2,
    immutableDoomsday: raw['immutable-doomsday'] ?? 32,
    isDev: raw.isDev === true,
    discordId: actor.discordId,
  };
}

async function run(input, deps = defaultDeps) {
  const { models } = deps;

  if (!input.isDev) return { ok: false, reason: REJECTIONS.NOT_DEV };

  await models.Games.create({
    GAME_STATE: GAMESTATES.REGISTRATION,
    AP_INTERVAL_MIN: input.apDistributionInterval,
    CHEST_AMOUNT: input.chestAmount,
    LAST_CHEST_GIVER: null,
    CURR_CC_EVENT: input.currentChaosCouncilEvent,
    moveCost: input.movementCost,
    shootCost: input.shootCost,
    fireDmg: input.fireDamage,
    mineDmg: input.mineDamage,
    classBlacklist: input.classBlacklist,
    classDupelicateMax: input.classDupeLimit,
    maxIncreaseOnKill: input.maxStatIncrease,
    chaosCouncilBool: input.chaosCouncilBoolean,
    winner: null,
    finaleThreshold: input.finalePlayerThreshold,
    APAmount: input.apAmount,
    immutableDoomsday: input.immutableDoomsday,
  });

  // legacy: the reply counts every game in the table after the insert
  const gameCount = await models.Games.count();
  return { ok: true, kind: 'gameCreated', data: { gameCount } };
}

function present(result) {
  if (!result.ok) return { content: messageFor(result.reason, result.data) };
  return { content: `Game ${result.data.gameCount} created!` };
}

module.exports = { parse, run, present };
