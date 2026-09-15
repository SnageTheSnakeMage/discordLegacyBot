const { readOptions, readActor, toDiscord } = require('../_adapter.js');
const { buildData, optionSpec } = require('../_catalog.js');
const { runLogged } = require('../_logging.js');
const logic = require('./hide.logic.js');

module.exports = {
    data: buildData('hide'),
    async execute(interaction) {
        await interaction.deferReply();
        const input = logic.parse(
            readOptions(interaction, optionSpec('hide')),
            readActor(interaction),
        );
        const result = await runLogged('hide', logic, input);
        await interaction.editReply(toDiscord(logic.present(result)));
    },
};
