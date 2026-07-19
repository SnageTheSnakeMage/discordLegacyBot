/**
 * Unit tests for the cook command.
 */
const { createMockInteraction } = require('../../helpers/mockInteraction');
const { createFakeGame, createFakePlayer, createFakeClass } = require('../../helpers/mockUtils');

jest.mock('discord.js', () => require('../../helpers/mockDiscord').createDiscordMock());
jest.mock('../../../utils', () => require('../../helpers/mockUtils').createUtilsMock());

const utils = require('../../../utils');
const cook = require('../../../commands/Class Commands/cook');

describe('cook command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    utils.getOldestActiveGameId.mockResolvedValue(1);
    utils.checkGameState.mockResolvedValue(false);
    const game = createFakeGame({ Game_ID: 1 });
    const player = createFakePlayer({ Game_ID: 1, Discord_ID: '123', Meals: 1 });
    const playerClass = createFakeClass({ Class_Name: 'Chef' });
    utils.models.Games.findByPk.mockResolvedValue(game);
    utils.models.Players.findOne.mockResolvedValue(player);
    utils.models.Classes.findByPk.mockResolvedValue(playerClass);
  });

  it('exports data and execute', () => {
    expect(cook.data).toBeDefined();
    expect(cook.execute).toBeDefined();
    expect(typeof cook.execute).toBe('function');
  });

  it('defers reply', async () => {
    utils.models.Games.findByPk.mockResolvedValue(createFakeGame({ Game_ID: 1, GAMESTATES: 'ACTIVE' }));
    const interaction = createMockInteraction({ options: { customer: { id: '456' }, x: 1, y: 1, game: 1 } });
    try {
      await cook.execute(interaction);
      expect(interaction.deferReply).toHaveBeenCalled();
    } catch (e) {
      expect(interaction.deferReply).toHaveBeenCalled();
    }
  });
});
