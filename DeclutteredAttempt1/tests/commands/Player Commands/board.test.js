/**
 * Unit tests for the board command.
 */
const { createMockInteraction } = require('../../helpers/mockInteraction');
const { createFakeGame, createFakePlayer, createFakeClass, createFakeTile, createFakeEmptyPlaystate } = require('../../helpers/mockUtils');

jest.mock('discord.js', () => require('../../helpers/mockDiscord').createDiscordMock());
jest.mock('../../../utils', () => require('../../helpers/mockUtils').createUtilsMock());

const utils = require('../../../utils');
const board = require('../../../commands/Player Commands/board');

describe('board basic command check', () => {

  beforeAll(() => {
    const game = createFakeGame()
    const player = createFakePlayer()
    utils.models.Games.findByPk.mockResolvedValue(game);
  });

  it('exports data and execute', () => {
    expect(board.data).toBeDefined();
    expect(board.execute).toBeDefined();
    expect(typeof board.execute).toBe('function');
  });

  it('defers reply when given game', async () => {
    const interaction = createMockInteraction({ options: { game: 1 } });
    await board.execute(interaction);
    expect(interaction.deferReply).toHaveBeenCalled();
  });

  it('defers reply when not given game', async () => {
    const interaction = createMockInteraction({ options: { } });
    await board.execute(interaction);
    expect(interaction.deferReply).toHaveBeenCalled();
  });

  it('edits reply when given game', async () => {
    const interaction = createMockInteraction({ options: { game: 1 } });
    await board.execute(interaction);
    expect(interaction.editReply).toHaveBeenCalled();
  })

  it('edits reply when not given game', async () => {
    const interaction = createMockInteraction({ options: {  } });
    await board.execute(interaction);
    expect(interaction.editReply).toHaveBeenCalled();
  })
});
describe('board use cases', () => {
  beforeEach(()=> {
    jest.clearAllMocks();
    const twin = createFakePlayer({Player_ID: 2, Tile_ID2: createFakeEmptyPlaystate().tiles[0]})
    const player = createFakePlayer({ Game_ID: 1 });
    utils.models.Players.findOne.mockResolvedValue(player);
    utils.models.Classes.findByPk.mockResolvedValue(fakeClass);
    utils.models.Tiles.findByPk.mockResolvedValue(tile);
    utils.models.Layers.findOne.mockResolvedValue({ Layer_ID: 1 });
  })
})
