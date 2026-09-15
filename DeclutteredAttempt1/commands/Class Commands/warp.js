const { readOptions, readActor, toDiscord } = require('../_adapter.js');
const { buildData, optionSpec } = require('../_catalog.js');
const { runLogged } = require('../_logging.js');
const logic = require('./warp.logic.js');

module.exports = {
    data: buildData('warp'),
    async execute(interaction) {
        await interaction.deferReply();
        const input = logic.parse(
            readOptions(interaction, optionSpec('warp')),
            readActor(interaction),
        );
        const result = await runLogged('warp', logic, input);
        await interaction.editReply(toDiscord(logic.present(result)));
    },
};
