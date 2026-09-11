/**
 * /shove - Bully class command: force another player one tile away from you.
 *
 * parse/run/present per TESTING.md Part 1: run() takes plain data and a deps
 * bundle and returns a CommandResult, never an interaction.
 *
 * All three directions are RELATIVE to the line from the Bully to the
 * victim, not compass directions and not layers. "back" pushes the victim
 * one tile further along that line; "up" and "down" push them to the two
 * tiles flanking it. So a victim standing east of the Bully goes east,
 * north-east or south-east.
 *
 * "up" is always the more northerly of the two flanks, so it never sends
 * anyone south. When the victim is due north or due south of the Bully both
 * flanks are equally northerly, and the tie falls to the anticlockwise one.
 *
 * When both players share a tile the direction comes from their icon slots
 * instead: Player1 is drawn top-left, Player2 top-right, Player3 bottom-left
 * and Player4 bottom-right, so those positions give the same 8 directions.
 * The victim still leaves the tile - the slots only decide which way.
 *
 * A shove writes both sides of the position invariant through
 * utils.setPlayerToTile, so the tile the victim leaves stops naming them.
 */
const { REJECTIONS } = require('../../enums.js');
const { messageFor } = require('../_messages.js');
const defaultDeps = require('../_deps.js');

const REQUIRED_AP = 1;
/** terrain nobody but a Cloudborn may be pushed onto */
const IMPASSABLE = ['Wall', 'Wall_Damaged', 'Void'];

/** the 8 directions, clockwise from north, in board coordinates (+Y is south) */
const RING = [
  [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1],
];

/** where each icon slot sits inside a tile, as a 2x2 grid */
const SLOT_POSITION = {
  Player1: [0, 0], Player2: [1, 0], Player3: [0, 1], Player4: [1, 1],
};

/**
 * The push vector for a direction, given the Bully -> victim vector.
 *
 * 'back' continues along that line. 'up' and 'down' take the two flanking
 * directions, with 'up' always the more northerly so it never sends anyone
 * south - which is why a westward push gives up=NW, down=SW rather than the
 * plain anticlockwise/clockwise pairing. A victim due north or due south has
 * two equally northerly flanks, and that tie falls to the anticlockwise one.
 *
 * Returns null when the away-vector is not one of the 8 directions.
 */
function shoveVector(awayDx, awayDy, direction) {
  const away = [Math.sign(awayDx), Math.sign(awayDy)];
  const index = RING.findIndex(([x, y]) => x === away[0] && y === away[1]);
  if (index === -1) return null;
  if (direction === 'back') return away;

  const anticlockwise = RING[(index + 7) % 8];
  const clockwise = RING[(index + 1) % 8];
  // smaller Y is further north; on a tie the anticlockwise flank is 'up'
  const up = anticlockwise[1] <= clockwise[1] ? anticlockwise : clockwise;
  const down = up === anticlockwise ? clockwise : anticlockwise;
  return direction === 'up' ? up : down;
}

/** Which slot a player occupies on a tile, or null if the tile does not list them. */
function slotOf(tile, playerId) {
  return Object.keys(SLOT_POSITION).find((slot) => tile[slot] === playerId) || null;
}

function parse(raw, actor) {
  return {
    gameId: raw.game ?? null,
    targetDiscordId: raw.target ?? null,
    targetUsername: raw.targetUsername ?? null,
    direction: raw.direction ?? null,
    discordId: actor.discordId,
    username: actor.username,
  };
}

async function run(input, deps = defaultDeps) {
  const { models, utils } = deps;

  const gameId = input.gameId ?? await utils.getOldestGameId(input.discordId);
  const game = await models.Games.findByPk(gameId);
  if (!game) return { ok: false, reason: REJECTIONS.NO_SUCH_GAME, data: { gameId } };

  const player = await models.Players.findOne({
    where: { Game_ID: gameId, Discord_ID: input.discordId },
  });

  const verdict = utils.checkGameState(
    game.GAME_STATE, await utils.isClockwatcher(models, player),
  );
  if (verdict.blocked) return { ok: false, reason: verdict.reason };

  if (!player) return { ok: false, reason: REJECTIONS.NOT_IN_GAME };
  if (player.Dead) return { ok: false, reason: REJECTIONS.PLAYER_DEAD };

  const playerClass = await models.Classes.findByPk(player.Class_ID);
  if (!playerClass || playerClass.Class_Name !== 'Bully') {
    return { ok: false, reason: REJECTIONS.WRONG_CLASS, data: { className: 'Bully' } };
  }

  const targetPlayer = await models.Players.findOne({
    where: { Game_ID: gameId, Discord_ID: input.targetDiscordId },
  });
  if (!targetPlayer) return { ok: false, reason: REJECTIONS.TARGET_NOT_IN_GAME };
  if (targetPlayer.Player_ID === player.Player_ID) {
    return {
      ok: false,
      reason: REJECTIONS.INVALID_AMOUNT,
      data: { message: 'You cannot shove yourself!' },
    };
  }

  if (player.Action_Points < REQUIRED_AP) {
    return { ok: false, reason: REJECTIONS.NOT_ENOUGH_AP, data: { action: 'shove someone' } };
  }

  const bullyTile = await models.Tiles.findByPk(player.Tile_ID);
  const targetTile = await models.Tiles.findByPk(targetPlayer.Tile_ID);
  if (!bullyTile || !targetTile) return { ok: false, reason: REJECTIONS.NO_SUCH_TILE };

  // you can only shove someone you can reach
  if (bullyTile.Layer_ID !== targetTile.Layer_ID) {
    return { ok: false, reason: REJECTIONS.OUT_OF_RANGE, data: { message: 'They are not on your layer!' } };
  }
  let awayDx = targetTile.X_Position - bullyTile.X_Position;
  let awayDy = targetTile.Y_Position - bullyTile.Y_Position;
  if (Math.abs(awayDx) > 1 || Math.abs(awayDy) > 1) {
    return {
      ok: false,
      reason: REJECTIONS.OUT_OF_RANGE,
      data: { message: 'You can only shove someone on a tile next to you!' },
    };
  }

  // sharing a tile: the icons' own positions give the direction. Player1 is
  // drawn top-left, Player2 top-right, Player3 bottom-left, Player4
  // bottom-right, so the slot pair reads as one of the same 8 directions.
  if (awayDx === 0 && awayDy === 0) {
    const bullySlot = slotOf(bullyTile, player.Player_ID);
    const victimSlot = slotOf(targetTile, targetPlayer.Player_ID);
    if (!bullySlot || !victimSlot) {
      return {
        ok: false,
        reason: REJECTIONS.NO_SUCH_TILE,
        data: { message: 'The tile does not agree on who is standing on it - tell snage.' },
      };
    }
    awayDx = SLOT_POSITION[victimSlot][0] - SLOT_POSITION[bullySlot][0];
    awayDy = SLOT_POSITION[victimSlot][1] - SLOT_POSITION[bullySlot][1];
  }

  const push = shoveVector(awayDx, awayDy, input.direction);
  if (!push) {
    return {
      ok: false,
      reason: REJECTIONS.OUT_OF_RANGE,
      data: { message: 'You cannot work out which way to shove them from there!' },
    };
  }

  const destination = await resolveDestination(targetTile, push, deps);
  if (!destination.ok) return destination.rejection;

  const targetClass = await models.Classes.findByPk(targetPlayer.Class_ID);
  const cloudborn = !!targetClass && targetClass.Class_Name === 'Cloudborn';
  if (!cloudborn && IMPASSABLE.includes(destination.tile.Tile_Type)) {
    return {
      ok: false,
      reason: REJECTIONS.WRONG_TILE_TYPE,
      data: { message: `You cannot shove anyone onto a ${destination.tile.Tile_Type} tile!` },
    };
  }

  await utils.setPlayerToTile(
    targetPlayer.Player_ID,
    destination.tile.Layer_ID,
    destination.tile.X_Position,
    destination.tile.Y_Position,
  );
  await models.Players.update(
    { Action_Points: player.Action_Points - REQUIRED_AP },
    { where: { Player_ID: player.Player_ID, Game_ID: gameId } },
  );

  return {
    ok: true,
    kind: 'shoved',
    data: {
      targetDiscordId: targetPlayer.Discord_ID,
      direction: input.direction,
      x: destination.tile.X_Position,
      y: destination.tile.Y_Position,
      layerId: destination.tile.Layer_ID,
    },
  };
}

/** The tile the victim lands on: one step along the push vector. */
async function resolveDestination(targetTile, push, deps) {
  const { models } = deps;
  const tile = await models.Tiles.findOne({
    where: {
      Layer_ID: targetTile.Layer_ID,
      X_Position: targetTile.X_Position + push[0],
      Y_Position: targetTile.Y_Position + push[1],
    },
  });
  if (!tile) {
    return {
      ok: false,
      rejection: {
        ok: false,
        reason: REJECTIONS.NO_SUCH_TILE,
        data: { message: 'There is nothing that way to shove them onto!' },
      },
    };
  }
  return { ok: true, tile };
}

function present(result) {
  if (!result.ok) return { content: messageFor(result.reason, result.data) };
  const { targetDiscordId, direction, x, y, layerId } = result.data;
  return {
    content: `You shoved <@${targetDiscordId}> ${direction} to (${x}, ${y}) on layer ${layerId}!`,
  };
}

module.exports = { parse, run, present, shoveVector, slotOf };
