/**
 * /board - render the grid the player is on (or a chosen layer) as an image.
 *
 * Who may look at a layer they are not standing on is the renderer's sight
 * list: an Oracle (allLayerSight) and a dead player, who has nothing left to
 * hide from. The rule is checked here, before anything renders, so it comes
 * back as a NOT_ORACLE rejection the player can read rather than a throw out
 * of the middle of a render; the renderer keeps its own check as a backstop
 * for its other callers.
 *
 * Everyone else is held to the layers their own bodies stand on - both of
 * them, so a Twin split across layers can look at either, with or without the
 * layer option.
 *
 * With no layer named, every player - Oracle included - gets the layer of the
 * body they asked about.
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
  } else {
    //No layer named: the layer of the body asked about, for everyone. An
    //Oracle may look anywhere, but only when it says where.
    const tile = await models.Tiles.findByPk(input.body === 2 ? player.Tile_ID2 : player.Tile_ID);
    if (!tile) return { ok: false, reason: REJECTIONS.NO_SUCH_TILE };
    layerId = tile.Layer_ID;
  }

  const buffer = await utils.GenerateGameGridImage(gameId, layerId, player.Player_ID);
  return { ok: true, kind: 'board', data: { buffer, gameId, layerId } };
}

function present(result) {
  if (!result.ok) return { content: messageFor(result.reason, result.data) };
  return { files: [{ buffer: result.data.buffer, name: 'grid.png' }] };
}

module.exports = { parse, run, present };
