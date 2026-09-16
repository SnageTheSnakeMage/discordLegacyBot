const { MessageFlags } = require('discord.js');
const { readOptions, readActor, toDiscord } = require('../_adapter.js');
const { buildData, optionSpec } = require('../_catalog.js');
const { runLogged } = require('../_logging.js');
const logic = require('./trace.logic.js');

module.exports = {
    data: buildData('trace'),
    // ephemeral like /board: a trace is the player scouting a line, and
    // broadcasting it would tell the whole channel what they are lining up
    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const input = logic.parse(
            readOptions(interaction, optionSpec('trace')),
            readActor(interaction),
        );
        const result = await runLogged('trace', logic, input);
        await interaction.editReply(toDiscord(logic.present(result)));
    },
};
