const { MessageFlags } = require('discord.js');
const { readOptions, readActor, toDiscord } = require('../_adapter.js');
const { buildData, optionSpec } = require('../_catalog.js');
const { runLogged } = require('../_logging.js');
const utils = require('../../utils.js');
const logic = require('./sandbox.logic.js');

/**
 * ap-tick is the one subcommand whose work cannot happen in run().
 *
 * utils.distributeAP needs a Discord client - it fetches the dead chat
 * channel - and a logic file never receives one. So run() validates and
 * returns the count, and the distributions happen here, where
 * interaction.client exists.
 *
 * runChaosPoll: false skips both halves of the council round trip, so N ticks
 * do not post N polls. The game row is re-read each pass because distributeAP
 * mutates and saves the instance it is given, and other writes inside it go
 * through Games.update without touching that instance.
 */
async function runApTicks(interaction, { gameId, times }) {
    for (let i = 0; i < times; i++) {
        const game = await utils.models.Games.findByPk(gameId);
        await utils.distributeAP(game, 1, interaction.client, { runChaosPoll: false });
    }
}

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
        if (result.ok && result.kind === 'apTick') await runApTicks(interaction, result.data);
        await interaction.editReply(toDiscord(logic.present(result)));
    },
};
