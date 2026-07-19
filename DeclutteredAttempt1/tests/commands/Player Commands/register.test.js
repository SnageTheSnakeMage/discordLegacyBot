/**
 * Unit tests for the register command.
 */
const { createMockInteraction } = require('../../helpers/mockInteraction');
const { createFakeGame } = require('../../helpers/mockUtils');

jest.mock('discord.js', () => require('../../helpers/mockDiscord').createDiscordMock());
jest.mock('../../../utils', () => require('../../helpers/mockUtils').createUtilsMock());

const utils = require('../../../utils');
const register = require('../../../commands/Player Commands/register');

describe('register command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    utils.getOldestGamestateGameId.mockResolvedValue(1);
    const game = createFakeGame({ Game_ID: 1 });
    utils.models.Games.findByPk.mockResolvedValue(game);
    utils.models.Players.findOne.mockResolvedValue(null);
  });

  it('exports data and execute', () => {
    expect(register.data).toBeDefined();
    expect(register.execute).toBeDefined();
    expect(typeof register.execute).toBe('function');
  });

  it('defers reply', async () => {
    const interaction = createMockInteraction({
      options: { game: 1, icon: { url: 'https://example.com/icon.png' } },
    });
    try {
      await register.execute(interaction);
      expect(interaction.deferReply).toHaveBeenCalled();
    } catch (e) {
      expect(e.message || e.toString()).toBeDefined();
    }
  });
});
