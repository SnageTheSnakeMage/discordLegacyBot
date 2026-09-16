const { readOptions, readActor, toDiscord } = require('../_adapter.js');
const { buildData, optionSpec } = require('../_catalog.js');
const { runLogged } = require('../_logging.js');
const logic = require('./hotPotato.logic.js');

module.exports = {
    data: buildData('hotpotato'),
    async execute(interaction) {
        await interaction.deferReply();
        const input = logic.parse(
            readOptions(interaction, optionSpec('hotpotato')),
            readActor(interaction),
        );
        const result = await runLogged('hotPotato', logic, input);
        await interaction.editReply(toDiscord(logic.present(result)));
    },
};
