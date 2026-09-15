const { readOptions, readActor, toDiscord } = require('../_adapter.js');
const { buildData, optionSpec } = require('../_catalog.js');
const { runLogged } = require('../_logging.js');
const logic = require('./override.logic.js');

module.exports = {
    data: buildData('override'),
    async execute(interaction) {
        await interaction.deferReply();
        const input = logic.parse(
            readOptions(interaction, optionSpec('override')),
            readActor(interaction),
        );
        const result = await runLogged('override', logic, input);
        await interaction.editReply(toDiscord(logic.present(result)));
    },
};
