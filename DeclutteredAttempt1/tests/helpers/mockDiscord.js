/**
 * Factory for jest.mock('discord.js') so SlashCommandBuilder and other exports
 * are available when command files are required. Use in test files:
 *   jest.mock('discord.js', () => require('../helpers/mockDiscord').createDiscordMock());
 * (adjust path: ../../helpers for tests under tests/commands/Player Commands/)
 */
function createDiscordMock() {
  const chainable = {
    setName: jest.fn().mockReturnThis(),
    setDescription: jest.fn().mockReturnThis(),
    addIntegerOption: jest.fn().mockReturnThis(),
    addStringOption: jest.fn().mockReturnThis(),
    addUserOption: jest.fn().mockReturnThis(),
    addAttachmentOption: jest.fn().mockReturnThis(),
    addBooleanOption: jest.fn().mockReturnThis(),
    setRequired: jest.fn().mockReturnThis(),
    setMinValue: jest.fn().mockReturnThis(),
    setMaxValue: jest.fn().mockReturnThis(),
    addChoices: jest.fn().mockReturnThis(),
    setDefaultMemberPermissions: jest.fn().mockReturnThis(),
    setContexts: jest.fn().mockReturnThis(),
  };
  return {
    SlashCommandBuilder: jest.fn().mockImplementation(() => chainable),
    EmbedBuilder: jest.fn().mockImplementation(() => ({
      setColor: jest.fn().mockReturnThis(),
      setTitle: jest.fn().mockReturnThis(),
      setDescription: jest.fn().mockReturnThis(),
      setAuthor: jest.fn().mockReturnThis(),
      setThumbnail: jest.fn().mockReturnThis(),
      setImage: jest.fn().mockReturnThis(),
      setTimestamp: jest.fn().mockReturnThis(),
      setFooter: jest.fn().mockReturnThis(),
      addFields: jest.fn().mockReturnThis(),
    })),
    AttachmentBuilder: jest.fn(),
    MessageFlags: { Ephemeral: 64 },
    PermissionFlagsBits: { BanMembers: 4 },
    InteractionContextType: { Guild: 0 },
  };
}

module.exports = { createDiscordMock };
