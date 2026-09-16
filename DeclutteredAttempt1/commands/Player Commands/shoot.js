const { readOptions, readActor, toDiscord } = require('../_adapter.js');
const { buildData, optionSpec } = require('../_catalog.js');
const { runLogged } = require('../_logging.js');
const logic = require('./shoot.logic.js');

module.exports = {
    data: buildData('shoot'),
    async execute(interaction) {
        await interaction.deferReply();
        const input = logic.parse(
            readOptions(interaction, optionSpec('shoot')),
            readActor(interaction),
        );
        const result = await runLogged('shoot', logic, input);
        await interaction.editReply(toDiscord(logic.present(result)));
    },
};
