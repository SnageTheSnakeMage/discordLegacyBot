/**
 * Factory for a Discord ChatInputCommandInteraction-like object for unit testing commands.
 * All methods are Jest mocks so tests can assert deferReply, editReply, reply, etc.
 *
 * @param {Object} options
 * @param {Object} [options.options] - Map of option name -> value for getInteger/getString/getUser
 * @param {Object} [options.user] - { id, username } for interaction.user
 * @param {boolean} [options.replied=false]
 * @param {boolean} [options.deferred=false]
 * @returns {Object} Mock interaction
 */
function createMockInteraction({ options = {}, user = { id: '123', username: 'TestUser' }, replied = false, deferred = false } = {}) {
  const optMap = typeof options === 'object' && !Array.isArray(options) ? options : {};

  const getInteger = jest.fn((name) => {
    if (optMap[name] !== undefined) return optMap[name];
    return null;
  });
  const getString = jest.fn((name) => {
    if (optMap[name] !== undefined) return optMap[name];
    return null;
  });
  const getUser = jest.fn((name) => {
    const val = optMap[name];
    if (val && typeof val === 'object' && 'id' in val) return val;
    if (typeof val === 'string') return { id: val, username: 'User' };
    return null;
  });
  const getAttachment = jest.fn((name) => {
    const val = optMap[name];
    if (val && typeof val === 'object' && 'url' in val) return val;
    return null;
  });
  const getBoolean = jest.fn((name) => {
    if (optMap[name] !== undefined) return optMap[name];
    return null;
  });

  return {
    isChatInputCommand: jest.fn(() => true),
    deferReply: jest.fn().mockResolvedValue(undefined),
    reply: jest.fn().mockResolvedValue(undefined),
    editReply: jest.fn().mockResolvedValue(undefined),
    followUp: jest.fn().mockResolvedValue(undefined),
    deleteReply: jest.fn().mockResolvedValue(undefined),
    options: {
      getInteger,
      getString,
      getUser,
      getAttachment,
      getBoolean,
    },
    user: {
      id: user.id || '123',
      username: user.username || 'TestUser',
      avatarURL: jest.fn().mockReturnValue('https://example.com/avatar.png'),
    },
    replied,
    deferred,
  };
}

module.exports = { createMockInteraction };
