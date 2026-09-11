const { SlashCommandBuilder } = require('discord.js');
const { readOptions, readActor, toDiscord } = require('../_adapter.js');
const { runLogged } = require('../_logging.js');
const logic = require('./checkTarget.logic.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('check-target')
        .setDescription('class command for Hitmen, Get the location, name, and class of your target')
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
        const result = await runLogged('checkTarget', logic, input);
        await interaction.editReply(toDiscord(logic.present(result)));
    },
};
