const { readOptions, readActor, toDiscord } = require('../_adapter.js');
const { buildData, optionSpec } = require('../_catalog.js');
const { runLogged } = require('../_logging.js');
const logic = require('./cook.logic.js');

module.exports = {
    data: buildData('cook'),
    async execute(interaction) {
        await interaction.deferReply();
        const input = logic.parse(
            readOptions(interaction, optionSpec('cook')),
            readActor(interaction),
        );
        const result = await runLogged('cook', logic, input);
        await interaction.editReply(toDiscord(logic.present(result)));
    },
};
