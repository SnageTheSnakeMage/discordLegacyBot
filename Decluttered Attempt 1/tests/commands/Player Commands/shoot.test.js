/**
 * Unit tests for the shoot command.
 */
const { createMockInteraction } = require('../../helpers/mockInteraction');
const { createFakeGame, createFakePlayer, createFakeClass, createFakeTile } = require('../../helpers/mockUtils');

jest.mock('discord.js', () => require('../../helpers/mockDiscord').createDiscordMock());
jest.mock('../../../utils', () => require('../../helpers/mockUtils').createUtilsMock());

const utils = require('../../../utils');
const shoot = require('../../../commands/Player Commands/shoot');

describe('shoot command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    utils.getOldestActiveGameId.mockResolvedValue(1);
    utils.checkGameState.mockResolvedValue(false);
    utils.getTileCordinatesOfLine.mockReturnValue([[0, 0], [1, 1]]);
    const game = createFakeGame({ Game_ID: 1, shootCost: 1 });
    const player = createFakePlayer({ Game_ID: 1, Discord_ID: '123', Action_Points: 10, Range_: 5 });
    const playerClass = createFakeClass();
    const shooterTile = createFakeTile({ X_Position: 0, Y_Position: 0, Layer_ID: 1 });
    const targetPlayer = createFakePlayer({ Discord_ID: '456', Tile_ID: 2 });
    const targetTile = createFakeTile({ Tile_ID: 2, X_Position: 1, Y_Position: 1, Layer_ID: 1 });
    utils.models.Games.findByPk.mockResolvedValue(game);
    utils.models.Players.findOne.mockImplementation(({ where }) => {
      if (where?.Discord_ID === '123') return Promise.resolve(player);
      if (where?.Discord_ID === '456') return Promise.resolve(targetPlayer);
      return Promise.resolve(null);
    });
    utils.models.Classes.findByPk.mockResolvedValue(playerClass);
    utils.models.Classes.findOne.mockResolvedValue(playerClass);
    utils.models.Tiles.findByPk.mockImplementation((id) => Promise.resolve(id === 1 ? shooterTile : targetTile));
    utils.models.Tiles.findOne.mockResolvedValue(targetTile);
  });

  it('exports data and execute', () => {
    expect(shoot.data).toBeDefined();
    expect(shoot.execute).toBeDefined();
    expect(typeof shoot.execute).toBe('function');
  });

  it('editReplies with error when not enough AP', async () => {
    utils.models.Players.findOne.mockImplementation(({ where }) => {
      if (where?.Discord_ID === '123') return Promise.resolve(createFakePlayer({ Action_Points: 0 }));
      return Promise.resolve(createFakePlayer({ Discord_ID: '456', Tile_ID: 2 }));
    });
    const interaction = createMockInteraction({
      options: { x: 1, y: 1, target: { id: '456' }, game: 1 },
    });
    await shoot.execute(interaction);
    expect(interaction.deferReply).toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining("don't have enough AP") }));
  });

  it('editReplies when shooter tile is null (error path)', async () => {
    utils.models.Tiles.findByPk.mockResolvedValue(null);
    const interaction = createMockInteraction({
      options: { x: 1, y: 1, target: { id: '456' }, game: 1 },
    });
    await shoot.execute(interaction);
    expect(interaction.deferReply).toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalled();
  });
});
