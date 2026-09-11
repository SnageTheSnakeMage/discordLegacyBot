/**
 * Unit tests for the upgrade command.
 */
const { createMockInteraction } = require('../../helpers/mockInteraction');
const { createFakeGame, createFakePlayer } = require('../../helpers/mockUtils');

jest.mock('discord.js', () => require('../../helpers/mockDiscord').createDiscordMock());
jest.mock('../../../utils', () => require('../../helpers/mockUtils').createUtilsMock());

const utils = require('../../../utils');
const upgrade = require('../../../commands/Player Commands/upgrade');

describe('upgrade command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    utils.getOldestActiveGameId.mockResolvedValue(1);
    utils.getUpgradePrice.mockResolvedValue(5);
    const game = createFakeGame({ Game_ID: 1 });
    const player = createFakePlayer({ Game_ID: 1, Discord_ID: '123', Dead: false, Player_ID: 1 });
    utils.models.Games.findByPk.mockResolvedValue(game);
    utils.models.Players.findOne.mockResolvedValue(player);
  });

  it('exports data and execute', () => {
    expect(upgrade.data).toBeDefined();
    expect(upgrade.execute).toBeDefined();
    expect(typeof upgrade.execute).toBe('function');
  });

  it('editReplies when dead', async () => {
    utils.models.Players.findOne.mockResolvedValue(createFakePlayer({ Dead: true }));
    const interaction = createMockInteraction({ options: { game: 1, stat: 'Health_Points', amount: 1 } });
    await upgrade.execute(interaction);
    expect(interaction.deferReply).toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining("Dead players") }));
  });
});
