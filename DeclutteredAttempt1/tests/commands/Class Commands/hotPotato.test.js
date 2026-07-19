/**
 * Unit tests for the hotPotato command.
 */
const { createMockInteraction } = require('../../helpers/mockInteraction');
const { createFakeGame, createFakePlayer, createFakeClass } = require('../../helpers/mockUtils');

jest.mock('discord.js', () => require('../../helpers/mockDiscord').createDiscordMock());
jest.mock('../../../utils', () => require('../../helpers/mockUtils').createUtilsMock());

const utils = require('../../../utils');
const hotPotato = require('../../../commands/Class Commands/hotPotato');

describe('hotPotato command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    utils.getOldestActiveGameId.mockResolvedValue(1);
    utils.checkGameState.mockResolvedValue(false);
    const game = createFakeGame({ Game_ID: 1 });
    const player = createFakePlayer({ Game_ID: 1, Discord_ID: '123' });
    const playerClass = createFakeClass({ Class_Name: 'Hot Potato' });
    utils.models.Games.findByPk.mockResolvedValue(game);
    utils.models.Players.findOne.mockResolvedValue(player);
    utils.models.Classes.findByPk.mockResolvedValue(playerClass);
  });

  it('exports data and execute', () => {
    expect(hotPotato.data).toBeDefined();
    expect(hotPotato.execute).toBeDefined();
    expect(typeof hotPotato.execute).toBe('function');
  });

  it('execute exists and runs', async () => {
    const interaction = createMockInteraction({ options: { x: 1, y: 1, target: { id: '456' }, game: 1 } });
    try {
      await hotPotato.execute(interaction);
      expect(interaction.deferReply).toHaveBeenCalled();
    } catch (e) {
      expect(e.message || e.toString()).toContain('deferReply');
    }
  });
});
