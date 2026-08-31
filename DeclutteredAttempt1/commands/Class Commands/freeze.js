const { SlashCommandBuilder } = require('discord.js');
const { readOptions, readActor, toDiscord } = require('../_adapter.js');
const logic = require('./freeze.logic.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('freeze')
        .setDescription('class command for Snowmen, turn any non-gateway tile in range into an ice tile for 3AP')
        .addIntegerOption(option =>
            option.setName('x')
                .setDescription('X coordinate of which tile to freeze')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('y')
                .setDescription('Y coordinate of which tile to freeze')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('game')
                .setDescription('which game, defaults to oldest active game')
                .setRequired(false)),
    async execute(interaction) {
        await interaction.deferReply();
        const input = logic.parse(
            readOptions(interaction, { x: 'integer', y: 'integer', game: 'integer' }),
            readActor(interaction),
        );
        const result = await logic.run(input);
        await interaction.editReply(toDiscord(logic.present(result)));
    },
};
