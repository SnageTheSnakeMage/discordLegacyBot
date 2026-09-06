const { SlashCommandBuilder } = require('discord.js');
const { readOptions, readActor, toDiscord } = require('../_adapter.js');
const logic = require('./exorcise.logic.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('exorcise')
        .setDescription('For Exorcists,turn any non-gateway tile in range to a blank tile(3AP)or remove a players class(16AP)')
        .addIntegerOption(option =>
            option.setName('x')
                .setDescription('X coordinate of which tile to exorcise')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('y')
                .setDescription('Y coordinate of which tile to exorcise')
                .setRequired(true))
        .addUserOption(option =>
            option.setName('player')
                .setDescription('which player to remove a class from, required if you wish to remove a class')
                .setRequired(false))
        .addIntegerOption(option =>
            option.setName('game')
                .setDescription('which game, defaults to oldest active game')
                .setRequired(false)),
    async execute(interaction) {
        await interaction.deferReply();
        const input = logic.parse(
            readOptions(interaction, { x: 'integer', y: 'integer', player: 'user', game: 'integer' }),
            readActor(interaction),
        );
        const result = await logic.run(input);
        await interaction.editReply(toDiscord(logic.present(result)));
    },
};
