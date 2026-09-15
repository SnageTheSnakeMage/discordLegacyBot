const { MessageFlags } = require('discord.js');
const { readOptions, readActor, toDiscord } = require('../_adapter.js');
const { buildData, optionSpec } = require('../_catalog.js');
const { runLogged } = require('../_logging.js');
const logic = require('./board.logic.js');

module.exports = {
  data: buildData('board'),
  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const input = logic.parse(
      readOptions(interaction, optionSpec('board')),
      readActor(interaction),
    );
    const result = await runLogged('board', logic, input);
    await interaction.editReply(toDiscord(logic.present(result)));
  },
};
