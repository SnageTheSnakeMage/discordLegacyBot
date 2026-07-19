/**
 * Unit tests for the create-game command.
 */
const { createMockInteraction } = require('../../helpers/mockInteraction');

jest.mock('discord.js', () => require('../../helpers/mockDiscord').createDiscordMock());
jest.mock('../../../utils', () => require('../../helpers/mockUtils').createUtilsMock());

const utils = require('../../../utils');
const createGame = require('../../../commands/Developer Commands/createGame');

describe('createGame command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.DEV_ID = '123';
    utils.models.Games.create = jest.fn().mockResolvedValue({ Game_ID: 1 });
  });

  it('exports data and execute', () => {
    expect(createGame.data).toBeDefined();
    expect(createGame.execute).toBeDefined();
    expect(typeof createGame.execute).toBe('function');
  });

  it('returns without replying when user is not dev', async () => {
    process.env.DEV_ID = 'other';
    const interaction = createMockInteraction({ user: { id: '123' }, options: {} });
    await createGame.execute(interaction);
    expect(interaction.reply).not.toHaveBeenCalled();
    expect(interaction.deferReply).not.toHaveBeenCalled();
  });
});
