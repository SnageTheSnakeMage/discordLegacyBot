const { readOptions, readActor, toDiscord } = require('../_adapter.js');
const { buildData, optionSpec } = require('../_catalog.js');
const { runLogged } = require('../_logging.js');
const logic = require('./conjure.logic.js');

module.exports = {
    data: buildData('conjure'),
    async execute(interaction) {
        await interaction.deferReply();
        const input = logic.parse(
            readOptions(interaction, optionSpec('conjure')),
            readActor(interaction),
        );
        const result = await runLogged('conjure', logic, input);
        await interaction.editReply(toDiscord(logic.present(result)));
    },
};
