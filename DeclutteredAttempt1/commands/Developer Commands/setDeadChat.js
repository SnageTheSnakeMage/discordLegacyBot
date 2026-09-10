const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const { readOptions, readActor, toDiscord } = require('../_adapter.js');
const logic = require('./setDeadChat.logic.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('set-dead-chat')
    .setDescription('point a game\'s chaos council poll at a channel')
    // Discord-side gate as well as the DEV_ID one: this decides where the bot
    // posts, so it should not even appear for ordinary players.
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addIntegerOption((option) => option
      .setName('game')
      .setDescription('which game')
      .setRequired(true))
    .addChannelOption((option) => option
      .setName('channel')
      .setDescription('the dead chat channel')
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(true)),

  // replies directly (no defer): a single row update, well inside the 3s
  // window. Ephemeral, because it is configuration, not game news.
  async execute(interaction) {
    const input = logic.parse(
      readOptions(interaction, { game: 'integer', channel: 'channel' }),
      { ...readActor(interaction), isDev: interaction.user.id === process.env.DEV_ID },
    );
    const result = await logic.run(input);
    await interaction.reply(toDiscord(logic.present(result)));
  },
};
