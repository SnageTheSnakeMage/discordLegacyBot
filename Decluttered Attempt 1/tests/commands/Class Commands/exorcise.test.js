/**
 * Unit tests for the exorcise command.
 */
const { createMockInteraction } = require('../../helpers/mockInteraction');
const { createFakeGame, createFakePlayer, createFakeClass, createFakeTile } = require('../../helpers/mockUtils');

jest.mock('discord.js', () => require('../../helpers/mockDiscord').createDiscordMock());
jest.mock('../../../utils', () => require('../../helpers/mockUtils').createUtilsMock());

const utils = require('../../../utils');
const exorcise = require('../../../commands/Class Commands/exorcise');

describe('exorcise command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    utils.getOldestActiveGameId.mockResolvedValue(1);
    utils.checkGameState.mockResolvedValue(false);
    utils.getTileCordinatesOfLine.mockReturnValue([[0, 0], [1, 1]]);
    const game = createFakeGame({ Game_ID: 1 });
    const player = createFakePlayer({ Game_ID: 1, Discord_ID: '123', Range_: 5 });
    const playerClass = createFakeClass({ Class_Name: 'Exorcist' });
    const tile = createFakeTile({ X_Position: 1, Y_Position: 1, Layer_ID: 1 });
    utils.models.Games.findByPk.mockResolvedValue(game);
    utils.models.Players.findOne.mockResolvedValue(player);
    utils.models.Classes.findByPk.mockResolvedValue(playerClass);
    utils.models.Tiles.findByPk.mockResolvedValue(tile);
    utils.models.Tiles.findOne.mockResolvedValue(tile);
  });

  it('exports data and execute', () => {
    expect(exorcise.data).toBeDefined();
    expect(exorcise.execute).toBeDefined();
    expect(typeof exorcise.execute).toBe('function');
  });

  it('defers reply', async () => {
    const interaction = createMockInteraction({ options: { x: 1, y: 1, game: 1 } });
    interaction.options.getUser = jest.fn(() => null);
    await exorcise.execute(interaction);
    expect(interaction.deferReply).toHaveBeenCalled();
  });
});
