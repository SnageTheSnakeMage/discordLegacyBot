/**
 * Unit tests for the move command.
 */
const { createMockInteraction } = require('../../helpers/mockInteraction');
const { createFakeGame, createFakePlayer, createFakeClass, createFakeTile, createFakeLayer } = require('../../helpers/mockUtils');

jest.mock('discord.js', () => require('../../helpers/mockDiscord').createDiscordMock());
jest.mock('../../../utils', () => require('../../helpers/mockUtils').createUtilsMock());

const utils = require('../../../utils');
const move = require('../../../commands/Player Commands/move');

describe('move command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    utils.getOldestActiveGameId.mockResolvedValue(1);
    utils.checkGameState.mockResolvedValue(false);
    utils.getTileCordinatesOfLine.mockReturnValue([[0, 0], [1, 0]]);
    utils.addStartToPathArray = jest.fn().mockReturnValue([]);
    utils.inputPathToArray = jest.fn().mockReturnValue([]);
    utils.moveFromTiletoTile = jest.fn();
    utils.movePlayerToTile = jest.fn().mockResolvedValue(undefined);
    const game = createFakeGame({ Game_ID: 1, moveCost: 1 });
    const player = createFakePlayer({ Game_ID: 1, Discord_ID: '123', Action_Points: 10 });
    const playerClass = createFakeClass();
    const tile = createFakeTile({ X_Position: 0, Y_Position: 0, Layer_ID: 1 });
    const layer = createFakeLayer({ X_Bound: 10, Y_Bound: 10 });
    utils.models.Games.findByPk.mockResolvedValue(game);
    utils.models.Players.findOne.mockResolvedValue(player);
    utils.models.Classes.findByPk.mockResolvedValue(playerClass);
    utils.models.Tiles.findByPk.mockResolvedValue(tile);
    utils.models.Tiles.findOne.mockResolvedValue(tile);
    utils.models.Layers.findOne.mockResolvedValue(layer);
  });

  it('exports data and execute', () => {
    expect(move.data).toBeDefined();
    expect(move.execute).toBeDefined();
    expect(typeof move.execute).toBe('function');
  });

  it('editReplies with error when player not found', async () => {
    utils.models.Players.findOne.mockResolvedValue(null);
    const interaction = createMockInteraction({ options: { game: 1, direction: 'east', distance: 1 } });
    await move.execute(interaction);
    expect(interaction.deferReply).toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('Player not found') }));
  });
});
