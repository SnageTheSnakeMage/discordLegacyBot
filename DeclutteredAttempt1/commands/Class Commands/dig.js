const { readOptions, readActor, toDiscord } = require('../_adapter.js');
const { buildData, optionSpec } = require('../_catalog.js');
const { runLogged } = require('../_logging.js');
const logic = require('./dig.logic.js');

module.exports = {
    data: buildData('dig'),
    async execute(interaction) {
        await interaction.deferReply();
        const input = logic.parse(
            readOptions(interaction, optionSpec('dig')),
            readActor(interaction),
        );
        const result = await runLogged('dig', logic, input);
        await interaction.editReply(toDiscord(logic.present(result)));
    },
};
