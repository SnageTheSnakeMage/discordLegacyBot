/**
 * Unit tests for the heal command.
 */
const { createMockInteraction } = require('../../helpers/mockInteraction');
const { createFakeGame, createFakePlayer, createFakeClass } = require('../../helpers/mockUtils');

jest.mock('discord.js', () => require('../../helpers/mockDiscord').createDiscordMock());
jest.mock('../../../utils', () => require('../../helpers/mockUtils').createUtilsMock());

const utils = require('../../../utils');
const heal = require('../../../commands/Class Commands/heal');

describe('heal command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    utils.getOldestActiveGameId.mockResolvedValue(1);
    utils.checkGameState.mockResolvedValue(false);
    const game = createFakeGame({ Game_ID: 1 });
    const player = createFakePlayer({ Game_ID: 1, Discord_ID: '123' });
    const playerClass = createFakeClass({ Class_Name: 'Doctor' });
    utils.models.Games.findByPk.mockResolvedValue(game);
    utils.models.Players.findOne.mockResolvedValue(player);
    utils.models.Classes.findByPk.mockResolvedValue(playerClass);
  });

  it('exports data and execute', () => {
    expect(heal.data).toBeDefined();
    expect(heal.execute).toBeDefined();
    expect(typeof heal.execute).toBe('function');
  });

  it('defers reply', async () => {
    const interaction = createMockInteraction({ options: { target: { id: '456' }, game: 1 } });
    await heal.execute(interaction);
    expect(interaction.deferReply).toHaveBeenCalled();
  });
});
