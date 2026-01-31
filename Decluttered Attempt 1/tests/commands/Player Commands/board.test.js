/**
 * Unit tests for the board command.
 */
const { createMockInteraction } = require('../../helpers/mockInteraction');
const { createFakeGame, createFakePlayer, createFakeClass, createFakeTile } = require('../../helpers/mockUtils');

jest.mock('discord.js', () => require('../../helpers/mockDiscord').createDiscordMock());
jest.mock('../../../utils', () => require('../../helpers/mockUtils').createUtilsMock());

const utils = require('../../../utils');
const board = require('../../../commands/Player Commands/board');

describe('board command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    utils.getOldestActiveGameId.mockResolvedValue(1);
    const game = createFakeGame({ Game_ID: 1 });
    const player = createFakePlayer({ Game_ID: 1 });
    const playerClass = createFakeClass();
    const tile = createFakeTile({ Layer_ID: 1 });
    utils.models.Games.findByPk.mockResolvedValue(game);
    utils.models.Players.findOne.mockResolvedValue(player);
    utils.models.Classes.findByPk.mockResolvedValue(playerClass);
    utils.models.Tiles.findByPk.mockResolvedValue(tile);
    utils.models.Layers.findOne.mockResolvedValue({ Layer_ID: 1 });
  });

  it('exports data and execute', () => {
    expect(board.data).toBeDefined();
    expect(board.execute).toBeDefined();
    expect(typeof board.execute).toBe('function');
  });

  it('defers reply', async () => {
    const interaction = createMockInteraction({ options: { game: 1 } });
    await board.execute(interaction);
    expect(interaction.deferReply).toHaveBeenCalled();
  });
});
