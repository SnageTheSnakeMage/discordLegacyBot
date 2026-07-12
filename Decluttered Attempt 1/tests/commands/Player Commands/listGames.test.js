/**
 * Unit tests for the listgames command.
 */
const { createMockInteraction } = require('../../helpers/mockInteraction');
const { createFakeGame } = require('../../helpers/mockUtils');

jest.mock('discord.js', () => require('../../helpers/mockDiscord').createDiscordMock());
jest.mock('../../../utils', () => ({
  models: {
    Games: { findAll: jest.fn() },
  },
}));

const utils = require('../../../utils');
const listGames = require('../../../commands/Player Commands/listGames');

describe('listGames command', () => {
  beforeEach(() => jest.clearAllMocks());

  it('exports data and execute', () => {
    expect(listGames.data).toBeDefined();
    expect(listGames.execute).toBeDefined();
    expect(typeof listGames.execute).toBe('function');
  });

  it('defers then editReplies with game list when games exist', async () => {
    const interaction = createMockInteraction({ options: {} });
    const fakeGames = [
      createFakeGame({ Game_ID: 1, GAME_STATE: 'ACTIVE', CURR_CC_EVENT: 'BOOOORRRINNNG', winner: null }),
    ];
    utils.models.Games.findAll.mockResolvedValue(fakeGames);

    await listGames.execute(interaction);
    await new Promise((r) => setImmediate(r));

    expect(interaction.deferReply).toHaveBeenCalled();
    expect(utils.models.Games.findAll).toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalled();
    const editArg = interaction.editReply.mock.calls[0][0];
    const content = typeof editArg === 'string' ? editArg : editArg?.content;
    expect(content).toContain('Game ID:');
  });

  it('editReplies with empty list when no games', async () => {
    const interaction = createMockInteraction({ options: {} });
    utils.models.Games.findAll.mockResolvedValue([]);

    await listGames.execute(interaction);
    await new Promise((r) => setImmediate(r));

    expect(interaction.deferReply).toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalled();
    const editArg = interaction.editReply.mock.calls[0][0];
    const content = typeof editArg === 'string' ? editArg : editArg?.content;
    expect(content).toBe('');
  });
});
