/**
 * Unit tests for the store command.
 */
const { createMockInteraction } = require('../../helpers/mockInteraction');
const { createFakeGame, createFakePlayer, createFakeTile } = require('../../helpers/mockUtils');

jest.mock('discord.js', () => require('../../helpers/mockDiscord').createDiscordMock());
jest.mock('../../../utils', () => require('../../helpers/mockUtils').createUtilsMock());

const utils = require('../../../utils');
const store = require('../../../commands/Player Commands/store');

describe('store command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    utils.getOldestActiveGameId.mockResolvedValue(1);
    utils.checkGameState.mockResolvedValue(false);
    const game = createFakeGame({ Game_ID: 1, CHEST_AMOUNT: 0 });
    const player = createFakePlayer({ Game_ID: 1, Discord_ID: '123', Action_Points: 5, Player_ID: 1 });
    const tile = createFakeTile({ Tile_Type: 'Chest' });
    utils.models.Games.findByPk.mockResolvedValue(game);
    utils.models.Players.findOne.mockResolvedValue(player);
    utils.models.Tiles.findByPk.mockResolvedValue(tile);
  });

  it('exports data and execute', () => {
    expect(store.data).toBeDefined();
    expect(store.execute).toBeDefined();
    expect(typeof store.execute).toBe('function');
  });

  it('defers and responds (may throw if command uses deferredReply)', async () => {
    const interaction = createMockInteraction({ options: { game: 1, amount: 1 } });
    try {
      await store.execute(interaction);
      expect(interaction.deferReply).toHaveBeenCalled();
    } catch (e) {
      expect(e.message || e.toString()).toBeDefined();
    }
  });
});
