const { readOptions, readActor, toDiscord } = require('../_adapter.js');
const { buildData, optionSpec } = require('../_catalog.js');
const { runLogged } = require('../_logging.js');
const logic = require('./deliver.logic.js');

module.exports = {
    data: buildData('deliver'),
    async execute(interaction) {
        await interaction.deferReply();
        const input = logic.parse(
            readOptions(interaction, optionSpec('deliver')),
            readActor(interaction),
        );
        const result = await runLogged('deliver', logic, input);
        await interaction.editReply(toDiscord(logic.present(result)));
    },
};
