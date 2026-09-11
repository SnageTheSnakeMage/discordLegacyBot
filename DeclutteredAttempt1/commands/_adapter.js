/**
 * The one shared Discord boundary for commands. execute() adapters use these
 * three helpers; nothing below the adapter layer touches discord.js.
 *
 * This is the ONLY command-layer file allowed to import discord.js.
 */
const { AttachmentBuilder } = require('discord.js');

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
 * Turns a present() descriptor into what editReply expects. Descriptors are
 * plain objects: { content }, { embeds: [apiEmbed] }, and/or
 * { files: [{ buffer, name } | { path, name }] }. This is the only place
 * AttachmentBuilder is ever constructed.
 */
function toDiscord(descriptor) {
  const reply = {};
  if (descriptor.content !== undefined) reply.content = descriptor.content;
  if (descriptor.embeds) reply.embeds = descriptor.embeds;
  if (descriptor.files) {
    reply.files = descriptor.files.map((f) =>
      new AttachmentBuilder(f.buffer !== undefined ? f.buffer : f.path, { name: f.name }));
  }
  return reply;
}

module.exports = { readOptions, readActor, toDiscord };
