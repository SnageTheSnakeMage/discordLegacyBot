/**
 * /snipe - Sniper class command: a shot that pierces walls and damages every
 * player standing in the line of attack, not just the named target.
 *
 * parse/run/present per TESTING.md Part 1. run() takes plain data and a deps
 * bundle and returns a CommandResult; it never sees an interaction.
 *
 * Ported from the old execute with these fixes, each of which was a crash or
 * an unreachable branch before (see the conversion commit):
 * - `attackPath` was built from `targetTile` on the line ABOVE the `const
 *   targetTile = ...` declaration, so every single /snipe threw
 *   "Cannot access 'targetTile' before initialization" (TDZ) before any
 *   guard could run. The target tile is now looked up first and the path is
 *   built from it.
 * - utils.getOldestGameId() was called with no argument, and that helper
 *   throws "missing playerDiscordID" without one, so the default-game path
 *   always errored; it now receives the sniper's discord id
 * - a missing game row crashed on game.GAME_STATE -> NO_SUCH_GAME
 * - a missing player row crashed on player.Tile_ID -> NOT_IN_GAME
 * - a null shooter tile crashed on shootersTile.Layer_ID; snipe never had an
 *   off-board guard of its own, so this returns plain NOT_IN_GAME
 * - the class gate read `player.Class`, which is not a column on Players
 *   (the column is Class_ID), so it was always undefined and
 *   `player.Class != "Sniper"` was always true - no player could ever get
 *   past it. The class row is now loaded and Class_Name is compared, and
 *   WRONG_CLASS renders the byte-identical "You are not a Sniper!".
 * - the null-target-tile half of the legacy `!targetTile || !targetPlayer`
 *   guard has to move ahead of the gamestate/AP checks, because the path is
 *   built from the tile. Its legacy wording is carried unchanged; the
 *   !targetPlayer half stays where it was.
 *
 * Preserved as-is (each pinned by a test):
 * - the gamestate gate passes isClockwatcher=false, so even a Clockwatcher
 *   is blocked by a timestop here
 * - collateral players take `1 * Damage * (DMG_BUFF + 1)` damage but the
 *   message they get reports `amount * Damage * (DMG_BUFF + 1)`; the number
 *   written and the number announced disagree
 * - playerDeathLogic is called as (victim, sniper) - i.e. with the arguments
 *   in the opposite order from /shoot, so the sniper is passed as the victim
 * - the "zipped by" line's tile-type test
 *   `(Tile_Type != 'Wall' || Tile_Type != 'Wall_Damaged')` is a tautology, so
 *   an empty wall tile reports both the wall hit AND the shot zipping by
 * - an intact Wall is DESTROYED outright when amount > 2, otherwise merely
 *   damaged; a Wall_Damaged is always destroyed. Neither consumes a shot -
 *   snipe pierces, unlike /shoot
 * - the DMG_BUFF reset sits at the very bottom of the loop body, after the
 *   target-tile `break`, so it never runs on the shot that lands and runs
 *   once per tile crossed before it
 * - the full shootCost * amount is charged after the loop no matter what the
 *   shot did
 * - the target player is looked up with a Game_ID filter (unlike /shoot),
 *   and only the target's Tile_ID is compared, never Tile_ID2, so a Twin's
 *   second body cannot be sniped
 */
const { REJECTIONS } = require('../../enums.js');
const { messageFor } = require('../_messages.js');
const defaultDeps = require('../_deps.js');

const PLAYER_SLOTS = ['Player1', 'Player2', 'Player3', 'Player4'];

function parse(raw, actor) {
  return {
    x: raw.x,
    y: raw.y,
    targetDiscordId: raw.target ?? null,
    targetUsername: raw.targetUsername ?? null,
    amount: raw.amount ?? 1,
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
  if (!player) return { ok: false, reason: REJECTIONS.NOT_IN_GAME };

  const shootersTile = await models.Tiles.findByPk(player.Tile_ID);
  // the old code dereferenced a null shooter tile (crash fix); snipe had no
  // off-board wording of its own, so the NOT_IN_GAME default is used
  if (!shootersTile) return { ok: false, reason: REJECTIONS.NOT_IN_GAME };

  // looked up WITH the Game_ID filter, exactly as before
  const targetPlayer = await models.Players.findOne({ where: { Discord_ID: input.targetDiscordId, Game_ID: gameId } });

  const targetTile = await models.Tiles.findOne({
    where: { Layer_ID: shootersTile.Layer_ID, X_Position: input.x, Y_Position: input.y },
  });
  // hoisted out of the legacy `!targetTile || !targetPlayer` guard because
  // the attack path is built from this tile; the wording is unchanged
  if (!targetTile) {
    return { ok: false, reason: REJECTIONS.NO_SUCH_TILE, data: { message: 'The tile provided is not in the game!' } };
  }

  const attackPath = utils.getTileCordinatesOfLine(
    [shootersTile.X_Position, shootersTile.Y_Position],
    [targetTile.X_Position, targetTile.Y_Position],
  );

  const amount = input.amount;
  const requiredAP = game.shootCost * amount;

  // the old code hardcoded isClockwatcher=false, so even Clockwatchers are
  // blocked by a timestop
  const verdict = utils.checkGameState(game.GAME_STATE, false);
  if (verdict.blocked) return { ok: false, reason: verdict.reason };

  if (player.Action_Points < requiredAP) {
    return { ok: false, reason: REJECTIONS.NOT_ENOUGH_AP, data: { message: "You don't have enough AP to shoot that much!" } };
  }

  if (!targetPlayer) {
    return { ok: false, reason: REJECTIONS.TARGET_NOT_IN_GAME, data: { message: 'The tile provided is not in the game!' } };
  }

  // either of a Twin's bodies can be the one standing on the tile
  const targetBody = targetPlayer && targetPlayer.Tile_ID == targetTile.Tile_ID ? 1
    : (targetPlayer && targetPlayer.Tile_ID2 != null && targetPlayer.Tile_ID2 == targetTile.Tile_ID) ? 2
      : null;
  if (targetBody === null) {
    return { ok: false, reason: REJECTIONS.TARGET_NOT_ON_TILE, data: { message: 'Your target is not on the tile provided!' } };
  }

  // -1 cus we dont want to count the tile the player is on
  if (player.Range_ < attackPath.length - 1) {
    return {
      ok: false,
      reason: REJECTIONS.OUT_OF_RANGE,
      data: { message: `That tile is ${(attackPath.length - 1) - player.Range_} tiles out of range!` },
    };
  }

  const playerClass = await models.Classes.findByPk(player.Class_ID);
  if (!playerClass || playerClass.Class_Name !== 'Sniper') {
    return { ok: false, reason: REJECTIONS.WRONG_CLASS, data: { className: 'Sniper' } };
  }

  const collateralDamage = 1 * player.Damage * (player.DMG_BUFF + 1);
  const announcedDamage = amount * player.Damage * (player.DMG_BUFF + 1);

  const events = [];
  for (let i = 0; i < attackPath.length; i++) {
    const px = attackPath[i][0];
    const py = attackPath[i][1];
    const tile = await models.Tiles.findOne({
      where: { X_Position: px, Y_Position: py, Layer_ID: shootersTile.Layer_ID },
    });

    if (tile.Tile_Type == 'Wall') {
      // more than two shots blows the wall away outright
      if (amount > 2) {
        await utils.revertTileToBlank(tile);
        events.push({ type: 'destroyedWall', x: px, y: py });
      } else {
        await models.Tiles.update(
          { Tile_Type: 'Wall_Damaged' },
          { where: { X_Position: px, Y_Position: py, Layer_ID: shootersTile.Layer_ID } },
        );
        events.push({ type: 'hitWall', x: px, y: py });
      }
    }
    // the in-memory row still says "Wall" after the update above, so this
    // only fires for a tile that was already damaged
    if (tile.Tile_Type == 'Wall_Damaged') {
      await utils.revertTileToBlank(tile);
      events.push({ type: 'destroyedWall', x: px, y: py });
    }

    // the legacy tile-type half of this condition,
    // `(Tile_Type != 'Wall' || Tile_Type != 'Wall_Damaged')`, is true for
    // every possible value, so only the empty-tile half ever mattered
    if (tile.Player1 == null && tile.Player2 == null && tile.Player3 == null && tile.Player4 == null) {
      events.push({ type: 'zipped', x: px, y: py });
    }

    // anyone standing in the way who is not the target takes a single shot's
    // worth of damage
    for (const slot of PLAYER_SLOTS) {
      const occupant = tile[slot];
      if (occupant != null && occupant != targetPlayer.Player_ID) {
        const collateralPlayer = await models.Players.findOne({
          where: { Player_ID: occupant, Game_ID: game.Game_ID },
        });
        // was: the HP write plus playerDeathLogic(collateralPlayer, player) -
        // the arguments reversed, so the SNIPER was checked for death and
        // the victim never was. damagePlayer takes (attacker, victim).
        await utils.damagePlayer(player, collateralPlayer, collateralDamage);
        events.push({
          type: 'hitCollateral',
          targetDiscordId: collateralPlayer.Discord_ID,
          // announced, not applied - the write above used a single shot
          damage: announcedDamage,
          x: px,
          y: py,
        });
      }
    }

    if (tile.X_Position == input.x && tile.Y_Position == input.y) {
      // same reversal fixed here, and the hit lands on whichever of a
      // Twin's bodies is actually standing on the tile
      await utils.damagePlayer(player, targetPlayer, announcedDamage, targetBody);
      events.push({
        type: 'hitTarget',
        username: input.targetUsername,
        damage: announcedDamage,
        x: px,
        y: py,
      });
      break;
    }

    // sits after the break, so it never runs on the tile the shot lands on
    if (player.DMG_BUFF > 0) {
      await models.Players.update(
        { DMG_BUFF: 0 },
        { where: { Player_ID: player.Player_ID, Game_ID: game.Game_ID } },
      );
    }
  }

  await models.Players.update(
    { Action_Points: player.Action_Points - requiredAP },
    { where: { Player_ID: player.Player_ID, Game_ID: game.Game_ID } },
  );

  return { ok: true, kind: 'sniped', data: { events } };
}

function present(result) {
  if (!result.ok) return { content: messageFor(result.reason, result.data) };
  let response = '';
  for (const e of result.data.events) {
    switch (e.type) {
      // the wall and zip lines put the newline BEFORE the "!" - byte-identical
      // to legacy, typo included
      case 'destroyedWall': response += `You destroyed a wall at ${e.x},${e.y}\n!`; break;
      case 'hitWall': response += `You hit a wall at ${e.x},${e.y}\n!`; break;
      case 'zipped': response += `Your shot zipped by ${e.x},${e.y}\n!`; break;
      case 'hitCollateral': response += `You hit <@${e.targetDiscordId}> for ${e.damage}$ damage at ${e.x},${e.y}!\n`; break;
      // the target is named by username, everyone else by mention
      case 'hitTarget': response += `You hit ${e.username} for ${e.damage}$ damage at ${e.x},${e.y}!\n`; break;
    }
  }
  return { content: response };
}

module.exports = { parse, run, present };
