const { readOptions, readActor, toDiscord } = require('../_adapter.js');
const { buildData, optionSpec } = require('../_catalog.js');
const { runLogged } = require('../_logging.js');
const logic = require('./timestop.logic.js');

module.exports = {
    data: buildData('timestop'),
    async execute(interaction) {
        await interaction.deferReply();
        const input = logic.parse(
            readOptions(interaction, optionSpec('timestop')),
            readActor(interaction),
        );
        const result = await runLogged('timestop', logic, input);
        await interaction.editReply(toDiscord(logic.present(result)));
    },
};
