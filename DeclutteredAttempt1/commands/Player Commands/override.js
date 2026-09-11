const { SlashCommandBuilder } = require('discord.js');
const { readOptions, readActor, toDiscord } = require('../_adapter.js');
const { runLogged } = require('../_logging.js');
const logic = require('./override.logic.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('override')
        .setDescription('command for the Dead or Medium, overrides a Chaos Council Poll')
        .addIntegerOption(option =>
            option.setName('option')
                .setDescription('which option in the poll to choose to win, goes 1 from the top')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(3))
        .addIntegerOption(option =>
            option.setName('game')
                .setDescription('which game, defaults to oldest active game')
                .setRequired(false)),
    async execute(interaction) {
        await interaction.deferReply();
        const input = logic.parse(
            readOptions(interaction, { option: 'integer', game: 'integer' }),
            readActor(interaction),
        );
        const result = await runLogged('override', logic, input);
        await interaction.editReply(toDiscord(logic.present(result)));
    },
};
