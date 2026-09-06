const { SlashCommandBuilder } = require('discord.js');
const { readOptions, readActor, toDiscord } = require('../_adapter.js');
const logic = require('./punish.logic.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('punish')
        .setDescription('spend 4 AP to deal (targets Missed AP+HP) damage to another player in range')
        .addIntegerOption(option =>
            option.setName('x')
            .setDescription('X coordinate of which tile to attack')
            .setRequired(true))
        .addIntegerOption(option =>
            option.setName('y')
            .setDescription('Y coordinate of which tile to attack')
            .setRequired(true))
        .addUserOption(option =>
            option.setName('target')
                .setDescription('who you are attacking')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('game')
                .setDescription('which game, defaults to oldest active game')
                .setRequired(false)),
    async execute(interaction) {
        await interaction.deferReply();
        const input = logic.parse(
            readOptions(interaction, {
                x: 'integer',
                y: 'integer',
                target: 'user',
                game: 'integer',
            }),
            readActor(interaction),
        );
        const result = await logic.run(input);
        await interaction.editReply(toDiscord(logic.present(result)));
    },
};
