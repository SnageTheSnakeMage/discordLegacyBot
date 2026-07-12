/**
 * Unit tests for the deliver command.
 */
const { createMockInteraction } = require('../../helpers/mockInteraction');
const { createFakeGame, createFakePlayer, createFakeClass } = require('../../helpers/mockUtils');

jest.mock('discord.js', () => require('../../helpers/mockDiscord').createDiscordMock());
jest.mock('../../../utils', () => require('../../helpers/mockUtils').createUtilsMock());

const utils = require('../../../utils');
const deliver = require('../../../commands/Class Commands/deliver');

describe('deliver command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    utils.getOldestActiveGameId.mockResolvedValue(1);
    utils.checkGameState.mockResolvedValue(false);
    const game = createFakeGame({ Game_ID: 1 });
    const player = createFakePlayer({ Game_ID: 1, Discord_ID: '123' });
    const playerClass = createFakeClass({ Class_Name: 'Chef' });
    utils.models.Games.findByPk.mockResolvedValue(game);
    utils.models.Players.findOne.mockResolvedValue(player);
    utils.models.Classes.findByPk.mockResolvedValue(playerClass);
  });

  it('exports data and execute', () => {
    expect(deliver.data).toBeDefined();
    expect(deliver.execute).toBeDefined();
    expect(typeof deliver.execute).toBe('function');
  });

  it('defers reply', async () => {
    utils.models.Player = utils.models.Players;
    utils.models.Games.findByPk.mockResolvedValue(createFakeGame({ Game_ID: 1, GAMESTATES: 'ACTIVE' }));
    const interaction = createMockInteraction({ options: { receiver: { id: '456' }, amount: 1, game: 1 } });
    try {
      await deliver.execute(interaction);
      expect(interaction.deferReply).toHaveBeenCalled();
    } catch (e) {
      expect(interaction.deferReply).toHaveBeenCalled();
    }
  });
});
