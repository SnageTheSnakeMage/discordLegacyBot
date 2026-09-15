const { readOptions, readActor, toDiscord } = require('../_adapter.js');
const { buildData, optionSpec } = require('../_catalog.js');
const { runLogged } = require('../_logging.js');
const logic = require('./weaponize.logic.js');

module.exports = {
    data: buildData('weaponize'),
    async execute(interaction) {
        // the old code called an undefined deferReply(interaction) helper; a
        // plain public defer is what it meant to do
        await interaction.deferReply();
        const input = logic.parse(
            readOptions(interaction, optionSpec('weaponize')),
            readActor(interaction),
        );
        const result = await runLogged('weaponize', logic, input);
        await interaction.editReply(toDiscord(logic.present(result)));
    },
};
