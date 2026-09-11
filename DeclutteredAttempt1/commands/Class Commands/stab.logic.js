/**
 * /stab - Fencer class command: spend 1 AP per stab to deal doubled damage
 * (capped at the Fencer's MAX_DAMAGE) to a player standing on the same tile.
 *
 * parse/run/present per TESTING.md Part 1. run() takes plain data and a deps
 * bundle and returns a CommandResult; it never sees an interaction.
 *
 * Ported from the old execute with these fixes, each of which was a crash, a
 * dead read or a comparison that could never be true (see the conversion
 * commit):
 * - `const shootersTile = await models.Tiles.findByPk(player.Tile_ID).X_Position`
 *   read `.X_Position` off the Promise, not the row, so shootersTile was
 *   always undefined: the tile type, the coordinates and every Player slot
 *   were unreadable and the "You are not on the board!" guard fired for
 *   everyone. The row is now awaited before it is used.
 * - `if (!targetTile)` referenced a variable this command never declares, so
 *   every /stab that got past the AP check threw
 *   "targetTile is not defined" before it could do anything. /stab has no
 *   coordinate options - the target is whoever shares your tile - so there is
 *   no tile to verify; the guard is dropped along with its message.
 * - the hit line interpolated `attackPath[attackTile]`, two more variables
 *   this command never declares, so even a stab that somehow reached the
 *   write ended in a ReferenceError after damaging the target. The wording is
 *   unchanged; the coordinates are the tile the two players share.
 * - the same-tile test compared `shootersTile.PlayerN` (which holds a
 *   Players.Player_ID - see database/Models/Tiles.js) against the target's
 *   Discord_ID, a snowflake that can never equal a small autoincrement id, so
 *   the check rejected every stab. It now compares Player_ID, as /snipe does.
 * - a missing game row crashed on game.GAME_STATE -> NO_SUCH_GAME
 * - a missing player row crashed on player.Tile_ID -> NOT_IN_GAME
 * - a missing class row crashed on playerClass.Class_Name -> WRONG_CLASS
 * - `const y = interaction.options.getInteger('y')` read an option this
 *   command's builder never declares and nothing ever read `y`; dropped.
 * - the trailing `amount = 0` was a dead write (there is no loop here, unlike
 *   the /shoot code this was copied from); dropped.
 *
 * Preserved as-is (each pinned by a test):
 * - the gamestate gate passes isClockwatcher=false, so even a Clockwatcher is
 *   blocked by a timestop here
 * - the AP cost is the stab count itself: `requiredAP = amount`, 1 AP a stab
 * - the number written and the number announced disagree. The write applies
 *   `min(amount * Damage * (DMG_BUFF + 1) * 2, MAX_DAMAGE)` - the doubling is
 *   inside the cap - while the message reports
 *   `amount * Damage * (DMG_BUFF + 1)`, neither doubled nor capped.
 * - a bush miss decrements `amount` AFTER requiredAP was taken from it, so
 *   the Fencer still pays for the stab they missed, and a single missed stab
 *   announces "You hit ... for 0$ damage"
 * - playerDeathLogic is handed the pre-damage target row (the update went to
 *   the database, the in-memory row was never refreshed), so a lethal stab
 *   does not register the kill
 * - the target player is looked up by Discord_ID alone - no Game_ID filter -
 *   and only the shooter's Tile_ID slots are checked, never Tile_ID2, so a
 *   Twin's second body can neither stab nor be stabbed
 * - the not-enough-AP message still talks about shooting
 * - `amount` is never validated, so a negative amount heals the target and
 *   refunds AP
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
  const { models, utils, random } = deps;

  const gameId = input.gameId ?? await utils.getOldestActiveGameId(input.discordId);
  const game = await models.Games.findByPk(gameId);
  if (!game) return { ok: false, reason: REJECTIONS.NO_SUCH_GAME, data: { gameId } };

  const player = await models.Players.findOne({ where: { Discord_ID: input.discordId, Game_ID: gameId } });
  if (!player) return { ok: false, reason: REJECTIONS.NOT_IN_GAME };

  // the old code read .X_Position off the un-awaited findByPk promise, so
  // this was always undefined (crash/dead-read fix)
  const shootersTile = await models.Tiles.findByPk(player.Tile_ID);
  const playerClass = await models.Classes.findOne({ where: { Class_ID: player.Class_ID } });
  // looked up by Discord_ID alone, exactly as before - no Game_ID filter
  const targetPlayer = await models.Players.findOne({
    where: { Discord_ID: input.targetDiscordId, Game_ID: game.Game_ID },
  });

  // 1 AP a stab
  const requiredAP = input.amount;

  if (player.Dead) return { ok: false, reason: REJECTIONS.PLAYER_DEAD };

  // the old code hardcoded isClockwatcher=false, so even Clockwatchers are
  // blocked by a timestop
  // a Clockwatcher acts through a timestop. Every call site used to
  // hard-code false here, so the class's whole ability did nothing.
  const verdict = utils.checkGameState(
    game.GAME_STATE, await utils.isClockwatcher(models, player),
  );
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

  // the doubling sits inside the cap on the write, and neither appears in the
  // announced number below
  const appliedDamage = Math.min(amount * player.Damage * (player.DMG_BUFF + 1) * 2, player.MAX_DAMAGE);
  const announcedDamage = amount * player.Damage * (player.DMG_BUFF + 1);

  // was: the write plus playerDeathLogic handed the pre-damage row, so a
  // lethal stab never registered the kill
  await utils.damagePlayer(player, targetPlayer, appliedDamage);

  // if there was a DMG buff make sure to reset it
  if (player.DMG_BUFF > 0) {
    await models.Players.update({ DMG_BUFF: 0 }, { where: { Player_ID: player.Player_ID, Game_ID: gameId } });
  }

  await models.Players.update(
    { Action_Points: player.Action_Points - requiredAP },
    { where: { Player_ID: player.Player_ID, Game_ID: gameId } },
  );

  return {
    ok: true,
    kind: 'stabbed',
    data: {
      missed,
      targetDiscordId: targetPlayer.Discord_ID,
      damage: announcedDamage,
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
  response += `You hit <@${d.targetDiscordId}> for ${d.damage}$ damage at ${d.x},${d.y}!\n`;
  return { content: response };
}

module.exports = { parse, run, present };
