/**
 * /stab - Fencer class command: stab a player standing on your tile, 1 AP a
 * stab.
 *
 * parse/run/present per TESTING.md Part 1. run() takes plain data and a deps
 * bundle and returns a CommandResult; it never sees an interaction.
 *
 * The rules:
 * - each stab deals double the Fencer's damage (with any DMG_BUFF), capped at
 *   their MAX_DAMAGE per stab: `amount * min(Damage * (DMG_BUFF + 1) * 2,
 *   MAX_DAMAGE)`. The reply announces exactly what was dealt.
 * - the AP cost is the stab count, paid up front; a stab lost in a bush is
 *   still paid for
 * - the target must stand on the Fencer's body-1 tile, so a Twin's second
 *   body can neither stab nor be stabbed
 * - the not-enough-AP message talks about shooting
 * - the amount must be a whole number of at least 1
 */
const { REJECTIONS } = require('../../enums.js');
const { messageFor } = require('../_messages.js');
const defaultDeps = require('../_deps.js');

const PLAYER_SLOTS = ['Player1', 'Player2', 'Player3', 'Player4'];

function parse(raw, actor) {
  return {
    targetDiscordId: raw.target ?? null,
    amount: raw.amount ?? 1,
    gameId: raw.game ?? null,
    discordId: actor.discordId,
  };
}

async function run(input, deps = defaultDeps) {
  const badAmount = deps.utils.amountRejection(input.amount);
  if (badAmount) return badAmount;

  const { models, utils, random } = deps;

  const gameId = input.gameId ?? await utils.getOldestActiveGameId(input.discordId);
  const game = await models.Games.findByPk(gameId);
  if (!game) return { ok: false, reason: REJECTIONS.NO_SUCH_GAME, data: { gameId } };

  const player = await models.Players.findOne({ where: { Discord_ID: input.discordId, Game_ID: gameId } });
  if (!player) return { ok: false, reason: REJECTIONS.NOT_IN_GAME };

  const shootersTile = await models.Tiles.findByPk(player.Tile_ID);
  const playerClass = await models.Classes.findOne({ where: { Class_ID: player.Class_ID } });
  const targetPlayer = await models.Players.findOne({
    where: { Discord_ID: input.targetDiscordId, Game_ID: game.Game_ID },
  });

  // 1 AP a stab
  const requiredAP = input.amount;

  if (player.Dead) return { ok: false, reason: REJECTIONS.PLAYER_DEAD };

  // a class command: a player has one class, and a Clockwatcher never has
  // this one, so a timestop always blocks it
  const verdict = utils.checkGameState(game, false);
  if (verdict.blocked) return { ok: false, reason: verdict.reason };

  if (!playerClass || playerClass.Class_Name != 'Fencer') {
    return { ok: false, reason: REJECTIONS.WRONG_CLASS, data: { message: 'Only Fencers can use this command!' } };
  }

  if (player.Action_Points < requiredAP) {
    return { ok: false, reason: REJECTIONS.NOT_ENOUGH_AP, data: { message: "You don't have enough AP to shoot that much!" } };
  }

  // the legacy `if (!targetTile)` guard stood here; targetTile is declared
  // nowhere in this command and /stab takes no coordinates, so it is dropped

  if (!shootersTile) {
    return { ok: false, reason: REJECTIONS.NOT_IN_GAME, data: { message: 'You are not on the board! Are you registered in that game?' } };
  }

  if (!input.targetDiscordId || !targetPlayer) {
    return { ok: false, reason: REJECTIONS.TARGET_NOT_IN_GAME, data: { message: 'That mention does not correspond to a player registered in that game!' } };
  }

  // the tile's player slots hold Player_IDs; the old code compared them to a
  // Discord_ID, which never matched
  const onSameTile = PLAYER_SLOTS.some((slot) => shootersTile[slot] == targetPlayer.Player_ID);
  if (!onSameTile) {
    return { ok: false, reason: REJECTIONS.TARGET_NOT_ON_TILE, data: { message: 'You are not on the same tile as the target!' } };
  }

  // stab logic: a bush can swallow a stab, but the AP was already committed
  let amount = input.amount;
  let missed = false;
  if (shootersTile.Tile_Type == 'Bush' && random(1) == 0) {
    amount--;
    missed = true;
  }

  // each stab is doubled and capped on its own, so every stab paid for counts
  const perStab = Math.min(player.Damage * (player.DMG_BUFF + 1) * 2, player.MAX_DAMAGE);
  const appliedDamage = amount * perStab;

  // charged before the attack lands: a kill credits the attacker (Leftovers AP,
  // a Hitman or Cannibal bonus), and a charge written after it from this row
  // would overwrite that
  await models.Players.update(
    { Action_Points: player.Action_Points - requiredAP },
    { where: { Player_ID: player.Player_ID, Game_ID: gameId } },
  );

  await utils.damagePlayer(player, targetPlayer, appliedDamage);

  // if there was a DMG buff make sure to reset it
  if (player.DMG_BUFF > 0) {
    await models.Players.update({ DMG_BUFF: 0 }, { where: { Player_ID: player.Player_ID, Game_ID: gameId } });
  }

  return {
    ok: true,
    kind: 'stabbed',
    data: {
      missed,
      targetDiscordId: targetPlayer.Discord_ID,
      damage: appliedDamage,
      x: shootersTile.X_Position,
      y: shootersTile.Y_Position,
    },
  };
}

function present(result) {
  if (!result.ok) return { content: messageFor(result.reason, result.data) };
  const d = result.data;
  let response = '';
  if (d.missed) response += `You missed the target in the bush!\n`;
  response += `You hit <@${d.targetDiscordId}> for ${d.damage} damage at ${d.x},${d.y}!\n`;
  return { content: response };
}

module.exports = { parse, run, present };
