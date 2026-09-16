const { readOptions, readActor, toDiscord } = require('../_adapter.js');
const { buildData, optionSpec } = require('../_catalog.js');
const { runLogged } = require('../_logging.js');
const utils = require('../../utils.js');
const logic = require('./move.logic.js');

module.exports = {
  data: buildData('move'),

  async execute(interaction) {
    await interaction.deferReply();
    const input = logic.parse(
      readOptions(interaction, optionSpec('move')),
      readActor(interaction),
    );
    const result = await runLogged('move', logic, input);
    await interaction.editReply(toDiscord(logic.present(result)));

    // a Spy's movement is deleted a few seconds after it is posted
    if (result.ok && result.data.deleteReplyAfterMs) {
      await utils.delay(result.data.deleteReplyAfterMs);
      await interaction.deleteReply();
    }
  },
};
