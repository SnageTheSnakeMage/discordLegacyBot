const { readOptions, readActor, toDiscord } = require('../_adapter.js');
const { buildData, optionSpec } = require('../_catalog.js');
const { runLogged } = require('../_logging.js');
const logic = require('./timestop_dev.logic.js');

module.exports = {
    data: buildData('timestop-dev'),

    // The dev gate stays here and travels into run() as input.isDev (TESTING.md
    // Part 1, order-of-work item 6). It is still an early, silent return: the
    // old code returned before replying, so a non-dev got no reply at all.
    // Defer style is the command's own: it never deferred, both of its old
    // branches replied directly, so the adapter replies directly too.
    async execute(interaction) {
        const isDev = interaction.user.id === process.env.DEV_ID;
        if (!isDev) return;

        const input = logic.parse(
            readOptions(interaction, optionSpec('timestop-dev')),
            { ...readActor(interaction), isDev },
        );
        const result = await runLogged('timestop_dev', logic, input);
        await interaction.reply(toDiscord(logic.present(result)));
    },
};
