const { readOptions, readActor, toDiscord } = require('../_adapter.js');
const { buildData, optionSpec } = require('../_catalog.js');
const { runLogged } = require('../_logging.js');
const logic = require('./grid_dev.logic.js');

module.exports = {
  data: buildData('grid_dev'),
  // Aliases for text-based commands
  aliases: ['gridDev'],

  // The dev gate stays here and travels into run() as input.isDev (TESTING.md
  // Part 1, order-of-work item 6). It is still an early, silent return: the
  // old code returned before deferring, so a non-dev got no reply at all.
  // Defer style is the command's own: a plain, public deferReply().
  // Delivery is also this command's own: the image is DMed and the deferred
  // reply is deleted, exactly as before.
  async execute(interaction) {
    const isDev = interaction.user.id === process.env.DEV_ID;
    if (!isDev) return;

    await interaction.deferReply();

    const input = logic.parse(
      readOptions(interaction, optionSpec('grid_dev')),
      { ...readActor(interaction), isDev },
    );
    const result = await runLogged('grid_dev', logic, input);
    const reply = toDiscord(logic.present(result));

    if (!result.ok) {
      await interaction.editReply(reply);
      return;
    }
    await interaction.user.send(reply);
    await interaction.deleteReply();
  },
};
