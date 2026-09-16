const { MessageFlags } = require('discord.js');
const { readOptions, readActor, toDiscord } = require('../_adapter.js');
const { buildData, optionSpec } = require('../_catalog.js');
const { runLogged } = require('../_logging.js');
const logic = require('./stats.logic.js');

module.exports = {
    data: buildData('stats'),
    async execute(interaction) {
        // legacy defer style: public when visible=true, ephemeral otherwise
        if (interaction.options.getBoolean('visible')) {
            await interaction.deferReply();
        }
        else {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        }
        const raw = readOptions(interaction, optionSpec('stats'));
        // the avatar URL lives on the Discord User object, so the adapter
        // resolves it (target if given, else the actor) and passes it as data
        const targetUser = interaction.options.getUser('player') ?? interaction.user;
        raw.playerAvatarURL = targetUser.avatarURL();
        const input = logic.parse(raw, readActor(interaction));
        const result = await runLogged('stats', logic, input);
        await interaction.editReply(toDiscord(logic.present(result)));
    },
};
