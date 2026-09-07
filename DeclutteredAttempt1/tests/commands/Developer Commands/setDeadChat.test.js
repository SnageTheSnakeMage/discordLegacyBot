/**
 * /set-dead-chat - logic tests. Plain data in, plain data out.
 *
 * The channel id is the whole point of this command, and it is a Discord
 * snowflake: larger than Number.MAX_SAFE_INTEGER, so it has to survive as a
 * string end to end. Several of these exist purely to pin that.
 */
const logic = require('../../../commands/Developer Commands/setDeadChat.logic.js');
const setDeadChat = require('../../../commands/Developer Commands/setDeadChat.js');
const { REJECTIONS } = require('../../../enums.js');
const { createDeps, createFakeGame } = require('../../helpers/mockModels.js');

const DEV = '999';
const CHANNEL = '1392574348333678633';

function happyDeps(over = {}) {
  const game = 'game' in over ? over.game
    : createFakeGame({ Game_ID: 1, deadChatChannelId: null });
  const deps = createDeps({ models: { Games: { findByPk: async () => game } } });
  return { deps, game };
}

const INPUT = {
  gameId: 1, channelId: CHANNEL, channelName: 'dead-chat', isDev: true, discordId: DEV,
};

describe('setDeadChat.parse', () => {
  it('keeps the channel id as a string', () => {
    const input = logic.parse(
      { game: 1, channel: CHANNEL, channelName: 'dead-chat' },
      { discordId: DEV, isDev: true },
    );
    expect(input.channelId).toBe(CHANNEL);
    expect(typeof input.channelId).toBe('string');
  });

  it('nulls an absent channel rather than inventing one', () => {
    const input = logic.parse({ game: 1, channel: null }, { discordId: DEV, isDev: true });
    expect(input.channelId).toBeNull();
  });
});

describe('setDeadChat.run', () => {
  it('writes the channel id and reports the previous one', async () => {
    const { deps } = happyDeps({
      game: createFakeGame({ Game_ID: 1, deadChatChannelId: '111111111111111111' }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result).toEqual({
      ok: true,
      kind: 'deadChatSet',
      data: {
        gameId: 1, channelId: CHANNEL, channelName: 'dead-chat', previousChannelId: '111111111111111111',
      },
    });
    expect(deps.models.Games.update).toHaveBeenCalledWith(
      { deadChatChannelId: CHANNEL },
      { where: { Game_ID: 1 } },
    );
  });

  it('writes the id as a string, never a number', async () => {
    // a snowflake through Number() comes back as ...678600 and points at
    // no channel at all
    const { deps } = happyDeps();
    await logic.run(INPUT, deps);
    const written = deps.models.Games.update.mock.calls[0][0].deadChatChannelId;
    expect(typeof written).toBe('string');
    expect(written).toBe(CHANNEL);
    expect(Number(written)).not.toBe(written);
  });

  it('rejects a non-dev and writes nothing', async () => {
    const { deps } = happyDeps();
    const result = await logic.run({ ...INPUT, isDev: false }, deps);
    expect(result).toEqual({ ok: false, reason: REJECTIONS.NOT_DEV });
    expect(deps.models.Games.update).not.toHaveBeenCalled();
  });

  it('rejects an unknown game', async () => {
    const { deps } = happyDeps({ game: null });
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.NO_SUCH_GAME });
    expect(deps.models.Games.update).not.toHaveBeenCalled();
  });

  it.each([
    ['no channel', null],
    ['not a snowflake', 'general'],
    ['too short', '123'],
    ['too long', '123456789012345678901'],
  ])('rejects %s and writes nothing', async (_label, channelId) => {
    const { deps } = happyDeps();
    const result = await logic.run({ ...INPUT, channelId }, deps);
    expect(result.ok).toBe(false);
    expect(deps.models.Games.update).not.toHaveBeenCalled();
  });
});

describe('setDeadChat.present', () => {
  it('renders the channel as a mention, ephemerally', () => {
    const out = logic.present({
      ok: true,
      kind: 'deadChatSet',
      data: { gameId: 1, channelId: CHANNEL, channelName: 'dead-chat', previousChannelId: null },
    });
    expect(out).toEqual({ content: `Dead chat for game 1 is now <#${CHANNEL}>.`, ephemeral: true });
  });

  it('names the previous channel when it changed', () => {
    const out = logic.present({
      ok: true,
      kind: 'deadChatSet',
      data: { gameId: 2, channelId: CHANNEL, channelName: 'x', previousChannelId: '222222222222222222' },
    });
    expect(out.content).toBe(`Dead chat for game 2 is now <#${CHANNEL}> (was <#222222222222222222>).`);
  });
});

describe('setDeadChat command surface', () => {
  it('declares the game and channel options and is not open to everyone', () => {
    const json = setDeadChat.data.toJSON();
    expect(json.name).toBe('set-dead-chat');
    expect(json.options.map((o) => o.name)).toEqual(['game', 'channel']);
    expect(json.options.every((o) => o.required)).toBe(true);
    expect(json.default_member_permissions).not.toBeNull();
  });
});
