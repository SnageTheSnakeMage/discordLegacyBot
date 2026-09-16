const { MessageFlags } = require('discord.js');
const { readOptions, readActor, toDiscord } = require('../_adapter.js');
const { buildData, optionSpec } = require('../_catalog.js');
const { runLogged } = require('../_logging.js');
const logic = require('./sandbox.logic.js');

module.exports = {
    data: buildData('sandbox'),

    // ephemeral throughout: every subcommand is debug output for the person
    // who asked, and a sandbox game usually shares a channel with whatever
    // else is going on
    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const input = logic.parse(
            {
                ...readOptions(interaction, optionSpec('sandbox')),
                subcommand: interaction.options.getSubcommand(),
            },
            readActor(interaction),
        );
        const result = await runLogged('sandbox', logic, input);
        await interaction.editReply(toDiscord(logic.present(result)));
    },
};
