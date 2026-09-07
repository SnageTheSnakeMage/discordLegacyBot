/**
 * /deliver - Mailman class command: hand another player some of your AP.
 *
 * parse/run/present per TESTING.md Part 1. run() takes plain data and a
 * deps bundle and returns a CommandResult; it never sees an interaction.
 *
 * Ported from the old execute with these fixes, each of which was a crash
 * or an impossible comparison before (see the conversion commit):
 * - the gamestate check read `game.GAME_STATE` but no `game` variable
 *   existed anywhere in the file, so every invocation threw; the game row
 *   is now actually loaded (and an unknown game rejects as NO_SUCH_GAME)
 * - `utils.getOldestGameId()` was called with no argument, and that helper
 *   throws "missing playerDiscordID" without one, so the default-game path
 *   always threw; the actor's discord id is now passed
 * - the class gate compared `player.Class`, a column that does not exist on
 *   Players (the schema has Class_ID -> Classes.Class_Name), so the check
 *   could never pass; the class row is now loaded and compared by name
 * - an actor with no Players row crashed with a TypeError at the class
 *   gate; that is now a NOT_IN_GAME rejection
 *
 * Deliberately preserved (pinned by tests): no range/layer check, no dead
 * check on either side, no MAX_AP clamp on the receiver, and the
 * last-write-wins self-delivery (net AP loss).
 */
const { REJECTIONS } = require('../../enums.js');
const { messageFor } = require('../_messages.js');
const defaultDeps = require('../_deps.js');

function parse(raw, actor) {
  return {
    targetDiscordId: raw.receiver,
    receiverUsername: raw.receiverUsername,
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

  const player = await models.Players.findOne({ where: { Discord_ID: input.discordId, Game_ID: gameId } });
  const receiver = await models.Players.findOne({ where: { Discord_ID: input.targetDiscordId, Game_ID: gameId } });

  // the old code hardcoded isClockwatcher=false here; a Mailman is never a
  // Clockwatcher, so timestop always blocks this command
  const verdict = utils.checkGameState(game.GAME_STATE, false);
  if (verdict.blocked) return { ok: false, reason: verdict.reason };

  if (!player) return { ok: false, reason: REJECTIONS.NOT_IN_GAME };

  const playerClass = await models.Classes.findByPk(player.Class_ID);
  if (!playerClass || playerClass.Class_Name !== 'Mailman') {
    return { ok: false, reason: REJECTIONS.WRONG_CLASS, data: { className: 'Mailman' } };
  }

  if (!receiver) {
    return { ok: false, reason: REJECTIONS.TARGET_NOT_IN_GAME, data: { role: 'receiver' } };
  }

  if (player.Action_Points < input.amount) {
    return { ok: false, reason: REJECTIONS.NOT_ENOUGH_AP, data: { action: 'deliver' } };
  }

  await models.Players.update(
    { Action_Points: Math.min(receiver.Action_Points + input.amount, receiver.MAX_AP) },
    { where: { Player_ID: receiver.Player_ID } },
  );
  await models.Players.update(
    { Action_Points: player.Action_Points - input.amount },
    { where: { Player_ID: player.Player_ID } },
  );

  return {
    ok: true,
    kind: 'delivered',
    data: { amount: input.amount, receiverUsername: input.receiverUsername },
  };
}

function present(result) {
  if (!result.ok) return { content: messageFor(result.reason, result.data) };
  const d = result.data;
  // no space between the amount and "AP" - byte-identical to the old reply
  return { content: `You have delivered ${d.amount}AP to ${d.receiverUsername}!` };
}

module.exports = { parse, run, present };
