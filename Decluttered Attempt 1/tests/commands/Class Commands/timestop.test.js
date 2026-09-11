/**
 * Unit tests for the timestop command.
 */
const { createMockInteraction } = require('../../helpers/mockInteraction');
const { createFakeGame, createFakePlayer, createFakeClass } = require('../../helpers/mockUtils');

jest.mock('discord.js', () => require('../../helpers/mockDiscord').createDiscordMock());
jest.mock('../../../utils', () => require('../../helpers/mockUtils').createUtilsMock());

const utils = require('../../../utils');
const timestop = require('../../../commands/Class Commands/timestop');

describe('timestop command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.DEV_ID = '999';
    const game = createFakeGame({ Game_ID: 1 });
    const player = createFakePlayer({ Game_ID: 1, Discord_ID: '123' });
    const playerClass = createFakeClass({ Class_Name: 'Clockwatcher' });
    utils.getGame.mockResolvedValue(game);
    utils.getOldestActiveGame.mockResolvedValue(game);
    utils.models.Games.findByPk.mockResolvedValue(game);
    utils.models.Players.findOne.mockResolvedValue(player);
    utils.models.Classes.findByPk.mockResolvedValue(playerClass);
  });

  it('exports data and execute', () => {
    expect(timestop.data).toBeDefined();
    expect(timestop.execute).toBeDefined();
    expect(typeof timestop.execute).toBe('function');
  });

  it('defers reply', async () => {
    const interaction = createMockInteraction({ options: { game: 1 } });
    await timestop.execute(interaction);
    expect(interaction.deferReply).toHaveBeenCalled();
  });
});
