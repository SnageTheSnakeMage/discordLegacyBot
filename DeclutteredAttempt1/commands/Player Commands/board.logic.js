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
 * Preserved as-is: an Oracle with no layer input renders with a null layer
 * id, exactly as before.
 *
 * #148: the Oracle rule was enforced, but by GenerateGameGridImage THROWING a
 * bare string mid-render. Nothing caught it, so the player got
 * "There was an error while executing this command!" instead of being told
 * what the rule is. The rule is checked here now, before anything renders,
 * and comes back as NOT_ORACLE like every other refusal. The renderer keeps
 * its throw as a backstop for its other callers.
 *
 * Who may look at another layer is the renderer's own list, not a new rule:
 * an Oracle (allLayerSight), and a dead player, who gets allLayerSight
 * because there is nothing left to hide from them. Everyone else is held to
 * the layers their own bodies are standing on - both of them, for a Twin,
 * which is also what fixes `/board body:2` for a Twin whose bodies are on
 * different layers: that used to hit the same throw, because the renderer
 * only ever compared against body 1's tile.
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
  const verdict = utils.checkGameState(game.GAME_STATE, playerClass.Class_Name === 'Clockwatcher', { readOnly: true });
  if (verdict.blocked) return { ok: false, reason: verdict.reason };

  let layerId;
  if (input.layer !== null) {
    // the player passed a 1-based "common" layer number; map it to the
    // game's actual Layer_ID
    const layerIds = (await models.Layers.findAll({ where: { Game_ID: gameId }, attributes: ['Layer_ID'] }))
      .map((l) => l.Layer_ID);
    layerId = layerIds[input.layer - 1];
    if (layerId === undefined) return { ok: false, reason: REJECTIONS.NO_SUCH_LAYER };

    if (playerClass.Class_Name !== 'Oracle' && !player.Dead) {
      const ownLayers = [];
      for (const tileId of [player.Tile_ID, player.Tile_ID2]) {
        if (tileId == null) continue;
        const ownTile = await models.Tiles.findByPk(tileId);
        if (ownTile) ownLayers.push(ownTile.Layer_ID);
      }
      if (!ownLayers.includes(layerId)) return { ok: false, reason: REJECTIONS.NOT_ORACLE };
    }
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
