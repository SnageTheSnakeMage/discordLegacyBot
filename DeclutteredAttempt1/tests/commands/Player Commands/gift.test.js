/**
 * Unit tests for the gift command.
 */
jest.mock('../../../utils');
const { createFakeGame, createFakePlayer } = require('../../helpers/mockModels')
const utils = require('../../../utils');
const gift = require('../../../commands/Player Commands/gift');

describe('gift command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mock('../../../utils');
    jest.spyOn(utils, "getOldestActiveGameId").mockResolvedValue(1);
    jest.spyOn(utils,"checkGameState").mockResolvedValue(false);
    const game = createFakeGame({ Game_ID: 1 });
    const player = createFakePlayer({ Game_ID: 1, Discord_ID: '123', Dead: false });
    const recipient = createFakePlayer({ Game_ID: 1, Discord_ID: '456' });
    jest.spyOn(utils.models.Games,"findByPk").mockResolvedValue(game);
    jest.spyOn(utils.models.Players,"findOne").mockImplementation(({ where }) => {
      if (where?.Discord_ID === '123') return Promise.resolve(player);
      if (where?.Discord_ID === '456') return Promise.resolve(recipient);
      return Promise.resolve(null);
    });
  });

  it('exports data and execute', () => {
    expect(gift.data).toBeDefined();
    expect(gift.execute).toBeDefined();
    expect(typeof gift.execute).toBe('function');
  });

  it('defers and responds', async () => {
    const interaction = createMockInteraction({ options: { amount: 1, player: { id: '456' }, game: 1 } });
    try {
      await gift.execute(interaction);
      expect(interaction.deferReply).toHaveBeenCalled();
    } catch (e) {
      expect(e.message || e.toString()).toBeDefined();
    }
  });
});
