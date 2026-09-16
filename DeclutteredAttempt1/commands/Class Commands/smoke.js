const { readOptions, readActor, toDiscord } = require('../_adapter.js');
const { buildData, optionSpec } = require('../_catalog.js');
const { runLogged } = require('../_logging.js');
const logic = require('./smoke.logic.js');

module.exports = {
    data: buildData('smoke'),
    async execute(interaction) {
        await interaction.deferReply();
        const input = logic.parse(
            readOptions(interaction, optionSpec('smoke')),
            readActor(interaction),
        );
        const result = await runLogged('smoke', logic, input);
        await interaction.editReply(toDiscord(logic.present(result)));
    },
};
