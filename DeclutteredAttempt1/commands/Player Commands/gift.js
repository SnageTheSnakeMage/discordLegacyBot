const { SlashCommandBuilder } = require('discord.js');
const { readOptions, readActor, toDiscord } = require('../_adapter.js');
const { runLogged } = require('../_logging.js');
const logic = require('./gift.logic.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('gift')
        .setDescription('gives a player in range an amount of AP')
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('how much AP you wish to give, defaults to 1')
                .setMinValue(1)
                .setRequired(true))
        .addUserOption(option =>
            option.setName('player')
                .setDescription('which player to give the AP to')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('game')
                .setDescription('which game, defaults to oldest active game')
                .setRequired(false)),
    async execute(interaction) {
        await interaction.deferReply();
        const input = logic.parse(
            readOptions(interaction, { amount: 'integer', player: 'user', game: 'integer' }),
            readActor(interaction),
        );
        const result = await runLogged('gift', logic, input);
        await interaction.editReply(toDiscord(logic.present(result)));
    },
};
