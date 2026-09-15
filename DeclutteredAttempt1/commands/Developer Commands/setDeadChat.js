const { readOptions, readActor, toDiscord } = require('../_adapter.js');
const { buildData, optionSpec } = require('../_catalog.js');
const { runLogged } = require('../_logging.js');
const logic = require('./setDeadChat.logic.js');

module.exports = {
  data: buildData('set-dead-chat'),

  // replies directly (no defer): a single row update, well inside the 3s
  // window. Ephemeral, because it is configuration, not game news.
  async execute(interaction) {
    const input = logic.parse(
      readOptions(interaction, optionSpec('set-dead-chat')),
      { ...readActor(interaction), isDev: interaction.user.id === process.env.DEV_ID },
    );
    const result = await runLogged('setDeadChat', logic, input);
    await interaction.reply(toDiscord(logic.present(result)));
  },
};
