const { readOptions, readActor, toDiscord } = require('../_adapter.js');
const { buildData, optionSpec } = require('../_catalog.js');
const { runLogged } = require('../_logging.js');
const logic = require('./register.logic.js');

module.exports = {
  data: buildData('register'),

  async execute(interaction) {
    await interaction.deferReply();
    const raw = readOptions(interaction, optionSpec('register'));
    // attachments are not covered by readOptions' spec kinds; flatten to
    // plain data here so the logic layer never sees a discord.js Attachment
    const attachment = interaction.options.getAttachment('icon');
    raw.icon = attachment
      ? { contentType: attachment.contentType, width: attachment.width, height: attachment.height, url: attachment.url }
      : null;
    const input = logic.parse(raw, readActor(interaction));
    const result = await runLogged('register', logic, input);
    await interaction.editReply(toDiscord(logic.present(result)));
  },
};
