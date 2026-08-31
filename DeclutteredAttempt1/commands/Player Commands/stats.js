const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { readOptions, readActor, toDiscord } = require('../_adapter.js');
const logic = require('./stats.logic.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stats')
        .setDescription('displays your stats in a given game')
        .addBooleanOption(option =>
            option.setName('visible')
                .setDescription('wether the stats are publicly or privately shown')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option.setName('game')
                .setDescription('which game, defaults to oldest active game')
                .setRequired(false))
        .addUserOption(option =>
            option.setName('player')
            .setDescription("who's stats you want to see, defaults to you.")
            .setRequired(false)
        ),
    async execute(interaction) {
        // legacy defer style: public when visible=true, ephemeral otherwise
        if (interaction.options.getBoolean('visible')) {
            await interaction.deferReply();
        }
        else {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        }
        const raw = readOptions(interaction, { visible: 'boolean', game: 'integer', player: 'user' });
        // the avatar URL lives on the Discord User object, so the adapter
        // resolves it (target if given, else the actor) and passes it as data
        const targetUser = interaction.options.getUser('player') ?? interaction.user;
        raw.playerAvatarURL = targetUser.avatarURL();
        const input = logic.parse(raw, readActor(interaction));
        const result = await logic.run(input);
        await interaction.editReply(toDiscord(logic.present(result)));
    },
};
