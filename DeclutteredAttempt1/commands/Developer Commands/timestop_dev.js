const { SlashCommandBuilder } = require('discord.js');
const { readOptions, readActor, toDiscord } = require('../_adapter.js');
const logic = require('./timestop_dev.logic.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('timestop-dev')
        .setDescription('pauses the game')
        .addIntegerOption(option =>
            option.setName('game')
                .setDescription('which game, defaults to oldest active game')
                .setRequired(false)),

    // The dev gate stays here and travels into run() as input.isDev (TESTING.md
    // Part 1, order-of-work item 6). It is still an early, silent return: the
    // old code returned before replying, so a non-dev got no reply at all.
    // Defer style is the command's own: it never deferred, both of its old
    // branches replied directly, so the adapter replies directly too.
    async execute(interaction) {
        const isDev = interaction.user.id === process.env.DEV_ID;
        if (!isDev) return;

        const input = logic.parse(
            readOptions(interaction, { game: 'integer' }),
            { ...readActor(interaction), isDev },
        );
        const result = await logic.run(input);
        await interaction.reply(toDiscord(logic.present(result)));
    },
};
