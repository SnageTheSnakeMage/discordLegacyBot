/**
 * /cook - Chef class command: give a player in range 2 AP & 1 HP for one of
 * your meals, and receive 1 AP yourself.
 *
 * parse/run/present per TESTING.md Part 1. run() takes plain data and a
 * deps bundle and returns a CommandResult; it never sees an interaction.
 *
 * Ported from the old execute with these fixes, each of which was a crash
 * or an always-wrong comparison before (see the conversion commit):
 * - the old code read game.GAME_STATE but never defined `game`, so EVERY
 *   /cook invocation threw a ReferenceError; the game is now loaded (and a
 *   missing game returns NO_SUCH_GAME instead of crashing later)
 * - the class gate compared player.Class, a column that does not exist on
 *   Players (always undefined, so even real Chefs were told "You are not a
 *   Chef!"); it now loads the Classes row and compares Class_Name
 * - the customer/player null checks ran AFTER dereferencing the rows
 *   (customer.Tile_ID / player.Tile_ID), so a missing row crashed before
 *   its own check; the checks now run before the dereferences
 * - coordinates off the board made customersTile null and crashed on
 *   customersTile.Tile_ID; that is now a NO_SUCH_TILE rejection
 *
 * Preserved as-is (see the pinning tests):
 * - the gamestate gate passes isClockwatcher=false unconditionally, exactly
 *   like the old checkGameStateAndReply(gamestate, false, interaction) call
 * - no Dead check: a dead Chef can still cook, and a dead customer can
 *   still be cooked for
 * - the customer's +2 AP and +1 HP are NOT clamped to MAX_AP/MAX_HP, and
 *   neither is the chef's +1 AP
 * - the default game comes from getOldestGameId() with NO discord id, as
 *   the old code called it
 * - rejection order: gamestate, class, missing tile, customer-on-tile,
 *   range, meals (the null checks moved ahead of it as crash fixes)
 */
const { REJECTIONS } = require('../../enums.js');
const { messageFor } = require('../_messages.js');
const defaultDeps = require('../_deps.js');

function parse(raw, actor) {
  return {
    customerDiscordId: raw.customer,
    customerUsername: raw.customerUsername,
    x: raw.x,
    y: raw.y,
    gameId: raw.game ?? null,
    discordId: actor.discordId,
  };
}

async function run(input, deps = defaultDeps) {
  const { models, utils } = deps;

  // the old code called getOldestGameId() with no argument; keep that
  const gameId = input.gameId ?? await utils.getOldestGameId();
  const game = await models.Games.findByPk(gameId);
  if (!game) return { ok: false, reason: REJECTIONS.NO_SUCH_GAME, data: { gameId } };

  const player = await models.Players.findOne({ where: { Game_ID: gameId, Discord_ID: input.discordId } });
  if (!player) {
    return { ok: false, reason: REJECTIONS.NOT_IN_GAME, data: { message: 'You are not in the game!' } };
  }

  const customer = await models.Players.findOne({ where: { Game_ID: gameId, Discord_ID: input.customerDiscordId } });
  if (!customer) {
    return { ok: false, reason: REJECTIONS.TARGET_NOT_IN_GAME, data: { role: 'customer' } };
  }

  const playersTile = await models.Tiles.findByPk(player.Tile_ID);
  const customersTile = await models.Tiles.findOne({
    where: { Layer_ID: playersTile.Layer_ID, X_Position: input.x, Y_Position: input.y },
  });

  // the old code hard-coded isClockwatcher=false here; keep that
  // a Clockwatcher acts through a timestop. Every call site used to
  // hard-code false here, so the class's whole ability did nothing.
  const verdict = utils.checkGameState(
    game.GAME_STATE, await utils.isClockwatcher(models, player),
  );
  if (verdict.blocked) return { ok: false, reason: verdict.reason };

  const playerClass = await models.Classes.findByPk(player.Class_ID);
  if (!playerClass || playerClass.Class_Name !== 'Chef') {
    return { ok: false, reason: REJECTIONS.WRONG_CLASS, data: { className: 'Chef' } };
  }

  if (!customersTile) {
    return { ok: false, reason: REJECTIONS.NO_SUCH_TILE };
  }

  if (customer.Tile_ID !== customersTile.Tile_ID) {
    return { ok: false, reason: REJECTIONS.TARGET_NOT_ON_TILE, data: { role: 'customer' } };
  }

  const tileInRange = utils.getTileCordinatesOfLine(
    [playersTile.X_Position, playersTile.Y_Position],
    [customersTile.X_Position, customersTile.Y_Position],
  ).length <= player.Range_;
  if (!tileInRange) {
    return { ok: false, reason: REJECTIONS.OUT_OF_RANGE, data: { role: 'customer' } };
  }

  if (player.Meals <= 0) {
    return { ok: false, reason: REJECTIONS.NOT_ENOUGH_MEALS };
  }

  // give the customer the AP & HP (unclamped, as before)
  await models.Players.update(
    deps.utils.apGain(customer, 2),
    { where: { Player_ID: customer.Player_ID } },
  );
  await models.Players.update(
    deps.utils.hpGain(customer, 1),
    { where: { Player_ID: customer.Player_ID } },
  );

  // give the chef the AP and consume the meal
  await models.Players.update(
    { ...deps.utils.apGain(player, 1), Meals: player.Meals - 1 },
    { where: { Player_ID: player.Player_ID } },
  );

  return {
    ok: true,
    kind: 'cooked',
    data: { customerUsername: input.customerUsername },
  };
}

function present(result) {
  if (!result.ok) return { content: messageFor(result.reason, result.data) };
  return { content: 'You have cooked for ' + result.data.customerUsername + ' giving them 2 AP & 1 HP and yourself 1 AP!' };
}

module.exports = { parse, run, present };
