const { readOptions, readActor, toDiscord } = require('../_adapter.js');
const { buildData, optionSpec } = require('../_catalog.js');
const { runLogged } = require('../_logging.js');
const logic = require('./retrieve.logic.js');

module.exports = {
    data: buildData('retrieve'),
    async execute(interaction) {
        // the old code called the undefined helper deferredReply(interaction);
        // plain deferReply() per TESTING.md - that is a crash fix
        await interaction.deferReply();
        const input = logic.parse(
            readOptions(interaction, optionSpec('retrieve')),
            readActor(interaction),
        );
        const result = await runLogged('retrieve', logic, input);
        await interaction.editReply(toDiscord(logic.present(result)));
    },
};
