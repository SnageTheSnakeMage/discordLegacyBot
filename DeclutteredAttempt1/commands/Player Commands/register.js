const { SlashCommandBuilder } = require('discord.js');
const { readOptions, readActor, toDiscord } = require('../_adapter.js');
const logic = require('./register.logic.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('register')
    .setDescription('adds a player to a game')
    .addAttachmentOption(option =>
      option.setName('icon')
        .setDescription('represents your position on the game board, must be a 80x80 pixel png')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('game')
        .setDescription('which game, defaults to oldest registering game')
        .setRequired(false)),

  async execute(interaction) {
    await interaction.deferReply();
    const raw = readOptions(interaction, { game: 'integer' });
    // attachments are not covered by readOptions' spec kinds; flatten to
    // plain data here so the logic layer never sees a discord.js Attachment
    const attachment = interaction.options.getAttachment('icon');
    raw.icon = attachment
      ? { contentType: attachment.contentType, width: attachment.width, height: attachment.height, url: attachment.url }
      : null;
    const input = logic.parse(raw, readActor(interaction));
    const result = await logic.run(input);
    await interaction.editReply(toDiscord(logic.present(result)));
  },
};
