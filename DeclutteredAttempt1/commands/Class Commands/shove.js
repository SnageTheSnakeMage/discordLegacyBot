const { readOptions, readActor, toDiscord } = require('../_adapter.js');
const { buildData, optionSpec } = require('../_catalog.js');
const { runLogged } = require('../_logging.js');
const logic = require('./shove.logic.js');

module.exports = {
  data: buildData('shove'),

  async execute(interaction) {
    await interaction.deferReply();
    const input = logic.parse(
      readOptions(interaction, optionSpec('shove')),
      readActor(interaction),
    );
    const result = await runLogged('shove', logic, input);
    await interaction.editReply(toDiscord(logic.present(result)));
  },
};
