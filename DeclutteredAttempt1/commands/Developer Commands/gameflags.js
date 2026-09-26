const { MessageFlags } = require('discord.js');
const { readOptions, readActor, toDiscord } = require('../_adapter.js');
const { buildData, optionSpec } = require('../_catalog.js');
const { runLogged } = require('../_logging.js');
const utils = require('../../utils.js');
const logic = require('./gameflags.logic.js');

module.exports = {
    data: buildData('gameflags'),

    // ephemeral: this is an operator's switch panel, not news for the channel.
    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const input = logic.parse(
            {
                ...readOptions(interaction, optionSpec('gameflags')),
                subcommand: interaction.options.getSubcommand(),
            },
            { ...readActor(interaction), isDev: interaction.user.id === process.env.DEV_ID },
        );
        const result = await runLogged('gameflags', logic, input);
        // gameActive decides whether this game should have an AP check
        // interval, so a flip has to be reconciled. run() never sees the
        // client, so it happens here, where interaction.client exists.
        if (result.ok && result.kind === 'flagSet') await utils.timeCheck(interaction.client);
        await interaction.editReply(toDiscord(logic.present(result)));
    },
};
