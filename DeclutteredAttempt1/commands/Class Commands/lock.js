const { readOptions, readActor, toDiscord } = require('../_adapter.js');
const { buildData, optionSpec } = require('../_catalog.js');
const { runLogged } = require('../_logging.js');
const logic = require('./lock.logic.js');

module.exports = {
    data: buildData('lock'),
    async execute(interaction) {
        await interaction.deferReply();
        const input = logic.parse(
            readOptions(interaction, optionSpec('lock')),
            readActor(interaction),
        );
        const result = await runLogged('lock', logic, input);
        await interaction.editReply(toDiscord(logic.present(result)));
    },
};
