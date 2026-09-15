const { readOptions, readActor, toDiscord } = require('../_adapter.js');
const { buildData, optionSpec } = require('../_catalog.js');
const { runLogged } = require('../_logging.js');
const logic = require('./burn.logic.js');

module.exports = {
    data: buildData('burn'),
    async execute(interaction) {
        await interaction.deferReply();
        const input = logic.parse(
            readOptions(interaction, optionSpec('burn')),
            readActor(interaction),
        );
        const result = await runLogged('burn', logic, input);
        await interaction.editReply(toDiscord(logic.present(result)));
    },
};
