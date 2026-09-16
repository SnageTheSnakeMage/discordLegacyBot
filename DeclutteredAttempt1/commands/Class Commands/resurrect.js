const { readOptions, readActor, toDiscord } = require('../_adapter.js');
const { buildData, optionSpec } = require('../_catalog.js');
const { runLogged } = require('../_logging.js');
const logic = require('./resurrect.logic.js');

module.exports = {
    data: buildData('resurrect'),
    async execute(interaction) {
        await interaction.deferReply();
        const input = logic.parse(
            readOptions(interaction, optionSpec('resurrect')),
            readActor(interaction),
        );
        const result = await runLogged('resurrect', logic, input);
        await interaction.editReply(toDiscord(logic.present(result)));
    },
};
