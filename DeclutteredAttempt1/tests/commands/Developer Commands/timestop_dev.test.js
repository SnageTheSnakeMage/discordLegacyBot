/**
 * Unit tests for the timestop_dev command.
 */
const { createMockInteraction } = require('../../helpers/mockInteraction');
const { createFakeGame } = require('../../helpers/mockUtils');

jest.mock('discord.js', () => require('../../helpers/mockDiscord').createDiscordMock());
jest.mock('../../../utils', () => require('../../helpers/mockUtils').createUtilsMock());

const utils = require('../../../utils');
const timestop_dev = require('../../../commands/Developer Commands/timestop_dev');

describe('timestop_dev command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.DEV_ID = '123';
    utils.getOldestActiveGameId.mockResolvedValue(1);
    utils.models.Games.findByPk.mockResolvedValue(createFakeGame({ Game_ID: 1 }));
    utils.models.Games.update.mockResolvedValue([1]);
  });

  it('exports data and execute', () => {
    expect(timestop_dev.data).toBeDefined();
    expect(timestop_dev.execute).toBeDefined();
    expect(typeof timestop_dev.execute).toBe('function');
  });

  it('returns without replying when user is not dev', async () => {
    process.env.DEV_ID = 'other';
    const interaction = createMockInteraction({ user: { id: '123' }, options: { game: 1 } });
    await timestop_dev.execute(interaction);
    expect(interaction.reply).not.toHaveBeenCalled();
  });
});
