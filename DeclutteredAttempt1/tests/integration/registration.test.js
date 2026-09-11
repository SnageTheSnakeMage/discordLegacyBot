/**
 * registerPlayer against the real in-memory schema: a registration must
 * create the Players row AND claim a tile slot (the #78 invariant), and a
 * Twin must claim two distinct tiles.
 *
 * Seams faked: downloadImageWithFetch (network) and getRandomInt
 * (determinism) - everything else runs for real.
 */
const { freshDb, closeDb, models, utils } = require('./helpers/testDb.js');
const { seedGame, seedLayer, seedClass, assertBoardConsistent } = require('./helpers/seed.js');

describe('registerPlayer', () => {
  beforeEach(async () => {
    await freshDb();
    jest.spyOn(utils, 'downloadImageWithFetch').mockResolvedValue(undefined);
    jest.spyOn(utils, 'getRandomInt').mockReturnValue(0);
  });
  afterAll(closeDb);

  it('creates the player on a tile with both sides of the invariant set', async () => {
    const game = await seedGame();
    await seedLayer(game.Game_ID, { width: 3, height: 3 });
    await seedClass('Soldier');
    jest.spyOn(utils, 'getRandomClass').mockResolvedValue(
      await models.Classes.findOne({ where: { Class_Name: 'Soldier' } }),
    );

    await utils.registerPlayer(game.Game_ID, '111', { url: 'http://example.invalid/icon.png' });

    const player = await models.Players.findOne({ where: { Game_ID: game.Game_ID, Discord_ID: '111' } });
    expect(player).not.toBeNull();
    expect(player.Tile_ID).not.toBeNull();
    const tile = await models.Tiles.findByPk(player.Tile_ID);
    expect([tile.Player1, tile.Player2, tile.Player3, tile.Player4]).toContain(player.Player_ID);
    expect(player.Class_ID).toBe((await models.Classes.findOne({ where: { Class_Name: 'Soldier' } })).Class_ID);
    // stats come from the class columns - the Start_MAX_Range_ fix from #92
    expect(player.MAX_RANGE).toBe(5);
    await assertBoardConsistent(game.Game_ID);
  });

  it('a Twin registration claims two distinct tiles', async () => {
    const game = await seedGame();
    await seedLayer(game.Game_ID, { width: 3, height: 3 });
    await seedClass('Twin');
    jest.spyOn(utils, 'getRandomClass').mockResolvedValue(
      await models.Classes.findOne({ where: { Class_Name: 'Twin' } }),
    );
    // two different spawn rolls
    let call = 0;
    utils.getRandomInt.mockImplementation(() => (call++ % 2 === 0 ? 0 : 3));

    await utils.registerPlayer(game.Game_ID, '222', { url: 'http://example.invalid/icon.png' });

    const twin = await models.Players.findOne({ where: { Game_ID: game.Game_ID, Discord_ID: '222' } });
    expect(twin.Tile_ID).not.toBeNull();
    expect(twin.Tile_ID2).not.toBeNull();
    expect(twin.Tile_ID).not.toBe(twin.Tile_ID2);
    await assertBoardConsistent(game.Game_ID);
  });
});
