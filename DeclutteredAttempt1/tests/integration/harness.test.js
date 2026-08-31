/**
 * Proves the harness itself: schema syncs from the models, the seed
 * helpers build a consistent board, and the consistency assertion can
 * actually fail.
 */
const { freshDb, closeDb, models } = require('./helpers/testDb.js');
const {
  seedGame, seedLayer, seedPlayer, assertBoardConsistent, boardAscii,
} = require('./helpers/seed.js');

describe('integration harness', () => {
  beforeEach(freshDb);
  afterAll(closeDb);

  it('creates the full schema from the models', async () => {
    const game = await seedGame();
    expect(game.Game_ID).toBe(1);
    await seedLayer(game.Game_ID, { width: 5, height: 5 });
    expect(await models.Tiles.count()).toBe(25);
  });

  it('seeds players onto both sides of the position invariant', async () => {
    const game = await seedGame();
    const layer = await seedLayer(game.Game_ID);
    const p = await seedPlayer(game.Game_ID, { discordId: '1', x: 2, y: 3, layerId: layer.Layer_ID });
    const tile = await models.Tiles.findOne({ where: { Layer_ID: layer.Layer_ID, X_Position: 2, Y_Position: 3 } });
    expect(tile.Player1).toBe(p.Player_ID);
    expect(p.Tile_ID).toBe(tile.Tile_ID);
    await assertBoardConsistent(game.Game_ID);
  });

  it('assertBoardConsistent actually fails on a desynced board', async () => {
    const game = await seedGame();
    const layer = await seedLayer(game.Game_ID);
    const p = await seedPlayer(game.Game_ID, { discordId: '1', x: 1, y: 1, layerId: layer.Layer_ID });
    // break one side of the invariant: the tile forgets the player while
    // the player still points at the tile
    await models.Tiles.update({ Player1: null }, { where: { Tile_ID: p.Tile_ID } });
    await expect(assertBoardConsistent(game.Game_ID)).rejects.toThrow(/board inconsistent/);
  });

  it('renders a readable board', async () => {
    const game = await seedGame();
    const layer = await seedLayer(game.Game_ID, { width: 3, height: 2 });
    await seedPlayer(game.Game_ID, { discordId: '1', x: 2, y: 1, layerId: layer.Layer_ID });
    expect(await boardAscii(layer.Layer_ID)).toBe('. 1 .\n. . .');
  });
});
