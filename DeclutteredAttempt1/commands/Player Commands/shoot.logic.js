/**
 * /shoot - spend AP to attack another player in range, damaging walls on the
 * way.
 *
 * parse/run/present per TESTING.md Part 1. run() takes plain data and a
 * deps bundle and returns a CommandResult; it never sees an interaction.
 *
 * Ported from the old execute with these fixes, each of which was a crash
 * before (see the conversion commit):
 * - utils.getOldestGameId() was called with no argument, and that helper
 *   throws "missing playerDiscordID" without one, so the default-game path
 *   always errored; it now receives the shooter's discord id
 * - a missing game row crashed on game.shootCost -> NO_SUCH_GAME
 * - a missing player row crashed on player.Class_ID -> NOT_IN_GAME
 * - a null shooter tile crashed on shootersTile.Layer_ID before its own
 *   "You are not on the board!" guard could run; the guard now runs first
 * - a null target tile crashed on targetTile.X_Position (building the
 *   attack path) before its own "That tile is not on the board!" guard
 *   could run; the guard now runs first
 *
 * Preserved as-is (each pinned by a test):
 * - the gamestate gate passes isClockwatcher=false, so a Clockwatcher can
 *   NOT shoot during a timestop
 * - a bush-miss on an intact Wall reports "You missed a damaged wall" and
 *   the wall still gets damaged afterwards (the miss costs an extra shot,
 *   it does not spare the wall unless it was the last shot)
 * - wall hit/destroy messages put the newline before the exclamation mark
 * - the full AP cost (shootCost * requested amount) is deducted even when
 *   shots missed or ran out on walls before reaching the target
 * - the target player is looked up by Discord_ID alone (no Game_ID filter)
 * - a bush-miss on the target tile still damages the target with the
 *   remaining shots
 * - only the target's Tile_ID is checked, never Tile_ID2, so a Twin's
 *   second body cannot be shot at
 */
const { REJECTIONS } = require('../../enums.js');
const { messageFor } = require('../_messages.js');
const defaultDeps = require('../_deps.js');

function parse(raw, actor) {
  return {
    x: raw.x,
    y: raw.y,
    targetDiscordId: raw.target,
    amount: raw.amount ?? 1,
    gameId: raw.game ?? null,
    body: raw.body === 2 ? 2 : 1,
    discordId: actor.discordId,
  };
}

async function run(input, deps = defaultDeps) {
  const { models, utils, random } = deps;

  const gameId = input.gameId ?? await utils.getOldestGameId(input.discordId);
  const game = await models.Games.findByPk(gameId);
  if (!game) return { ok: false, reason: REJECTIONS.NO_SUCH_GAME, data: { gameId } };

  const player = await models.Players.findOne({ where: { Discord_ID: input.discordId, Game_ID: gameId } });
  if (!player) return { ok: false, reason: REJECTIONS.NOT_IN_GAME };

  const playerClass = await models.Classes.findOne({ where: { Class_ID: player.Class_ID } });

  let shootersTile;
  if (input.body === 2) {
    shootersTile = await models.Tiles.findByPk(player.Tile_ID2);
  } else {
    shootersTile = await models.Tiles.findByPk(player.Tile_ID);
  }

  let amount = input.amount;
  const requiredAP = game.shootCost * amount;
  const targetPlayer = await models.Players.findOne({
    where: { Discord_ID: input.targetDiscordId, Game_ID: game.Game_ID },
  });

  // the old code dereferenced a null shooter tile here (crash fix; the
  // legacy guard message is kept byte-identical)
  if (!shootersTile) {
    return { ok: false, reason: REJECTIONS.NOT_IN_GAME, data: { message: 'You are not on the board! Are you registered in that game?' } };
  }

  const targetTile = await models.Tiles.findOne({ where: { Layer_ID: shootersTile.Layer_ID, X_Position: input.x, Y_Position: input.y } });
  // the old code dereferenced a null target tile building the attack path
  // (crash fix); NO_SUCH_TILE's default text is the legacy string
  if (!targetTile) return { ok: false, reason: REJECTIONS.NO_SUCH_TILE };

  // get all tiles between player and target
  const attackPath = utils.getTileCordinatesOfLine(
    [shootersTile.X_Position, shootersTile.Y_Position],
    [targetTile.X_Position, targetTile.Y_Position],
  );

  // the old code hardcoded isClockwatcher=false here, so even Clockwatchers
  // are blocked by a timestop
  const verdict = utils.checkGameState(game.GAME_STATE, false);
  if (verdict.blocked) return { ok: false, reason: verdict.reason };

  if (player.Action_Points < requiredAP) {
    return { ok: false, reason: REJECTIONS.NOT_ENOUGH_AP, data: { message: "You don't have enough AP to shoot that much!" } };
  }

  if (!input.targetDiscordId || !targetPlayer) {
    return { ok: false, reason: REJECTIONS.TARGET_NOT_IN_GAME, data: { message: 'That mention does not correspond to a player registered in that game!' } };
  }

  // a Twin has two bodies; either can be the one standing on the tile
  const targetBody = targetPlayer.Tile_ID == targetTile.Tile_ID ? 1
    : (targetPlayer.Tile_ID2 != null && targetPlayer.Tile_ID2 == targetTile.Tile_ID) ? 2
      : null;
  if (targetBody === null) {
    return { ok: false, reason: REJECTIONS.TARGET_NOT_ON_TILE, data: { message: "That player isnt on that tile!" } };
  }

  // -1 cus we dont want to count the tile the player is on
  if (player.Range_ < attackPath.length - 1) {
    return {
      ok: false,
      reason: REJECTIONS.OUT_OF_RANGE,
      data: { message: `That tile is ${(attackPath.length - 1) - player.Range_} tiles out of range!` },
    };
  }

  const events = [];
  for (let i = 0; i < attackPath.length; i++) {
    const px = attackPath[i][0];
    const py = attackPath[i][1];
    const tile = await models.Tiles.findOne({ where: { X_Position: px, Y_Position: py, Layer_ID: shootersTile.Layer_ID } });
    // an intact wall takes damage
    if (tile.Tile_Type == 'Wall') {
      // shooting out of a bush misses 50% of the time unless a Hunter
      if (shootersTile.Tile_Type == 'Bush' && random(1) == 0 && playerClass.Class_Name != 'Hunter') {
        amount--;
        events.push({ type: 'missWall', x: px, y: py });
        if (amount == 0) break;
      }
      await models.Tiles.update({ Tile_Type: 'Wall_Damaged' }, { where: { X_Position: px, Y_Position: py, Layer_ID: shootersTile.Layer_ID } });
      events.push({ type: 'hitWall', x: px, y: py });
      amount--;
      if (amount == 0) break;
    }
    // a damaged wall is destroyed
    if (tile.Tile_Type == 'Wall_Damaged') {
      if (shootersTile.Tile_Type == 'Bush' && random(1) == 0 && playerClass.Class_Name != 'Hunter') {
        amount--;
        events.push({ type: 'missWall', x: px, y: py });
        if (amount == 0) break;
      }
      await utils.revertTileToBlank(tile);
      events.push({ type: 'destroyedWall', x: px, y: py });
      amount--;
      if (amount == 0) break;
    }
    // the targeted tile: damage the target with whatever shots are left
    if (tile.X_Position == input.x && tile.Y_Position == input.y) {
      if (
        (shootersTile.Tile_Type == 'Bush' && random(1) == 0 && playerClass.Class_Name != 'Hunter')
        || (targetTile.Tile_Type == 'Bush' && random(1) == 0 && playerClass.Class_Name != 'Hunter')
      ) {
        amount--;
        events.push({ type: 'missTarget' });
        if (amount == 0) break;
      }
      const damage = amount * player.Damage * (player.DMG_BUFF + 1);
      // damagePlayer writes the hit body's HP and runs the death check
      // against the re-read row, so a lethal shot actually kills
      await utils.damagePlayer(player, targetPlayer, damage, targetBody);
      events.push({ type: 'hitTarget', targetDiscordId: targetPlayer.Discord_ID, damage, x: px, y: py });
      amount = 0;

      // if there was a DMG buff make sure to reset it
      if (player.DMG_BUFF > 0) {
        await models.Players.update({ DMG_BUFF: 0 }, { where: { Player_ID: player.Player_ID, Game_ID: gameId } });
      }
      break;
    }
  }

  await models.Players.update(
    { Action_Points: player.Action_Points - requiredAP },
    { where: { Player_ID: player.Player_ID, Game_ID: gameId } },
  );

  return { ok: true, kind: 'shot', data: { events } };
}

function present(result) {
  if (!result.ok) return { content: messageFor(result.reason, result.data) };
  let response = '';
  for (const e of result.data.events) {
    switch (e.type) {
      // yes: a miss on an intact wall also says "damaged wall", and the wall
      // messages put the newline before the "!" - byte-identical to legacy
      case 'missWall': response += `You missed a damaged wall at ${e.x},${e.y}!\n`; break;
      case 'hitWall': response += `You hit a wall at ${e.x},${e.y}\n!`; break;
      case 'destroyedWall': response += `You destroyed a wall at ${e.x},${e.y}\n!`; break;
      case 'missTarget': response += 'You missed the target tile!\n'; break;
      case 'hitTarget': response += `You hit <@${e.targetDiscordId}> for ${e.damage}$ damage at ${e.x},${e.y}!\n`; break;
    }
  }
  return { content: response };
}

module.exports = { parse, run, present };
