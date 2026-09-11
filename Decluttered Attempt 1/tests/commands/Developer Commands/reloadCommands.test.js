/**
 * Unit tests for the reload-commands command.
 */
const { createMockInteraction } = require('../../helpers/mockInteraction');

jest.mock('discord.js', () => {
  const base = require('../../helpers/mockDiscord').createDiscordMock();
  base.PermissionFlagsBits = base.PermissionFlagsBits || { BanMembers: 4 };
  base.InteractionContextType = base.InteractionContextType || { Guild: 0 };
  return base;
});

const reloadCommands = require('../../../commands/Developer Commands/reloadCommands');

describe('reloadCommands command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.DEV_ID = '123';
  });

  it('exports data and execute', () => {
    expect(reloadCommands.data).toBeDefined();
    expect(reloadCommands.execute).toBeDefined();
    expect(typeof reloadCommands.execute).toBe('function');
  });

  it('returns early when user is not dev', async () => {
    process.env.DEV_ID = 'other';
    const interaction = createMockInteraction({ user: { id: '123' }, options: { command: 'stats' } });
    interaction.options.getString = jest.fn(() => 'stats');
    await reloadCommands.execute(interaction);
    expect(interaction.reply).not.toHaveBeenCalled();
  });
});
