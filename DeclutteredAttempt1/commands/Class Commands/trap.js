const { readOptions, readActor, toDiscord } = require('../_adapter.js');
const { buildData, optionSpec } = require('../_catalog.js');
const { runLogged } = require('../_logging.js');
const logic = require('./trap.logic.js');

module.exports = {
    data: buildData('trap'),
    async execute(interaction) {
        await interaction.deferReply();
        const input = logic.parse(
            readOptions(interaction, optionSpec('trap')),
            readActor(interaction),
        );
        const result = await runLogged('trap', logic, input);
        await interaction.editReply(toDiscord(logic.present(result)));
    },
};
