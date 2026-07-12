/**
 * Unit tests for the override command.
 */
const { createMockInteraction } = require('../../helpers/mockInteraction');
const { createFakeGame, createFakePlayer, createFakeClass } = require('../../helpers/mockUtils');

jest.mock('discord.js', () => require('../../helpers/mockDiscord').createDiscordMock());
jest.mock('../../../utils', () => require('../../helpers/mockUtils').createUtilsMock());

const utils = require('../../../utils');
const override = require('../../../commands/Player Commands/override');

describe('override command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const game = createFakeGame({ Game_ID: 1, Game_Game: 1 });
    const player = createFakePlayer({ Game_ID: 1, Discord_ID: '123', Dead: true });
    const playerClass = createFakeClass({ Class_Name: 'Medium' });
    utils.getGame.mockResolvedValue(game);
    utils.getOldestActiveGame.mockResolvedValue(game);
    utils.models.Players.findOne.mockResolvedValue(player);
    utils.models.Classes.findByPk.mockResolvedValue(playerClass);
  });

  it('exports data and execute', () => {
    expect(override.data).toBeDefined();
    expect(override.execute).toBeDefined();
    expect(typeof override.execute).toBe('function');
  });

  it('defers reply', async () => {
    const interaction = createMockInteraction({ options: { option: 1, game: 1 } });
    try {
      await override.execute(interaction);
      expect(interaction.deferReply).toHaveBeenCalled();
    } catch (e) {
      expect(interaction.deferReply).toHaveBeenCalled();
    }
  });
});
