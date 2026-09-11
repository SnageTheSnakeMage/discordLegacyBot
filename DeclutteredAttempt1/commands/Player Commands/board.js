const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { readOptions, readActor, toDiscord } = require('../_adapter.js');
const { runLogged } = require('../_logging.js');
const logic = require('./board.logic.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('board')
    .setDescription('shows the grid that you are on without input, and the inputted grid if given and your an Oracle')
    .addIntegerOption(option =>
      option.setName('game')
        .setDescription('which grid to show from which game, defaults to oldest active game')
        .setRequired(false))
    .addIntegerOption(option =>
      option.setName('layer')
        .setDescription('which layer of that grid to show, defaults to the one you are on')
        .setRequired(false))
    .addIntegerOption(option =>
      option.setName('body')
        .setDescription('(FOR TWIN CLASS) Which body you are trying to see, defaults to 1')
        .setRequired(false)
      .addChoices(
        { name: "Body 1", value: 1 },
        { name: "Body 2", value: 2 }
      )),
  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const input = logic.parse(
      readOptions(interaction, { game: 'integer', layer: 'integer', body: 'integer' }),
      readActor(interaction),
    );
    const result = await runLogged('board', logic, input);
    await interaction.editReply(toDiscord(logic.present(result)));
  },
};
