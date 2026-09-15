const { readOptions, readActor, toDiscord } = require('../_adapter.js');
const { buildData, optionSpec } = require('../_catalog.js');
const { runLogged } = require('../_logging.js');
const logic = require('./freeze.logic.js');

module.exports = {
    data: buildData('freeze'),
    async execute(interaction) {
        await interaction.deferReply();
        const input = logic.parse(
            readOptions(interaction, optionSpec('freeze')),
            readActor(interaction),
        );
        const result = await runLogged('freeze', logic, input);
        await interaction.editReply(toDiscord(logic.present(result)));
    },
};
