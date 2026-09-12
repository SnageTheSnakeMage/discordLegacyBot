/**
 * /create-board - dev-only. Builds a game's whole board (every Layers row and
 * every Tiles row) from an ASCII preset in database/boards/.
 *
 * This replaces hand-running database/tileTableHydration.sql, which inserted
 * 630 tiles at fixed Layer_IDs into whatever database happened to be open.
 * A preset carries no ids: layers are created for the game you name, chained
 * top-to-bottom as they appear in the file, and the tiles follow.
 *
 * parse/run/present per TESTING.md Part 1. run() takes plain data and a deps
 * bundle and returns a CommandResult; it never sees an interaction. The
 * process.env.DEV_ID gate stays in the adapter and arrives as input.isDev.
 *
 * Destructive only on purpose: a game that already has layers is rejected
 * unless replace:true, and even then the board is not torn out from under
 * players who are standing on it.
 */
const { REJECTIONS } = require('../../enums.js');
const { messageFor } = require('../_messages.js');
const defaultDeps = require('../_deps.js');

function parse(raw, actor) {
  return {
    preset: raw.preset ?? null,
    gameId: raw.game ?? null,
    replace: raw.replace === true,
    isDev: actor.isDev === true,
    discordId: actor.discordId,
  };
}

async function run(input, deps = defaultDeps) {
  const { models, boards } = deps;

  if (!input.isDev) return { ok: false, reason: REJECTIONS.NOT_DEV };

  const available = boards.listPresets();

  // no preset named: this is the "what can I build?" call, not an error
  if (input.preset === null) {
    return { ok: true, kind: 'presetList', data: { available } };
  }

  const preset = boards.loadPreset(input.preset);
  if (!preset) {
    return { ok: false, reason: REJECTIONS.NO_SUCH_PRESET, data: { preset: input.preset, available } };
  }

  const game = await models.Games.findByPk(input.gameId);
  if (!game) return { ok: false, reason: REJECTIONS.NO_SUCH_GAME, data: { gameId: input.gameId } };

  const existingLayers = await models.Layers.findAll({ where: { Game_ID: input.gameId } });
  if (existingLayers.length && !input.replace) {
    return {
      ok: false,
      reason: REJECTIONS.BOARD_EXISTS,
      data: { gameId: input.gameId, layerCount: existingLayers.length },
    };
  }

  let removedLayers = 0;
  if (existingLayers.length) {
    // Players.Tile_ID points into the tiles about to be deleted; dropping
    // them anyway leaves every standing player pointing at nothing.
    const players = await models.Players.findAll({ where: { Game_ID: input.gameId } });
    const standing = players.filter((player) => player.Tile_ID != null || player.Tile_ID2 != null);
    if (standing.length) {
      return { ok: false, reason: REJECTIONS.BOARD_IN_USE, data: { playerCount: standing.length } };
    }

    for (const layer of existingLayers) {
      await models.Tiles.destroy({ where: { Layer_ID: layer.Layer_ID } });
    }
    await models.Layers.destroy({ where: { Game_ID: input.gameId } });
    removedLayers = existingLayers.length;
  }

  // Layers first, in file order: utils.commonLayerIDtoDbLayerID maps a
  // player's "layer 1" to the first Layers row of the game, so the top of the
  // file has to be the first row created.
  const created = [];
  for (const layer of preset.layers) {
    const row = await models.Layers.create({
      Layer_Above: null,
      Layer_Below: null,
      X_Bound: layer.width,
      Y_Bound: layer.height,
      Game_ID: input.gameId,
    });
    created.push(row);
  }

  // the stack, drawn in the preset as the "vvv" separators
  for (let i = 0; i < created.length; i++) {
    await models.Layers.update({
      Layer_Above: i > 0 ? created[i - 1].Layer_ID : null,
      Layer_Below: i < created.length - 1 ? created[i + 1].Layer_ID : null,
    }, { where: { Layer_ID: created[i].Layer_ID } });
  }

  let tileCount = 0;
  for (let i = 0; i < preset.layers.length; i++) {
    const rows = preset.layers[i].tiles.map((tile) => ({ ...tile, Layer_ID: created[i].Layer_ID }));
    await models.Tiles.bulkCreate(rows);
    tileCount += rows.length;
  }

  return {
    ok: true,
    kind: 'boardCreated',
    data: {
      preset: preset.name,
      gameId: input.gameId,
      removedLayers,
      tileCount,
      layers: preset.layers.map((layer, i) => ({
        name: layer.name,
        layerId: created[i].Layer_ID,
        width: layer.width,
        height: layer.height,
        tiles: layer.tiles.length,
      })),
    },
  };
}

function present(result) {
  if (!result.ok) return { content: messageFor(result.reason, result.data) };

  if (result.kind === 'presetList') {
    const { available } = result.data;
    return {
      content: available.length
        ? `Board presets: ${available.join(', ')}\nRun /create-board again with one of them and a game id.`
        : 'There are no board presets in database/boards/ yet.',
    };
  }

  const { preset, gameId, removedLayers, tileCount, layers } = result.data;
  const lines = layers.map((layer, i) => `  ${i + 1}. ${layer.name} - ${layer.width}x${layer.height}, ${layer.tiles} tiles (Layer_ID ${layer.layerId})`);
  return {
    content: [
      `Built "${preset}" for game ${gameId}: ${layers.length} layers, ${tileCount} tiles.`,
      ...lines,
      removedLayers ? `Replaced the previous board (${removedLayers} layers).` : '',
    ].filter(Boolean).join('\n'),
  };
}

module.exports = { parse, run, present };
