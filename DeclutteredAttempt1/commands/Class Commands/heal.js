const { readOptions, readActor, toDiscord } = require('../_adapter.js');
const { buildData, optionSpec } = require('../_catalog.js');
const { runLogged } = require('../_logging.js');
const logic = require('./heal.logic.js');

module.exports = {
    data: buildData('heal'),
    async execute(interaction) {
        await interaction.deferReply();
        const input = logic.parse(
            readOptions(interaction, optionSpec('heal')),
            readActor(interaction),
        );
        const result = await runLogged('heal', logic, input);
        await interaction.editReply(toDiscord(logic.present(result)));
    },
};
