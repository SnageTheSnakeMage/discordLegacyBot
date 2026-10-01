/**
 * /retrieve - take AP out of the game's chest (must be standing on a Chest
 * tile).
 *
 * parse/run/present per TESTING.md Part 1. run() takes plain data and a
 * deps bundle and returns a CommandResult; it never sees an interaction.
 *
 * The rules:
 * - the amount defaults to 1 and must be a whole number of at least 1
 * - no Dead gate: dead players can retrieve
 * - no MAX_AP clamp on the receiving player
 */
const { REJECTIONS } = require('../../enums.js');
const { messageFor } = require('../_messages.js');
const defaultDeps = require('../_deps.js');

function parse(raw, actor) {
  return {
    amount: raw.amount ?? 1,
    gameId: raw.game ?? null,
    discordId: actor.discordId,
  };
}

async function run(input, deps = defaultDeps) {
  const badAmount = deps.utils.amountRejection(input.amount);
  if (badAmount) return badAmount;

  const { models, utils } = deps;

  const gameId = input.gameId ?? await utils.getOldestGameId(input.discordId);
  const game = await models.Games.findByPk(gameId);
  if (!game) return { ok: false, reason: REJECTIONS.NO_SUCH_GAME, data: { gameId } };

  const player = await models.Players.findOne({ where: { Game_ID: game.Game_ID, Discord_ID: input.discordId } });
  if (!player) return { ok: false, reason: REJECTIONS.NOT_IN_GAME };

  const playerTile = await models.Tiles.findByPk(player.Tile_ID);
  // Tile_ID is null for a dead player (playerDeathLogic writes it), so this
  // read returns null and every use below would be a TypeError
  if (!playerTile) return { ok: false, reason: REJECTIONS.NOT_ON_BOARD };

  // a Clockwatcher acts through a timestop
  const verdict = utils.checkGameState(
    game, await utils.isClockwatcher(models, player),
  );
  if (verdict.blocked) return { ok: false, reason: verdict.reason };

  if (playerTile.Tile_Type != 'Chest') {
    return { ok: false, reason: REJECTIONS.WRONG_TILE_TYPE, data: { message: 'You are not on a chest tile!' } };
  }

  if (game.CHEST_AMOUNT < input.amount) {
    return { ok: false, reason: REJECTIONS.NOT_ENOUGH_CHEST_AP };
  }

  await models.Games.update(
    { CHEST_AMOUNT: game.CHEST_AMOUNT - input.amount },
    { where: { Game_ID: game.Game_ID } },
  );
  await models.Players.update(
    deps.utils.apGain(player, input.amount),
    { where: { Player_ID: player.Player_ID } },
  );

  return { ok: true, kind: 'retrieved', data: { amount: input.amount } };
}

function present(result) {
  if (!result.ok) return { content: messageFor(result.reason, result.data) };
  return { content: 'You have retrieved ' + result.data.amount + ' AP from the chest!' };
}

module.exports = { parse, run, present };
