/**
 * Unit tests for the change-gamestate command.
 */
const { createMockInteraction } = require('../../helpers/mockInteraction');

jest.mock('discord.js', () => require('../../helpers/mockDiscord').createDiscordMock());
jest.mock('../../../utils', () => require('../../helpers/mockUtils').createUtilsMock());

const utils = require('../../../utils');
const changeGamestate = require('../../../commands/Developer Commands/changeGamestate');

describe('changeGamestate command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.DEV_ID = '123';
    utils.models.Games.update.mockResolvedValue([1]);
  });

  it('exports data and execute', () => {
    expect(changeGamestate.data).toBeDefined();
    expect(changeGamestate.execute).toBeDefined();
    expect(typeof changeGamestate.execute).toBe('function');
  });

  it('replies when user is not dev', async () => {
    process.env.DEV_ID = 'other';
    const interaction = createMockInteraction({
      user: { id: '123' },
      options: { game: 1, gamestate: 'ACTIVE' },
    });
    interaction.options.getInteger = jest.fn((n) => (n === 'game' ? 1 : null));
    interaction.options.getString = jest.fn((n) => (n === 'gamestate' ? 'ACTIVE' : null));
    await changeGamestate.execute(interaction);
    expect(interaction.reply).toHaveBeenCalledWith(expect.stringContaining('dev'));
  });

  it('replies when user is dev and updates game', async () => {
    const interaction = createMockInteraction({
      user: { id: '123' },
      options: { game: 1, gamestate: 'ACTIVE' },
    });
    interaction.options.getInteger = jest.fn((n) => (n === 'game' ? 1 : null));
    interaction.options.getString = jest.fn((n) => (n === 'gamestate' ? 'ACTIVE' : null));
    await changeGamestate.execute(interaction);
    await new Promise((r) => setImmediate(r));
    expect(utils.models.Games.update).toHaveBeenCalled();
  });
});
