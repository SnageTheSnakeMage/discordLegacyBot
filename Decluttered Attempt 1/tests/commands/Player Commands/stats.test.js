/**
 * Unit tests for the stats command.
 */
const { createMockInteraction } = require('../../helpers/mockInteraction');
const { createFakeGame, createFakePlayer, createFakeClass, createFakeTile } = require('../../helpers/mockUtils');

jest.mock('discord.js', () => require('../../helpers/mockDiscord').createDiscordMock());
jest.mock('../../../utils', () => require('../../helpers/mockUtils').createUtilsMock());

const utils = require('../../../utils');
const stats = require('../../../commands/Player Commands/stats');

describe('stats command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    utils.getOldestActiveGameId.mockResolvedValue(1);
    utils.checkGameState.mockResolvedValue(false);
    utils.dbLayerIDtoCommonLayerID.mockReturnValue(1);
    const game = createFakeGame({ Game_ID: 1, GAMESTATES: 'ACTIVE' });
    const player = createFakePlayer({ Game_ID: 1, Discord_ID: '123' });
    const playerClass = createFakeClass({ Class_Name: 'Soldier' });
    const tile = createFakeTile();
    utils.models.Games.findByPk.mockResolvedValue(game);
    utils.models.Players.findOne.mockResolvedValue(player);
    utils.models.Classes.findByPk.mockResolvedValue(playerClass);
    utils.models.Tiles.findByPk.mockResolvedValue(tile);
  });

  it('exports data and execute', () => {
    expect(stats.data).toBeDefined();
    expect(stats.execute).toBeDefined();
    expect(typeof stats.execute).toBe('function');
  });

  it('defers then replies with embed when player exists', async () => {
    const interaction = createMockInteraction({ options: { game: 1 } });
    await stats.execute(interaction);
    expect(interaction.deferReply).toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ embeds: expect.any(Array) }));
  });

  it('throws when player not found', async () => {
    utils.models.Players.findOne.mockResolvedValue(null);
    const interaction = createMockInteraction({ options: { game: 1 } });
    await expect(stats.execute(interaction)).rejects.toThrow('Player not found');
  });
});
