/**
 * Unit tests for the warp command.
 */
const { createMockInteraction } = require('../../helpers/mockInteraction');
const { createFakeGame, createFakePlayer, createFakeTile, createFakeLayer } = require('../../helpers/mockUtils');

jest.mock('discord.js', () => require('../../helpers/mockDiscord').createDiscordMock());
jest.mock('../../../utils', () => require('../../helpers/mockUtils').createUtilsMock());

const utils = require('../../../utils');
const warp = require('../../../commands/Player Commands/warp');

describe('warp command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    utils.getOldestActiveGameId.mockResolvedValue(1);
    utils.checkGameState.mockResolvedValue(false);
    const game = createFakeGame({ Game_ID: 1 });
    const player = createFakePlayer({ Game_ID: 1, Discord_ID: '123' });
    const tile = createFakeTile({ Tile_Type: 'Gateway_Open', Layer_ID: 1 });
    const layer = createFakeLayer({ Layer_ID: 1, Layer_Above: 2, Layer_Below: null });
    utils.models.Games.findByPk.mockResolvedValue(game);
    utils.models.Players.findOne.mockResolvedValue(player);
    utils.models.Tiles.findOne.mockResolvedValue(tile);
    utils.models.Layers.findOne.mockResolvedValue(layer);
  });

  it('exports data and execute', () => {
    expect(warp.data).toBeDefined();
    expect(warp.execute).toBeDefined();
    expect(typeof warp.execute).toBe('function');
  });

  it('defers reply when command runs', async () => {
    const interaction = createMockInteraction({ options: { game: 1, 'up-or-down': true } });
    interaction.options.getBoolean = jest.fn((name) => (name === 'up?' || name === 'up-or-down' ? true : null));
    try {
      await warp.execute(interaction);
      expect(interaction.deferReply).toHaveBeenCalled();
    } catch (e) {
      expect(interaction.deferReply).toHaveBeenCalled();
    }
  });
});
