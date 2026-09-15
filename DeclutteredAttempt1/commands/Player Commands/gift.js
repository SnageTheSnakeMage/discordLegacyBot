const { readOptions, readActor, toDiscord } = require('../_adapter.js');
const { buildData, optionSpec } = require('../_catalog.js');
const { runLogged } = require('../_logging.js');
const logic = require('./gift.logic.js');

module.exports = {
    data: buildData('gift'),
    async execute(interaction) {
        await interaction.deferReply();
        const input = logic.parse(
            readOptions(interaction, optionSpec('gift')),
            readActor(interaction),
        );
        const result = await runLogged('gift', logic, input);
        await interaction.editReply(toDiscord(logic.present(result)));
    },
};
