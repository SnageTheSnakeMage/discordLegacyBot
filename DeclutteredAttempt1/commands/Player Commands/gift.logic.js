/**
 * /gift - give a player in range some of your AP.
 *
 * parse/run/present per TESTING.md Part 1. run() takes plain data and a
 * deps bundle and returns a CommandResult; it never sees an interaction.
 *
 * Ported from the old execute/inputValidation with these fixes, each of
 * which was a crash or a dead write before (see the conversion commit):
 * - inputValidation is awaited (it was called without await, so every
 *   invocation dereferenced a pending Promise and threw)
 * - the giver's class is actually loaded before the Clockwatcher check
 *   (Class_Name was read off an unawaited findByPk, so it was always
 *   undefined)
 * - the overflow write that targeted `inputs.recievingPlayerDiscord`
 *   (undefined, so its where-clause matched no rows) is dropped; the
 *   effective behaviour - clamp the gift to what the receiver can hold -
 *   is kept.
 */
const { REJECTIONS } = require('../../enums.js');
const { messageFor } = require('../_messages.js');
const defaultDeps = require('../_deps.js');

function parse(raw, actor) {
  return {
    amount: raw.amount,
    targetDiscordId: raw.player,
    gameId: raw.game ?? null,
    discordId: actor.discordId,
    username: actor.username,
  };
}

async function run(input, deps = defaultDeps) {
  const { models, utils } = deps;

  const gameId = input.gameId ?? await utils.getOldestActiveGameId(input.discordId);
  const game = await models.Games.findByPk(gameId);
  if (!game) return { ok: false, reason: REJECTIONS.NO_SUCH_GAME, data: { gameId } };

  const receiver = await models.Players.findOne({ where: { Game_ID: gameId, Discord_ID: input.targetDiscordId } });
  if (!receiver) {
    return { ok: false, reason: REJECTIONS.TARGET_NOT_IN_GAME, data: { message: 'Something went wrong! Player not found in game! Please mention another player in the game inputted.' } };
  }

  const giver = await models.Players.findOne({ where: { Game_ID: gameId, Discord_ID: input.discordId } });
  if (!giver) return { ok: false, reason: REJECTIONS.NOT_IN_GAME };

  if (giver.Dead) return { ok: false, reason: REJECTIONS.PLAYER_DEAD };

  const giverClass = await models.Classes.findByPk(giver.Class_ID);
  const isClockwatcher = !!giverClass && giverClass.Class_Name === 'Clockwatcher';
  const verdict = utils.checkGameState(game.GAME_STATE, isClockwatcher);
  if (verdict.blocked) return { ok: false, reason: verdict.reason };

  if (giver.Action_Points < input.amount) {
    return { ok: false, reason: REJECTIONS.NOT_ENOUGH_AP, data: { message: 'You dont have that much AP to give!' } };
  }

  const giverTile = await models.Tiles.findByPk(giver.Tile_ID);
  const receiverTile = await models.Tiles.findByPk(receiver.Tile_ID);
  const distance = utils.getTileCordinatesOfLine(
    [giverTile.X_Position, giverTile.Y_Position],
    [receiverTile.X_Position, receiverTile.Y_Position],
  ).length;
  if (giver.Range_ < distance || giverTile.Layer_ID !== receiverTile.Layer_ID) {
    return { ok: false, reason: REJECTIONS.OUT_OF_RANGE, data: { message: 'That player is too far away or on a different layer than you!' } };
  }

  // clamp the gift to what the receiver can hold; the giver only pays the
  // clamped amount (matches the old amount-reduction before both updates)
  let amount = input.amount;
  const capacity = receiver.MAX_AP - receiver.Action_Points;
  if (amount > capacity) amount = capacity;

  await models.Players.update(
    { Action_Points: Math.min(receiver.Action_Points + amount, receiver.MAX_AP) },
    { where: { Game_ID: gameId, Discord_ID: input.targetDiscordId } },
  );
  await models.Players.update(
    { Action_Points: Math.max(giver.Action_Points - amount, 0) },
    { where: { Game_ID: gameId, Discord_ID: input.discordId } },
  );

  return {
    ok: true,
    kind: 'gifted',
    data: { amount, receiverDiscordId: receiver.Discord_ID, username: input.username },
  };
}

function present(result) {
  if (!result.ok) return { content: messageFor(result.reason, result.data) };
  const d = result.data;
  return { content: `${d.username} gave ${d.amount} AP to <@${d.receiverDiscordId}>` };
}

module.exports = { parse, run, present };
