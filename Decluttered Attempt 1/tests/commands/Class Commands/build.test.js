/**
 * Unit tests for the build command.
 */
const { createMockInteraction } = require('../../helpers/mockInteraction');
const { createFakeGame, createFakePlayer, createFakeClass, createFakeTile } = require('../../helpers/mockUtils');

jest.mock('discord.js', () => require('../../helpers/mockDiscord').createDiscordMock());
jest.mock('../../../utils', () => require('../../helpers/mockUtils').createUtilsMock());

const utils = require('../../../utils');
const build = require('../../../commands/Class Commands/build');

describe('build command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    utils.getOldestActiveGameId.mockResolvedValue(1);
    utils.getTileCordinatesOfLine.mockReturnValue([[0, 0], [1, 1]]);
    const game = createFakeGame({ Game_ID: 1 });
    const player = createFakePlayer({ Game_ID: 1, Discord_ID: '123' });
    const playerClass = createFakeClass({ Class_Name: 'Construction Worker' });
    const tile = createFakeTile({ X_Position: 1, Y_Position: 1, Layer_ID: 1 });
    utils.models.Games.findByPk.mockResolvedValue(game);
    utils.models.Players.findOne.mockResolvedValue(player);
    utils.models.Classes.findByPk.mockResolvedValue(playerClass);
    utils.models.Tiles.findByPk.mockResolvedValue(tile);
    utils.models.Tiles.findOne.mockResolvedValue(tile);
  });

  it('exports data and execute', () => {
    expect(build.data).toBeDefined();
    expect(build.execute).toBeDefined();
    expect(typeof build.execute).toBe('function');
  });

  it('editReplies when not Construction Worker', async () => {
    utils.models.Classes.findByPk.mockResolvedValue(createFakeClass({ Class_Name: 'Soldier' }));
    const interaction = createMockInteraction({ options: { wall: true, x: 1, y: 1, game: 1 } });
    interaction.options.getBoolean = jest.fn(() => true);
    await build.execute(interaction);
    expect(interaction.deferReply).toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('Construction Worker') }));
  });
});
