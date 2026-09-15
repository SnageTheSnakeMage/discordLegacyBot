const { readOptions, readActor, toDiscord } = require('../_adapter.js');
const { buildData, optionSpec } = require('../_catalog.js');
const { runLogged } = require('../_logging.js');
const logic = require('./swap.logic.js');

module.exports = {
    data: buildData('swap'),
    async execute(interaction) {
        await interaction.deferReply();
        const input = logic.parse(
            readOptions(interaction, optionSpec('swap')),
            readActor(interaction),
        );
        const result = await runLogged('swap', logic, input);
        await interaction.editReply(toDiscord(logic.present(result)));
    },
};
