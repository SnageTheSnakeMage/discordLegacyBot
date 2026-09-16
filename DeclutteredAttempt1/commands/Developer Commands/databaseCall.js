const { readOptions, readActor, toDiscord } = require('../_adapter.js');
const { buildData, optionSpec } = require('../_catalog.js');
const { runLogged } = require('../_logging.js');
const logic = require('./databaseCall.logic.js');


module.exports = {
    data: buildData('call-db'),

    // The old execute neither deferred nor replied, so every invocation would
    // have timed out with "the application did not respond" - it defers
    // publicly here, the style the other Developer Commands adapters use. The
    // dev gate lives here and travels into run() as input.isDev.
    async execute(interaction) {
        await interaction.deferReply();
        const input = logic.parse(
            {
                ...readOptions(interaction, optionSpec('call-db')),
                subcommand: interaction.options.getSubcommand(),
            },
            { ...readActor(interaction), isDev: interaction.user.id === process.env.DEV_ID },
        );
        const result = await runLogged('databaseCall', logic, input);
        await interaction.editReply(toDiscord(logic.present(result)));
    },
};
