/**
 * Unit tests for the conjure command.
 */
const { createMockInteraction } = require('../../helpers/mockInteraction');
const { createFakeGame, createFakePlayer, createFakeClass, createFakeTile } = require('../../helpers/mockUtils');

jest.mock('discord.js', () => require('../../helpers/mockDiscord').createDiscordMock());
jest.mock('../../../utils', () => require('../../helpers/mockUtils').createUtilsMock());

const utils = require('../../../utils');
const conjure = require('../../../commands/Class Commands/conjure');

describe('conjure command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    utils.getOldestActiveGameId.mockResolvedValue(1);
    utils.checkGameState.mockResolvedValue(false);
    utils.getTileCordinatesOfLine.mockReturnValue([[0, 0], [1, 1]]);
    const game = createFakeGame({ Game_ID: 1 });
    const player = createFakePlayer({ Game_ID: 1, Discord_ID: '123' });
    const playerClass = createFakeClass();
    const tile = createFakeTile({ Layer_ID: 1 });
    utils.models.Games.findByPk.mockResolvedValue(game);
    utils.models.Players.findOne.mockResolvedValue(player);
    utils.models.Classes.findByPk.mockResolvedValue(playerClass);
    utils.models.Tiles.findByPk.mockResolvedValue(tile);
    utils.models.Tiles.findOne.mockResolvedValue(tile);
  });

  it('exports data and execute', () => {
    expect(conjure.data).toBeDefined();
    expect(conjure.execute).toBeDefined();
    expect(typeof conjure.execute).toBe('function');
  });

  it('defers reply', async () => {
    const interaction = createMockInteraction({ options: { x: 1, y: 1, game: 1 } });
    await conjure.execute(interaction);
    expect(interaction.deferReply).toHaveBeenCalled();
  });
});
