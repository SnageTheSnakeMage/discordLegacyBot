/**
 * /create-board against a real database. The unit tests prove the logic over
 * fake models; this proves the rows it writes are rows SQLite accepts - the
 * column names are real, the layer chain is a real self-referencing foreign
 * key, and the shipped presets insert end to end.
 */
const { freshDb, closeDb, models } = require('./helpers/testDb.js');
const { seedGame, seedPlayer } = require('./helpers/seed.js');
const logic = require('../../commands/Developer Commands/createBoard.logic.js');
const boards = require('../../database/boardPresets.js');
const { REJECTIONS } = require('../../enums.js');

const DEV = { discordId: '123', username: 'snage', isDev: true };
const deps = { models, boards };
const run = (raw) => logic.run(logic.parse(raw, DEV), deps);

describe('/create-board on a real database', () => {
  beforeEach(freshDb);
  afterAll(closeDb);

  it('builds every shipped preset, tile for tile', async () => {
    for (const name of boards.listPresets()) {
      await freshDb();
      const game = await seedGame();
      const preset = boards.loadPreset(name);

      const result = await run({ preset: name, game: game.Game_ID });
      expect(result.ok).toBe(true);

      const expectedTiles = preset.layers.reduce((n, layer) => n + layer.tiles.length, 0);
      expect(await models.Tiles.count()).toBe(expectedTiles);
      expect(await models.Layers.count()).toBe(preset.layers.length);

      // every tile lands inside its layer's declared bounds
      const layers = await models.Layers.findAll({ where: { Game_ID: game.Game_ID } });
      for (const [i, layer] of layers.entries()) {
        const tiles = await models.Tiles.findAll({ where: { Layer_ID: layer.Layer_ID } });
        expect(tiles).toHaveLength(preset.layers[i].width * preset.layers[i].height);
        expect(layer.X_Bound).toBe(preset.layers[i].width);
        expect(layer.Y_Bound).toBe(preset.layers[i].height);
        expect(Math.max(...tiles.map((t) => t.X_Position))).toBe(layer.X_Bound);
        expect(Math.max(...tiles.map((t) => t.Y_Position))).toBe(layer.Y_Bound);
      }
    }
  });

  it('writes the exact map that was drawn', async () => {
    const game = await seedGame();
    await run({ preset: 'sandbox', game: game.Game_ID });

    const preset = boards.loadPreset('sandbox');
    const [top] = await models.Layers.findAll({ where: { Game_ID: game.Game_ID } });
    const tiles = await models.Tiles.findAll({ where: { Layer_ID: top.Layer_ID } });

    for (const drawn of preset.layers[0].tiles) {
      const stored = tiles.find((t) => t.X_Position === drawn.X_Position && t.Y_Position === drawn.Y_Position);
      expect(stored.Tile_Type).toBe(drawn.Tile_Type);
    }
  });

  it('chains the layers top to bottom the way the file is drawn', async () => {
    const game = await seedGame();
    await run({ preset: 'legacy-fourlayer', game: game.Game_ID });

    const layers = await models.Layers.findAll({ where: { Game_ID: game.Game_ID } });
    expect(layers).toHaveLength(4);
    expect(layers[0].Layer_Above).toBeNull();
    expect(layers[layers.length - 1].Layer_Below).toBeNull();
    for (let i = 0; i < layers.length - 1; i++) {
      expect(layers[i].Layer_Below).toBe(layers[i + 1].Layer_ID);
      expect(layers[i + 1].Layer_Above).toBe(layers[i].Layer_ID);
    }
  });

  it('leaves two games with their own boards', async () => {
    const first = await seedGame();
    const second = await seedGame();
    await run({ preset: 'sandbox', game: first.Game_ID });
    await run({ preset: 'sandbox', game: second.Game_ID });

    const firstLayers = await models.Layers.findAll({ where: { Game_ID: first.Game_ID } });
    const secondLayers = await models.Layers.findAll({ where: { Game_ID: second.Game_ID } });
    expect(firstLayers).toHaveLength(2);
    expect(secondLayers).toHaveLength(2);
    expect(firstLayers.map((l) => l.Layer_ID)).not.toEqual(expect.arrayContaining(secondLayers.map((l) => l.Layer_ID)));
    expect(await models.Tiles.count()).toBe(2 * (81 + 49));
  });

  it('refuses a second board for the same game, then replaces it on request', async () => {
    const game = await seedGame();
    await run({ preset: 'sandbox', game: game.Game_ID });

    const refused = await run({ preset: 'legacy-fourlayer', game: game.Game_ID });
    expect(refused.reason).toBe(REJECTIONS.BOARD_EXISTS);
    expect(await models.Layers.count()).toBe(2);

    const replaced = await run({ preset: 'legacy-fourlayer', game: game.Game_ID, replace: true });
    expect(replaced.ok).toBe(true);
    expect(replaced.data.removedLayers).toBe(2);
    expect(await models.Layers.count()).toBe(4);
    expect(await models.Tiles.count()).toBe(121 + 81 + 81 + 64);
  });

  it('will not pull the board out from under a standing player', async () => {
    const game = await seedGame();
    await run({ preset: 'sandbox', game: game.Game_ID });
    const [layer] = await models.Layers.findAll({ where: { Game_ID: game.Game_ID } });
    await seedPlayer(game.Game_ID, { discordId: '1', x: 1, y: 1, layerId: layer.Layer_ID });

    const result = await run({ preset: 'sandbox', game: game.Game_ID, replace: true });
    expect(result.reason).toBe(REJECTIONS.BOARD_IN_USE);
    expect(await models.Tiles.count()).toBe(81 + 49);
  });

  it('rejects an unknown game without writing anything', async () => {
    const result = await run({ preset: 'sandbox', game: 999 });
    expect(result.reason).toBe(REJECTIONS.NO_SUCH_GAME);
    expect(await models.Layers.count()).toBe(0);
    expect(await models.Tiles.count()).toBe(0);
  });
});
