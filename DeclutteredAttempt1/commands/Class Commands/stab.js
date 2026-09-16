const { readOptions, readActor, toDiscord } = require('../_adapter.js');
const { buildData, optionSpec } = require('../_catalog.js');
const { runLogged } = require('../_logging.js');
const logic = require('./stab.logic.js');

module.exports = {
    data: buildData('stab'),
    async execute(interaction) {
        await interaction.deferReply();
        const input = logic.parse(
            readOptions(interaction, optionSpec('stab')),
            readActor(interaction),
        );
        const result = await runLogged('stab', logic, input);
        await interaction.editReply(toDiscord(logic.present(result)));
    },
};
