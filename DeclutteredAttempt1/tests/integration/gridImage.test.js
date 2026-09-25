/**
 * utils.GenerateGameGridImage against a real database and the real canvas.
 *
 * It read a variable called layerDbId that the function never declared, so
 * every call threw ReferenceError - /board and /grid_dev were dead on any
 * real database while every unit test passed, because the tests ran against
 * the hand-maintained __mocks__ copy where the variable did exist. The
 * mock is gone; this is the test that would have caught it.
 *
 * The same function drew every player of a tile in the top-left quadrant
 * (a for...in index is a string, and the quadrant switch compares it
 * strictly against 0..3) and threw on any trapped tile (`loadTileTexture`
 * called without `this.`). Both are covered below.
 */

const TILE_SIZE = 208;

/** The pixels of one tile of the rendered board, as a flat RGBA array. */
async function tilePixels(buffer, { x = 1, y = 1, quadrant = null } = {}) {
  const image = await Canvas.loadImage(buffer);
  const canvas = Canvas.createCanvas(image.width, image.height);
  canvas.getContext('2d').drawImage(image, 0, 0);
  const half = TILE_SIZE / 2;
  const left = (x - 1) * TILE_SIZE + (quadrant === 'bottomRight' ? half : 0);
  const top = (y - 1) * TILE_SIZE + (quadrant === 'bottomRight' ? half : 0);
  const size = quadrant ? half : TILE_SIZE;
  return Buffer.from(canvas.getContext('2d').getImageData(left, top, size, size).data);
}
const Canvas = require('canvas');
const { freshDb, closeDb, models, utils } = require('./helpers/testDb.js');
const { seedGame, seedPlayer, seedClass } = require('./helpers/seed.js');
const logic = require('../../commands/Developer Commands/createBoard.logic.js');
const boards = require('../../database/boardPresets.js');

const DEV = { discordId: '123', username: 'snage', isDev: true };

/** the sandbox preset, built for a fresh game */
async function seedBoard() {
  const game = await seedGame();
  // the renderer looks the Spy class up by name for every player it draws;
  // a production database always has it (it is seeded from classes.csv)
  await seedClass('Spy');
  const result = await logic.run(
    logic.parse({ preset: 'sandbox', game: game.Game_ID }, DEV),
    { models, boards },
  );
  expect(result.ok).toBe(true);
  const layers = await models.Layers.findAll({ where: { Game_ID: game.Game_ID } });
  return { game, layers };
}

describe('GenerateGameGridImage', () => {
  beforeEach(freshDb);
  afterAll(closeDb);

  it('renders a layer with no player looking at it', async () => {
    const { game, layers } = await seedBoard();
    const buffer = await utils.GenerateGameGridImage(game.Game_ID, layers[0].Layer_ID);
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(0);
    // a PNG, at 208px per tile across a 9x9 layer
    expect(buffer.subarray(1, 4).toString()).toBe('PNG');
  });

  it('renders the layer the viewing player is standing on', async () => {
    const { game, layers } = await seedBoard();
    const player = await seedPlayer(game.Game_ID, { discordId: '1', x: 1, y: 1, layerId: layers[0].Layer_ID });
    const buffer = await utils.GenerateGameGridImage(game.Game_ID, layers[0].Layer_ID, player.Player_ID);
    expect(Buffer.isBuffer(buffer)).toBe(true);
  });

  it('refuses to show a player a layer they are not on', async () => {
    const { game, layers } = await seedBoard();
    const player = await seedPlayer(game.Game_ID, { discordId: '1', x: 1, y: 1, layerId: layers[0].Layer_ID });
    await expect(utils.GenerateGameGridImage(game.Game_ID, layers[1].Layer_ID, player.Player_ID))
      .rejects.toMatch(/only view the layer you are currently on/);
  });

  // #148's other half. The refusal above compared the requested layer against
  // ONE tile - body 1's - so a Twin asking for the layer its second body was
  // standing on was refused for standing where it stood, and the raw string
  // came out of /board as "There was an error while executing this command!".
  it('shows a Twin the layer of its second body', async () => {
    const { game, layers } = await seedBoard();
    const twin = await seedPlayer(game.Game_ID, {
      discordId: '1', x: 1, y: 1, layerId: layers[0].Layer_ID, className: 'Twin',
      secondBody: { x: 2, y: 2, layerId: layers[1].Layer_ID },
    });
    const buffer = await utils.GenerateGameGridImage(game.Game_ID, layers[1].Layer_ID, twin.Player_ID);
    expect(buffer.subarray(1, 4).toString()).toBe('PNG');
  });

  it('still refuses a Twin a layer neither of its bodies is on', async () => {
    const { game, layers } = await seedBoard();
    const twin = await seedPlayer(game.Game_ID, {
      discordId: '1', x: 1, y: 1, layerId: layers[0].Layer_ID, className: 'Twin',
      secondBody: { x: 2, y: 2, layerId: layers[1].Layer_ID },
    });
    // a third layer of the same game, which neither body stands on. It needs
    // no tiles: the refusal is decided before any tile is drawn.
    const foreign = await models.Layers.create({ Game_ID: game.Game_ID, X_Bound: 1, Y_Bound: 1 });
    await expect(utils.GenerateGameGridImage(game.Game_ID, foreign.Layer_ID, twin.Player_ID))
      .rejects.toMatch(/only view the layer you are currently on/);
  });

  it('draws a mine on a trapped tile', async () => {
    const { game, layers } = await seedBoard();
    const tile = await models.Tiles.findOne({
      where: { Layer_ID: layers[0].Layer_ID, X_Position: 1, Y_Position: 1 },
    });
    const before = await utils.GenerateGameGridImage(game.Game_ID, layers[0].Layer_ID);

    await models.Tiles.update({ trapped: true }, { where: { Tile_ID: tile.Tile_ID } });
    // this call threw ReferenceError before: loadTileTexture without `this.`
    const after = await utils.GenerateGameGridImage(game.Game_ID, layers[0].Layer_ID);

    expect(await tilePixels(after, { x: 1, y: 1 })).not.toEqual(await tilePixels(before, { x: 1, y: 1 }));
  });

  it('gives each player on a tile its own quadrant', async () => {
    const { game, layers } = await seedBoard();
    const player = await seedPlayer(game.Game_ID, { discordId: '1', x: 1, y: 1, layerId: layers[0].Layer_ID });
    const empty = await utils.GenerateGameGridImage(game.Game_ID, layers[0].Layer_ID);

    // four occupants of one tile - the renderer looks each slot up separately
    await models.Tiles.update(
      { Player1: player.Player_ID, Player2: player.Player_ID, Player3: player.Player_ID, Player4: player.Player_ID },
      { where: { Tile_ID: player.Tile_ID } },
    );
    const crowded = await utils.GenerateGameGridImage(game.Game_ID, layers[0].Layer_ID);

    // before the fix all four drew top-left and this quadrant kept the
    // bare environment tile
    const at = { x: 1, y: 1, quadrant: 'bottomRight' };
    expect(await tilePixels(crowded, at)).not.toEqual(await tilePixels(empty, at));
  });

  it('takes the layer id as a string, the way /grid_dev passes it', async () => {
    const { game, layers } = await seedBoard();
    const buffer = await utils.GenerateGameGridImage(String(game.Game_ID), String(layers[1].Layer_ID));
    expect(Buffer.isBuffer(buffer)).toBe(true);
  });
});
