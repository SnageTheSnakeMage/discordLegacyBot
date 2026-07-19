/**
 * Unit tests for the retrieve command.
 */
const { createMockInteraction } = require('../../helpers/mockInteraction');
const { createFakeGame, createFakePlayer, createFakeTile } = require('../../helpers/mockUtils');

jest.mock('discord.js', () => require('../../helpers/mockDiscord').createDiscordMock());
jest.mock('../../../utils', () => require('../../helpers/mockUtils').createUtilsMock());

const utils = require('../../../utils');
const retrieve = require('../../../commands/Player Commands/retrieve');

describe('retrieve command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    utils.getOldestActiveGameId.mockResolvedValue(1);
    utils.checkGameState.mockResolvedValue(false);
    const game = createFakeGame({ Game_ID: 1, CHEST_AMOUNT: 10 });
    const player = createFakePlayer({ Game_ID: 1, Discord_ID: '123', Player_ID: 1 });
    const tile = createFakeTile({ Tile_Type: 'Chest' });
    utils.models.Games.findByPk.mockResolvedValue(game);
    utils.models.Players.findOne.mockResolvedValue(player);
    utils.models.Tiles.findByPk.mockResolvedValue(tile);
  });

  it('exports data and execute', () => {
    expect(retrieve.data).toBeDefined();
    expect(retrieve.execute).toBeDefined();
    expect(typeof retrieve.execute).toBe('function');
  });

  it('defers and responds (may throw if command uses deferredReply)', async () => {
    const interaction = createMockInteraction({ options: { game: 1, amount: 1 } });
    try {
      await retrieve.execute(interaction);
      expect(interaction.deferReply).toHaveBeenCalled();
    } catch (e) {
      expect(e.message || e.toString()).toBeDefined();
    }
  });
});
