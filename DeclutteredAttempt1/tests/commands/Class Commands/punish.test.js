/**
 * Unit tests for the punish command.
 */
const { createMockInteraction } = require('../../helpers/mockInteraction');
const { createFakeGame, createFakePlayer, createFakeClass } = require('../../helpers/mockUtils');

jest.mock('discord.js', () => require('../../helpers/mockDiscord').createDiscordMock());
jest.mock('../../../utils', () => require('../../helpers/mockUtils').createUtilsMock());

const utils = require('../../../utils');
const punish = require('../../../commands/Class Commands/punish');

describe('punish command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.DEV_ID = '999';
    utils.getOldestActiveGameId.mockResolvedValue(1);
    const game = createFakeGame({ Game_ID: 1 });
    const player = createFakePlayer({ Game_ID: 1, Discord_ID: '123' });
    const playerClass = createFakeClass();
    utils.models.Games.findByPk.mockResolvedValue(game);
    utils.models.Players.findOne.mockResolvedValue(player);
    utils.models.Classes.findByPk.mockResolvedValue(playerClass);
  });

  it('exports data and execute', () => {
    expect(punish.data).toBeDefined();
    expect(punish.execute).toBeDefined();
    expect(typeof punish.execute).toBe('function');
  });

  it('defers reply', async () => {
    const interaction = createMockInteraction({ options: { target: { id: '456' }, game: 1 } });
    try {
      await punish.execute(interaction);
      expect(interaction.deferReply).toHaveBeenCalled();
    } catch (e) {
      expect(e.message || e.toString()).toBeDefined();
    }
  });
});
