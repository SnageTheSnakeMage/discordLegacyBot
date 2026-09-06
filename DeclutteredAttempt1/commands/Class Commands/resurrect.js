const { SlashCommandBuilder } = require('discord.js');
const { readOptions, readActor, toDiscord } = require('../_adapter.js');
const logic = require('./resurrect.logic.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('resurrect')
        .setDescription('class command for Necromancers, resurrects a player to a tile for 12AP')
        .addUserOption(option =>
            option.setName('player')
                .setDescription('which player you wish to resurrect')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('x')
                .setDescription('X coordinate of which tile to resurrect the player on')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('y')
                .setDescription('Y coordinate of which tile to resurrect the player on')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('layer')
                .setDescription('layer of which tile to resurrect the player on, defaults to players current layer')
                .setRequired(false))
        .addIntegerOption(option =>
            option.setName('game')
                .setDescription('which game, defaults to oldest active game')
                .setRequired(false)),
    async execute(interaction) {
        await interaction.deferReply();
        const input = logic.parse(
            readOptions(interaction, { player: 'user', x: 'integer', y: 'integer', layer: 'integer', game: 'integer' }),
            readActor(interaction),
        );
        const result = await logic.run(input);
        await interaction.editReply(toDiscord(logic.present(result)));
    },
};
