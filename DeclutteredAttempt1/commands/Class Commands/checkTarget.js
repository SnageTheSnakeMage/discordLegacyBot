const { readOptions, readActor, toDiscord } = require('../_adapter.js');
const { buildData, optionSpec } = require('../_catalog.js');
const { runLogged } = require('../_logging.js');
const logic = require('./checkTarget.logic.js');

module.exports = {
    data: buildData('check-target'),
    async execute(interaction) {
        await interaction.deferReply();
        const input = logic.parse(
            readOptions(interaction, optionSpec('check-target')),
            readActor(interaction),
        );
        const result = await runLogged('checkTarget', logic, input);
        await interaction.editReply(toDiscord(logic.present(result)));
    },
};
