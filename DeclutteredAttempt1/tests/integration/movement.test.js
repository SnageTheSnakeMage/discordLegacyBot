/**
 * Movement against the real in-memory schema - the flagship integration
 * tests. Two things only a real database can prove:
 *
 *  - the #78 invariant survives a move (a fake models object will happily
 *    accept writes that leave the two sides of the board disagreeing)
 *  - the mine path fires at all. It was dead for months because the code
 *    read endTile.Trapped while the column is `trapped`; a mock accepts any
 *    column name, so no unit test could ever have caught it. The mutation
 *    check in the Part 3 acceptance criteria re-breaks exactly that.
 */
const { freshDb, closeDb, models, utils } = require('./helpers/testDb.js');
const {
  seedGame, seedLayer, seedPlayer, assertBoardConsistent, boardAscii,
} = require('./helpers/seed.js');
const moveLogic = require('../../commands/Player Commands/move.logic.js');

const DEPS = () => ({ models, utils, now: () => 1700000000000, random: () => 0 });

describe('movement', () => {
  beforeEach(freshDb);
  afterAll(closeDb);

  async function board(width = 5, height = 5) {
    const game = await seedGame({ moveCost: 1, mineDmg: 1, fireDmg: 1 });
    const layer = await seedLayer(game.Game_ID, { width, height });
    return { game, layer };
  }

  it('a move relocates the player and keeps both sides of the invariant', async () => {
    const { game, layer } = await board();
    const walker = await seedPlayer(game.Game_ID, {
      discordId: '1', x: 1, y: 1, layerId: layer.Layer_ID, Action_Points: 8,
    });
    const startTileId = walker.Tile_ID;

    const result = await moveLogic.run(
      { gameId: game.Game_ID, direction: 'east', distance: 1, path: null, body: 1, discordId: '1' },
      DEPS(),
    );

    expect(result.ok).toBe(true);
    const after = await models.Players.findByPk(walker.Player_ID);
    expect(after.Tile_ID).not.toBe(startTileId);
    const dest = await models.Tiles.findByPk(after.Tile_ID);
    expect([dest.X_Position, dest.Y_Position]).toEqual([2, 1]);

    // the tile the player left must no longer reference them
    const start = await models.Tiles.findByPk(startTileId);
    expect([start.Player1, start.Player2, start.Player3, start.Player4]).not.toContain(walker.Player_ID);
    await assertBoardConsistent(game.Game_ID);
  });

  it('a move costs AP', async () => {
    const { game, layer } = await board();
    const walker = await seedPlayer(game.Game_ID, {
      discordId: '1', x: 1, y: 1, layerId: layer.Layer_ID, Action_Points: 8,
    });

    await moveLogic.run(
      { gameId: game.Game_ID, direction: 'east', distance: 1, path: null, body: 1, discordId: '1' },
      DEPS(),
    );

    expect((await models.Players.findByPk(walker.Player_ID)).Action_Points).toBeLessThan(8);
    await assertBoardConsistent(game.Game_ID);
  });

  it('a mine damages whoever steps on it and is consumed', async () => {
    const { game, layer } = await board();
    const walker = await seedPlayer(game.Game_ID, {
      discordId: '1', x: 1, y: 1, layerId: layer.Layer_ID, Health_Points: 5, Action_Points: 8,
    });
    const trapper = await seedPlayer(game.Game_ID, {
      discordId: '2', x: 5, y: 5, layerId: layer.Layer_ID, className: 'Minesweeper',
    });
    const mined = await models.Tiles.findOne({
      where: { Layer_ID: layer.Layer_ID, X_Position: 2, Y_Position: 1 },
    });
    await mined.update({ trapped: true, trapper: trapper.Player_ID });

    const result = await moveLogic.run(
      { gameId: game.Game_ID, direction: 'east', distance: 1, path: null, body: 1, discordId: '1' },
      DEPS(),
    );

    expect(result.ok).toBe(true);
    expect((await models.Players.findByPk(walker.Player_ID)).Health_Points).toBe(5 - game.mineDmg);

    const cleared = await models.Tiles.findByPk(mined.Tile_ID);
    expect(cleared.trapped).toBe(false);
    expect(cleared.trapper).toBeNull();
    await assertBoardConsistent(game.Game_ID);
  });

  it('a rejected move leaves the board byte-identical', async () => {
    const { game, layer } = await board();
    await seedPlayer(game.Game_ID, {
      discordId: '1', x: 1, y: 1, layerId: layer.Layer_ID, Action_Points: 0,
    });
    const before = await boardAscii(layer.Layer_ID);

    const result = await moveLogic.run(
      { gameId: game.Game_ID, direction: 'east', distance: 1, path: null, body: 1, discordId: '1' },
      DEPS(),
    );

    expect(result.ok).toBe(false);
    expect(await boardAscii(layer.Layer_ID)).toBe(before);
    await assertBoardConsistent(game.Game_ID);
  });
});
