const { SlashCommandBuilder } = require('discord.js');
const { readOptions, readActor, toDiscord } = require('../_adapter.js');
const { runLogged } = require('../_logging.js');
const logic = require('./shove.logic.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('shove')
    .setDescription('Bully class command: force a player next to you one tile away for 1 AP')
    .addUserOption((option) => option
      .setName('target')
      .setDescription('who you are shoving')
      .setRequired(true))
    .addStringOption((option) => option
      .setName('direction')
      .setDescription('as if you turned to face them: back is straight ahead, left and right are 45 degrees either side')
      .setRequired(true)
      .setChoices(
        { name: 'left', value: 'left' },
        { name: 'back', value: 'back' },
        { name: 'right', value: 'right' },
      ))
    .addIntegerOption((option) => option
      .setName('game')
      .setDescription('which game, defaults to your oldest')
      .setRequired(false)),

  async execute(interaction) {
    await interaction.deferReply();
    const input = logic.parse(
      readOptions(interaction, { target: 'user', direction: 'string', game: 'integer' }),
      readActor(interaction),
    );
    const result = await runLogged('shove', logic, input);
    await interaction.editReply(toDiscord(logic.present(result)));
  },
};
