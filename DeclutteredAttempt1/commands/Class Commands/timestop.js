const { SlashCommandBuilder } = require('discord.js');
const { readOptions, readActor, toDiscord } = require('../_adapter.js');
const logic = require('./timestop.logic.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('timestop')
        .setDescription('command for Clockwatchers, be the only one who can do anything for 4AP distributions, costs 12AP')
        .addIntegerOption(option =>
            option.setName('game')
                .setDescription('which game, defaults to oldest active game')
                .setRequired(false)),
    async execute(interaction) {
        await interaction.deferReply();
        const input = logic.parse(
            readOptions(interaction, { game: 'integer' }),
            readActor(interaction),
        );
        const result = await logic.run(input);
        await interaction.editReply(toDiscord(logic.present(result)));
    },
};
