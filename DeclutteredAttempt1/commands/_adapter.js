/**
 * The one shared Discord boundary for commands. execute() adapters use these
 * three helpers; nothing below the adapter layer touches discord.js.
 *
 * This is the ONLY command-layer file allowed to import discord.js.
 */
const { AttachmentBuilder } = require('discord.js');
const { MAX_CONTENT } = require('./_messages.js');

/**
 * Reads declared options off the interaction into a plain object.
 * spec maps option name -> 'integer' | 'string' | 'boolean' | 'number' |
 * 'user' | 'channel'.
 * Absent options come back null (never undefined), so ?? defaults in parse()
 * behave the same as interaction.options.get*() did.
 * 'user' yields the user's id as a string, plus <name>Username for messages.
 * 'channel' does the same with <name>Name. Both stay STRINGS: a Discord
 * snowflake is larger than Number.MAX_SAFE_INTEGER and does not survive
 * being a JS number.
 */
function readOptions(interaction, spec) {
  const out = {};
  for (const [name, kind] of Object.entries(spec)) {
    switch (kind) {
      case 'integer': out[name] = interaction.options.getInteger(name); break;
      case 'number':  out[name] = interaction.options.getNumber(name); break;
      case 'string':  out[name] = interaction.options.getString(name); break;
      case 'boolean': out[name] = interaction.options.getBoolean(name); break;
      case 'user': {
        const user = interaction.options.getUser(name);
        out[name] = user ? user.id : null;
        out[`${name}Username`] = user ? user.username : null;
        break;
      }
      case 'channel': {
        const channel = interaction.options.getChannel(name);
        out[name] = channel ? String(channel.id) : null;
        out[`${name}Name`] = channel ? channel.name : null;
        break;
      }
      default: throw new Error(`readOptions: unknown option kind "${kind}" for "${name}"`);
    }
    if (out[name] === undefined) out[name] = null;
  }
  return out;
}

/** The acting user as plain data. */
function readActor(interaction) {
  return {
    discordId: interaction.user.id,
    username: interaction.user.username,
  };
}

/**
 * Discord rejects a message whose content is longer than 2000 characters, and
 * rejects one whose content is empty. Both come back as an error from
 * editReply, which lands in interactionCreate's catch, so the player is told
 * "There was an error while executing this command!" with no idea why.
 *
 * Neither is a thing a command should have to remember, so the cap lives here,
 * at the one boundary every reply passes through. A command that wants nicer
 * truncation than a tail marker (databaseCall budgets its JSON block, for
 * instance) still does its own - this only catches what would otherwise be
 * rejected.
 */
const TRUNCATION_MARKER = '\n... (truncated)';

function capContent(content) {
  // present() descriptors are expected to carry a string; anything else is
  // handed on untouched rather than coerced, so a bug stays visible
  if (typeof content !== 'string') return content;
  if (content.length <= MAX_CONTENT) return content;
  return content.slice(0, MAX_CONTENT - TRUNCATION_MARKER.length) + TRUNCATION_MARKER;
}

/**
 * Turns a present() descriptor into what editReply expects. Descriptors are
 * plain objects: { content }, { embeds: [apiEmbed] }, and/or
 * { files: [{ buffer, name } | { path, name }] }. This is the only place
 * AttachmentBuilder is ever constructed.
 */
function toDiscord(descriptor) {
  const reply = {};
  if (descriptor.content !== undefined) reply.content = capContent(descriptor.content);
  if (descriptor.embeds) reply.embeds = descriptor.embeds;
  if (descriptor.files) {
    reply.files = descriptor.files.map((f) =>
      new AttachmentBuilder(f.buffer !== undefined ? f.buffer : f.path, { name: f.name }));
  }
  return reply;
}

module.exports = { readOptions, readActor, toDiscord, MAX_CONTENT };
