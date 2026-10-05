/**
 * /resurrect - Necromancer class command: bring a dead player in the game
 * back to life on a chosen tile for 12 AP.
 *
 * parse/run/present per TESTING.md Part 1. run() takes plain data and a deps
 * bundle and returns a CommandResult; it never sees an interaction.
 *
 * The rules:
 * - the resurrectee comes back on the tile the caster names, with 1 HP
 * - the layer is a 1-based layer number; an absent or out-of-range one falls
 *   back to the caster's own layer
 * - the tile must exist, must not be Void, Wall or Ice, and must be empty
 * - there is no dead-check on the CASTER: a dead Necromancer may resurrect
 * - `resurrectee.Dead === 0` is a strict integer compare (Dead is an INTEGER
 *   column defaulting to 0)
 * - rejection order: gamestate, class, tile, target-in-game, target-dead, AP,
 *   tile type, tile occupancy
 */
const { REJECTIONS } = require('../../enums.js');
const { messageFor } = require('../_messages.js');
const defaultDeps = require('../_deps.js');

const RESURRECT_COST = 12;
const FORBIDDEN_TILE_TYPES = ['Void', 'Wall', 'Ice'];

function parse(raw, actor) {
  return {
    targetDiscordId: raw.player ?? null,
    targetUsername: raw.playerUsername ?? null,
    x: raw.x,
    y: raw.y,
    layer: raw.layer ?? null,
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

  const playersTile = await models.Tiles.findOne({ where: { Tile_ID: player.Tile_ID } });

  // the player passes a 1-based "common" layer number; map it to the game's
  // actual Layer_ID, falling back to the caster's own layer when the option
  // was absent OR names a layer this game does not have (the old `??`)
  let layerId;
  if (input.layer !== null) {
    const layerIds = (await models.Layers.findAll({ where: { Game_ID: game.Game_ID }, attributes: ['Layer_ID'] }))
      .map((l) => l.Layer_ID);
    layerId = layerIds[input.layer - 1];
  }
  if (layerId === undefined || layerId === null) {
    layerId = playersTile ? playersTile.Layer_ID : null;
  }

  const inputtedTile = await models.Tiles.findOne({
    where: { Layer_ID: layerId, X_Position: input.x, Y_Position: input.y },
  });
  const resurrectee = await models.Players.findOne({ where: { Game_ID: game.Game_ID, Discord_ID: input.targetDiscordId } });
  const playerClass = await models.Classes.findByPk(player.Class_ID);

  // a class command: a player has one class, and a Clockwatcher never has
  // this one, so a timestop always blocks it
  const verdict = utils.checkGameState(game, false);
  if (verdict.blocked) return { ok: false, reason: verdict.reason };

  if (!playerClass || playerClass.Class_Name !== 'Necromancer') {
    return { ok: false, reason: REJECTIONS.WRONG_CLASS, data: { className: 'Necromancer' } };
  }

  if (!inputtedTile) {
    return { ok: false, reason: REJECTIONS.NO_SUCH_TILE, data: { message: 'The tile provided is not in the game!' } };
  }

  if (!resurrectee) {
    return { ok: false, reason: REJECTIONS.TARGET_NOT_IN_GAME, data: { message: 'The resurrectee is not in this game!' } };
  }

  if (resurrectee.Dead === 0) {
    return { ok: false, reason: REJECTIONS.TARGET_NOT_DEAD };
  }

  if (player.Action_Points < RESURRECT_COST) {
    return { ok: false, reason: REJECTIONS.NOT_ENOUGH_AP, data: { action: 'resurrect' } };
  }

  if (FORBIDDEN_TILE_TYPES.includes(inputtedTile.Tile_Type)) {
    return { ok: false, reason: REJECTIONS.WRONG_TILE_TYPE, data: { message: 'You cannot resurrect to that tile!' } };
  }

  if (inputtedTile.Player1 != null || inputtedTile.Player2 != null
    || inputtedTile.Player3 != null || inputtedTile.Player4 != null) {
    return { ok: false, reason: REJECTIONS.TILE_OCCUPIED, data: { message: 'You cannot resurrect to that tile!' } };
  }

  // placePlayerOnBoard writes both halves of the position and clears Dead
  // together, onto the tile the caster asked for: a dead player has no tile
  // of their own to come back to
  await utils.placePlayerOnBoard(resurrectee.Player_ID, inputtedTile, { db: models });
  // a player died at 0 HP or below, so they come back with 1
  await models.Players.update({ Health_Points: 1 }, { where: { Player_ID: resurrectee.Player_ID } });
  await models.Players.update(
    { Action_Points: player.Action_Points - RESURRECT_COST },
    { where: { Player_ID: player.Player_ID } },
  );

  return {
    ok: true,
    kind: 'resurrected',
    data: {
      targetUsername: input.targetUsername,
      targetPlayerId: resurrectee.Player_ID,
      x: input.x,
      y: input.y,
      layerId,
    },
  };
}

function present(result) {
  if (!result.ok) return { content: messageFor(result.reason, result.data) };
  return { content: `You have resurrected ${result.data.targetUsername} to the tile provided!` };
}

module.exports = { parse, run, present };
