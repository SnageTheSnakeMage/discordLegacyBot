const { readOptions, readActor, toDiscord } = require('../_adapter.js');
const { buildData, optionSpec } = require('../_catalog.js');
const { runLogged } = require('../_logging.js');
const logic = require('./punish.logic.js');

module.exports = {
    data: buildData('punish'),
    async execute(interaction) {
        await interaction.deferReply();
        const input = logic.parse(
            readOptions(interaction, optionSpec('punish')),
            readActor(interaction),
        );
        const result = await runLogged('punish', logic, input);
        await interaction.editReply(toDiscord(logic.present(result)));
    },
};
