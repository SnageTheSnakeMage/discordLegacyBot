/**
 * /board - render the grid the player is on (or a chosen layer) as an image.
 *
 * Ported from the old execute/inputValidation/logic with these fixes:
 * - a missing player now returns NOT_IN_GAME instead of crashing on
 *   player.Class_ID
 * - the layer-conversion helper referenced logger200 out of scope, so
 *   providing a layer crashed with ReferenceError; the conversion is now
 *   done inline against deps.models.Layers
 * - the dead gamestate switch (PAUSED and OVER, neither of which exists /
 *   matched) is replaced by the shared checkGameState gate
 *
 * Preserved as-is: any player may pass an explicit layer (the old code
 * never enforced Oracle for that, despite the option description), and an
 * Oracle with no layer input renders with a null layer id, exactly as
 * before.
 */
const { REJECTIONS } = require('../../enums.js');
const { messageFor } = require('../_messages.js');
const defaultDeps = require('../_deps.js');

function parse(raw, actor) {
  return {
    gameId: raw.game ?? null,
    layer: raw.layer ?? null,
    body: raw.body === 2 ? 2 : 1,
    discordId: actor.discordId,
  };
}

async function run(input, deps = defaultDeps) {
  const { models, utils } = deps;

  const gameId = input.gameId ?? await utils.getOldestGameId(input.discordId);
  const game = await models.Games.findByPk(gameId);
  if (!game) return { ok: false, reason: REJECTIONS.NO_SUCH_GAME, data: { gameId } };

  const player = await models.Players.findOne({ where: { Game_ID: gameId, Discord_ID: input.discordId } });
  if (!player) return { ok: false, reason: REJECTIONS.NOT_IN_GAME };

  const playerClass = await models.Classes.findByPk(player.Class_ID);
  const verdict = utils.checkGameState(game.GAME_STATE, playerClass.Class_Name === 'Clockwatcher');
  if (verdict.blocked) return { ok: false, reason: verdict.reason };

  let layerId;
  if (input.layer !== null) {
    // the player passed a 1-based "common" layer number; map it to the
    // game's actual Layer_ID
    const layerIds = (await models.Layers.findAll({ where: { Game_ID: gameId }, attributes: ['Layer_ID'] }))
      .map((l) => l.Layer_ID);
    layerId = layerIds[input.layer - 1];
    if (layerId === undefined) return { ok: false, reason: REJECTIONS.NO_SUCH_LAYER };
  } else if (input.body === 2) {
    const tile = await models.Tiles.findByPk(player.Tile_ID2);
    if (!tile) return { ok: false, reason: REJECTIONS.NO_SUCH_TILE };
    layerId = tile.Layer_ID;
  } else if (playerClass.Class_Name !== 'Oracle') {
    const tile = await models.Tiles.findByPk(player.Tile_ID);
    if (!tile) return { ok: false, reason: REJECTIONS.NO_SUCH_TILE };
    layerId = tile.Layer_ID;
  } else {
    // old behaviour: an Oracle with no layer input renders with a null layer
    layerId = null;
  }

  const buffer = await utils.GenerateGameGridImage(gameId, layerId, player.Player_ID);
  return { ok: true, kind: 'board', data: { buffer, gameId, layerId } };
}

function present(result) {
  if (!result.ok) return { content: messageFor(result.reason, result.data) };
  return { files: [{ buffer: result.data.buffer, name: 'grid.png' }] };
}

module.exports = { parse, run, present };
