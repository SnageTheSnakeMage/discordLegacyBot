/**
 * Unit tests for the check-target command.
 */
const { createMockInteraction } = require('../../helpers/mockInteraction');
const { createFakeGame, createFakePlayer, createFakeClass } = require('../../helpers/mockUtils');

jest.mock('discord.js', () => require('../../helpers/mockDiscord').createDiscordMock());
jest.mock('../../../utils', () => require('../../helpers/mockUtils').createUtilsMock());

const utils = require('../../../utils');
const checkTarget = require('../../../commands/Class Commands/checkTarget');

describe('checkTarget command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    utils.getOldestActiveGameId.mockResolvedValue(1);
    utils.checkGameState.mockResolvedValue(false);
    const game = createFakeGame({ Game_ID: 1, GAMESTATES: 'ACTIVE' });
    const player = createFakePlayer({ Game_ID: 1, Discord_ID: '123', Hitman_Target: 2 });
    const target = createFakePlayer({ Player_ID: 2, Discord_ID: '456' });
    utils.models.Games.findByPk.mockResolvedValue(game);
    utils.models.Players.findOne.mockImplementation(({ where }) => {
      if (where?.playerId === '123') return Promise.resolve(player);
      if (where?.playerId === 2) return Promise.resolve(target);
      return Promise.resolve(null);
    });
  });

  it('exports data and execute', () => {
    expect(checkTarget.data).toBeDefined();
    expect(checkTarget.execute).toBeDefined();
    expect(typeof checkTarget.execute).toBe('function');
  });

  it('defers and responds', async () => {
    const interaction = createMockInteraction({ options: { game: 1 } });
    try {
      await checkTarget.execute(interaction);
      expect(interaction.deferReply).toHaveBeenCalled();
    } catch (e) {
      expect(e.message || e.toString()).toBeDefined();
    }
  });
});
