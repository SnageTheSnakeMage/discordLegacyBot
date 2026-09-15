const { readOptions, readActor, toDiscord } = require('../_adapter.js');
const { buildData, optionSpec } = require('../_catalog.js');
const { runLogged } = require('../_logging.js');
const logic = require('./upgrade.logic.js');

module.exports = {
    data: buildData('upgrade'),
    async execute(interaction) {
        await interaction.deferReply();
        const input = logic.parse(
            readOptions(interaction, optionSpec('upgrade')),
            readActor(interaction),
        );
        const result = await runLogged('upgrade', logic, input);
        await interaction.editReply(toDiscord(logic.present(result)));
    },
};
