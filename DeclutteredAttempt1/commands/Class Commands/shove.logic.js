/**
 * /shove - Bully class command: force another player one tile away from you.
 *
 * parse/run/present per TESTING.md Part 1: run() takes plain data and a deps
 * bundle and returns a CommandResult, never an interaction.
 *
 * "up" and "down" are LAYERS, not compass directions - the sheet's wording
 * is ">shove @mention up/back/down". "back" is the one that pushes across
 * the board: the victim goes one tile further along the line from the Bully
 * to them, i.e. directly away.
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
  const dx = targetTile.X_Position - bullyTile.X_Position;
  const dy = targetTile.Y_Position - bullyTile.Y_Position;
  if (Math.abs(dx) > 1 || Math.abs(dy) > 1 || (dx === 0 && dy === 0)) {
    return {
      ok: false,
      reason: REJECTIONS.OUT_OF_RANGE,
      data: { message: 'You can only shove someone on a tile next to you!' },
    };
  }

  const destination = await resolveDestination(input.direction, targetTile, dx, dy, deps);
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

/** 'back' pushes along the line away from the bully; 'up'/'down' change layer. */
async function resolveDestination(direction, targetTile, dx, dy, deps) {
  const { models } = deps;
  const reject = (rejection) => ({ ok: false, rejection });

  if (direction === 'back') {
    const tile = await models.Tiles.findOne({
      where: {
        Layer_ID: targetTile.Layer_ID,
        X_Position: targetTile.X_Position + dx,
        Y_Position: targetTile.Y_Position + dy,
      },
    });
    if (!tile) {
      return reject({
        ok: false,
        reason: REJECTIONS.NO_SUCH_TILE,
        data: { message: 'There is nothing behind them to shove them onto!' },
      });
    }
    return { ok: true, tile };
  }

  const layer = await models.Layers.findByPk(targetTile.Layer_ID);
  if (!layer) return reject({ ok: false, reason: REJECTIONS.NO_SUCH_LAYER });
  const destinationLayerId = direction === 'up' ? layer.Layer_Above : layer.Layer_Below;
  if (destinationLayerId == null) {
    return reject({
      ok: false,
      reason: REJECTIONS.NO_SUCH_LAYER,
      data: { message: `There is no layer ${direction} from them!` },
    });
  }
  const tile = await models.Tiles.findOne({
    where: {
      Layer_ID: destinationLayerId,
      X_Position: targetTile.X_Position,
      Y_Position: targetTile.Y_Position,
    },
  });
  if (!tile) return reject({ ok: false, reason: REJECTIONS.NO_SUCH_TILE });
  return { ok: true, tile };
}

function present(result) {
  if (!result.ok) return { content: messageFor(result.reason, result.data) };
  const { targetDiscordId, direction, x, y, layerId } = result.data;
  return {
    content: `You shoved <@${targetDiscordId}> ${direction} to (${x}, ${y}) on layer ${layerId}!`,
  };
}

module.exports = { parse, run, present };
