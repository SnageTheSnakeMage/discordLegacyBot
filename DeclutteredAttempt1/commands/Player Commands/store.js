const { readOptions, readActor, toDiscord } = require('../_adapter.js');
const { buildData, optionSpec } = require('../_catalog.js');
const { runLogged } = require('../_logging.js');
const logic = require('./store.logic.js');

module.exports = {
    data: buildData('store'),
    async execute(interaction) {
        // the old code called the undefined helper deferredReply(interaction);
        // plain deferReply() per TESTING.md - that is a crash fix
        await interaction.deferReply();
        const input = logic.parse(
            readOptions(interaction, optionSpec('store')),
            readActor(interaction),
        );
        const result = await runLogged('store', logic, input);
        await interaction.editReply(toDiscord(logic.present(result)));
    },
};
