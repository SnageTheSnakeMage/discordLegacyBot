const { readOptions, readActor, toDiscord } = require('../_adapter.js');
const { buildData, optionSpec } = require('../_catalog.js');
const { runLogged } = require('../_logging.js');
const logic = require('./exorcise.logic.js');

module.exports = {
    data: buildData('exorcise'),
    async execute(interaction) {
        await interaction.deferReply();
        const input = logic.parse(
            readOptions(interaction, optionSpec('exorcise')),
            readActor(interaction),
        );
        const result = await runLogged('exorcise', logic, input);
        await interaction.editReply(toDiscord(logic.present(result)));
    },
};
