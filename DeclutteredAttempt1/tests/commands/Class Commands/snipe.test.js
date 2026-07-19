/**
 * Unit tests for the snipe command.
 */
const { createMockInteraction } = require('../../helpers/mockInteraction');
const { createFakeGame, createFakePlayer, createFakeClass, createFakeTile } = require('../../helpers/mockUtils');

jest.mock('discord.js', () => require('../../helpers/mockDiscord').createDiscordMock());
jest.mock('../../../utils', () => require('../../helpers/mockUtils').createUtilsMock());

const utils = require('../../../utils');
const snipe = require('../../../commands/Class Commands/snipe');

describe('snipe command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    utils.getOldestActiveGameId.mockResolvedValue(1);
    utils.checkGameState.mockResolvedValue(false);
    utils.getTileCordinatesOfLine.mockReturnValue([[0, 0], [1, 1]]);
    const game = createFakeGame({ Game_ID: 1 });
    const player = createFakePlayer({ Game_ID: 1, Discord_ID: '123', Range_: 10 });
    const playerClass = createFakeClass({ Class_Name: 'Sniper' });
    const tile = createFakeTile({ Layer_ID: 1 });
    utils.models.Games.findByPk.mockResolvedValue(game);
    utils.models.Players.findOne.mockResolvedValue(player);
    utils.models.Classes.findByPk.mockResolvedValue(playerClass);
    utils.models.Tiles.findByPk.mockResolvedValue(tile);
    utils.models.Tiles.findOne.mockResolvedValue(tile);
  });

  it('exports data and execute', () => {
    expect(snipe.data).toBeDefined();
    expect(snipe.execute).toBeDefined();
    expect(typeof snipe.execute).toBe('function');
  });

  it('defers reply when command runs', async () => {
    utils.models.Tiles.findOne.mockResolvedValue(createFakeTile({ X_Position: 1, Y_Position: 1, Layer_ID: 1 }));
    const interaction = createMockInteraction({ options: { x: 1, y: 1, target: { id: '456' }, game: 1 } });
    try {
      await snipe.execute(interaction);
      expect(interaction.deferReply).toHaveBeenCalled();
    } catch (e) {
      expect(interaction.deferReply).toHaveBeenCalled();
    }
  });
});
