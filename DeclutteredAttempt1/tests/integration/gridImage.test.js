/**
 * utils.GenerateGameGridImage against a real database and the real canvas.
 *
 * It read a variable called layerDbId that the function never declared, so
 * every call threw ReferenceError - /board and /grid_dev were dead on any
 * real database while every unit test passed, because the tests ran against
 * the hand-maintained __mocks__ copy where the variable did exist. The
 * mock is gone; this is the test that would have caught it.
 */
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

  it('takes the layer id as a string, the way /grid_dev passes it', async () => {
    const { game, layers } = await seedBoard();
    const buffer = await utils.GenerateGameGridImage(String(game.Game_ID), String(layers[1].Layer_ID));
    expect(Buffer.isBuffer(buffer)).toBe(true);
  });
});
