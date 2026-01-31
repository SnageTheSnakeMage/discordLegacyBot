/**
 * Unit tests for the resurrect command.
 */
const { createMockInteraction } = require('../../helpers/mockInteraction');
const { createFakeGame, createFakePlayer, createFakeClass } = require('../../helpers/mockUtils');

jest.mock('discord.js', () => require('../../helpers/mockDiscord').createDiscordMock());
jest.mock('../../../utils', () => require('../../helpers/mockUtils').createUtilsMock());

const utils = require('../../../utils');
const resurrect = require('../../../commands/Class Commands/resurrect');

describe('resurrect command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    utils.getOldestActiveGameId.mockResolvedValue(1);
    utils.checkGameState.mockResolvedValue(false);
    utils.commonLayerIDtoDbLayerID.mockResolvedValue(1);
    const game = createFakeGame({ Game_ID: 1 });
    const player = createFakePlayer({ Game_ID: 1, Discord_ID: '123' });
    const playerClass = createFakeClass({ Class_Name: 'Pharaoh' });
    const tile = require('../../helpers/mockUtils').createFakeTile({ Layer_ID: 1 });
    utils.models.Games.findByPk.mockResolvedValue(game);
    utils.models.Players.findOne.mockResolvedValue(player);
    utils.models.Classes.findByPk.mockResolvedValue(playerClass);
    utils.models.Tiles.findOne.mockResolvedValue(tile);
  });

  it('exports data and execute', () => {
    expect(resurrect.data).toBeDefined();
    expect(resurrect.execute).toBeDefined();
    expect(typeof resurrect.execute).toBe('function');
  });

  it('defers reply', async () => {
    const interaction = createMockInteraction({ options: { player: { id: '456' }, x: 0, y: 0, game: 1 } });
    await resurrect.execute(interaction);
    expect(interaction.deferReply).toHaveBeenCalled();
  });
});
