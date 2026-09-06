/**
 * /store - put AP into the game's chest (must be standing on a Chest tile).
 *
 * parse/run/present per TESTING.md Part 1. run() takes plain data and a
 * deps bundle and returns a CommandResult; it never sees an interaction.
 *
 * Ported from the old execute with these fixes, each of which was a crash
 * or an impossible where-clause before (see the conversion commit):
 * - the old code called the undefined helper deferredReply(interaction), so
 *   every invocation threw before doing anything (adapter now uses plain
 *   deferReply())
 * - utils.getOldestGameId() was called with no argument, which throws
 *   "missing playerDiscordID"; the actor's discord id is now passed
 * - the player lookup used `gameId.Game_ID` as its Game_ID - undefined for
 *   an integer gameId (Sequelize rejects undefined in a where) and a
 *   TypeError for a null one - so the lookup could never succeed; it now
 *   uses the resolved game's id
 * - a missing game / missing player now return NO_SUCH_GAME / NOT_IN_GAME
 *   instead of crashing on game.GAME_STATE / player.Tile_ID
 *
 * Preserved as-is (each pinned by a test):
 * - an omitted amount is NOT defaulted to 1 despite the option description;
 *   it stays null, passes the AP check (AP < null is false), coerces to 0
 *   in the arithmetic, and renders as
 *   "You have stored null AP in the chest!"
 * - negative amounts pass every check and withdraw AP from the chest
 * - no Dead gate: dead players can store
 * - isClockwatcher is hard-coded false, so even a Clockwatcher is blocked
 *   during a timestop (the player's class is never looked up)
 */
const { REJECTIONS } = require('../../enums.js');
const { messageFor } = require('../_messages.js');
const defaultDeps = require('../_deps.js');

function parse(raw, actor) {
  return {
    // no default applied - the old code never did, despite the description
    amount: raw.amount,
    gameId: raw.game ?? null,
    discordId: actor.discordId,
  };
}

async function run(input, deps = defaultDeps) {
  const { models, utils } = deps;

  const gameId = input.gameId ?? await utils.getOldestGameId(input.discordId);
  const game = await models.Games.findByPk(gameId);
  if (!game) return { ok: false, reason: REJECTIONS.NO_SUCH_GAME, data: { gameId } };

  const player = await models.Players.findOne({ where: { Game_ID: game.Game_ID, Discord_ID: input.discordId } });
  if (!player) return { ok: false, reason: REJECTIONS.NOT_IN_GAME };

  const playerTile = await models.Tiles.findByPk(player.Tile_ID);

  // hard false: the old code never consulted the player's class here, so a
  // Clockwatcher is blocked during a timestop like everyone else
  const verdict = utils.checkGameState(game.GAME_STATE, false);
  if (verdict.blocked) return { ok: false, reason: verdict.reason };

  if (playerTile.Tile_Type != 'Chest') {
    return { ok: false, reason: REJECTIONS.WRONG_TILE_TYPE, data: { message: 'You are not on a chest tile!' } };
  }

  if (player.Action_Points < input.amount) {
    // data.action makes _messages.js render the exact legacy string:
    // "You dont have enough AP to store in the chest!"
    return { ok: false, reason: REJECTIONS.NOT_ENOUGH_AP, data: { action: 'store in the chest' } };
  }

  await models.Games.update(
    { CHEST_AMOUNT: game.CHEST_AMOUNT + input.amount },
    { where: { Game_ID: game.Game_ID } },
  );
  await models.Players.update(
    { Action_Points: player.Action_Points - input.amount },
    { where: { Player_ID: player.Player_ID } },
  );

  return { ok: true, kind: 'stored', data: { amount: input.amount } };
}

function present(result) {
  if (!result.ok) return { content: messageFor(result.reason, result.data) };
  return { content: 'You have stored ' + result.data.amount + ' AP in the chest!' };
}

module.exports = { parse, run, present };
