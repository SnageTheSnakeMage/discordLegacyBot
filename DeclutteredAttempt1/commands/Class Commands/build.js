const { readOptions, readActor, toDiscord } = require('../_adapter.js');
const { buildData, optionSpec } = require('../_catalog.js');
const { runLogged } = require('../_logging.js');
const logic = require('./build.logic.js');

module.exports = {
    data: buildData('build'),
    async execute(interaction) {
        await interaction.deferReply();
        const input = logic.parse(
            readOptions(interaction, optionSpec('build')),
            readActor(interaction),
        );
        const result = await runLogged('build', logic, input);
        await interaction.editReply(toDiscord(logic.present(result)));
    },
};
