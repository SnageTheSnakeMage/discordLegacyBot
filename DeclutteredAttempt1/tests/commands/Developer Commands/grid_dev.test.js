/**
 * Unit tests for the grid_dev command.
 */
const { createMockInteraction } = require('../../helpers/mockInteraction');

jest.mock('discord.js', () => require('../../helpers/mockDiscord').createDiscordMock());
jest.mock('../../../utils', () => require('../../helpers/mockUtils').createUtilsMock());

const utils = require('../../../utils');
const grid_dev = require('../../../commands/Developer Commands/grid_dev');

describe('grid_dev command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.DEV_ID = '123';
    utils.getOldestActiveGameId.mockResolvedValue(1);
    utils.models.Games.findByPk.mockResolvedValue({ Game_ID: 1 });
    utils.models.Layers.findAll.mockResolvedValue([]);
  });

  it('exports data and execute', () => {
    expect(grid_dev.data).toBeDefined();
    expect(grid_dev.execute).toBeDefined();
    expect(typeof grid_dev.execute).toBe('function');
  });

  it('defers reply when user is dev', async () => {
    const interaction = createMockInteraction({ user: { id: '123' }, options: { game: 1 } });
    await grid_dev.execute(interaction);
    expect(interaction.deferReply).toHaveBeenCalled();
  });
});
