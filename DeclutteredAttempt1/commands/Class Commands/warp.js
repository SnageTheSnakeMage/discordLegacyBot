const { SlashCommandBuilder } = require('discord.js');
const { readOptions, readActor, toDiscord } = require('../_adapter.js');
const logic = require('./warp.logic.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('warp')
        .setDescription('Teleport to a random gateway tile on the layer ^/V Dimensional Hoppers land on any tile')
        .addBooleanOption(option =>
            option.setName('up-or-down')
                .setDescription('teleport up or down, true = up, false = down')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('game')
                .setDescription('which game, defaults to oldest registering game')
                .setRequired(false)),
    async execute(interaction) {
        await interaction.deferReply();
        const input = logic.parse(
            readOptions(interaction, { 'up-or-down': 'boolean', game: 'integer' }),
            readActor(interaction),
        );
        const result = await logic.run(input);
        await interaction.editReply(toDiscord(logic.present(result)));
    },
};
