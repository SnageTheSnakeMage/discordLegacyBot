/**
 * /set-dead-chat - dev-only: point a game's chaos council at a channel.
 *
 * parse/run/present per TESTING.md Part 1: run() takes plain data and a deps
 * bundle and returns a CommandResult, never an interaction. The
 * process.env.DEV_ID gate stays in the adapter and arrives as input.isDev.
 *
 * Why this command exists: the chaos council posts its poll to the dead
 * chat, and nothing could tell it which channel that is. Games.deadChatChannelId
 * carried one specific server's channel as a schema default, so the feature
 * could only ever have worked in that one guild - and even there it could
 * not, because the column was an INTEGER and a Discord snowflake does not
 * survive as a JS Number (1392574348333678633 became ...678600).
 */
const { REJECTIONS } = require('../../enums.js');
const { messageFor } = require('../_messages.js');
const defaultDeps = require('../_deps.js');

/** Discord snowflakes are 17-20 digits and must stay strings. */
const SNOWFLAKE = /^\d{17,20}$/;

function parse(raw, actor) {
  return {
    gameId: raw.game ?? null,
    // the adapter hands over the resolved channel; null when none was given
    channelId: raw.channel == null ? null : String(raw.channel),
    channelName: raw.channelName ?? null,
    isDev: actor.isDev === true,
    discordId: actor.discordId,
  };
}

async function run(input, deps = defaultDeps) {
  const { models } = deps;

  if (!input.isDev) return { ok: false, reason: REJECTIONS.NOT_DEV };

  if (!input.channelId || !SNOWFLAKE.test(input.channelId)) {
    return {
      ok: false,
      reason: REJECTIONS.INVALID_AMOUNT,
      data: { message: 'That is not a channel this bot can post to.' },
    };
  }

  const game = await models.Games.findByPk(input.gameId);
  if (!game) return { ok: false, reason: REJECTIONS.NO_SUCH_GAME, data: { gameId: input.gameId } };

  await models.Games.update(
    { deadChatChannelId: input.channelId },
    { where: { Game_ID: game.Game_ID } },
  );

  return {
    ok: true,
    kind: 'deadChatSet',
    data: {
      gameId: game.Game_ID,
      channelId: input.channelId,
      channelName: input.channelName,
      previousChannelId: game.deadChatChannelId ?? null,
    },
  };
}

function present(result) {
  if (!result.ok) return { content: messageFor(result.reason, result.data), ephemeral: true };
  const { gameId, channelId, previousChannelId } = result.data;
  const moved = previousChannelId && previousChannelId !== channelId
    ? ` (was <#${previousChannelId}>)` : '';
  return {
    content: `Dead chat for game ${gameId} is now <#${channelId}>${moved}.`,
    ephemeral: true,
  };
}

module.exports = { parse, run, present };
