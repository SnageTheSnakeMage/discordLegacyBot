const { SlashCommandBuilder } = require('discord.js');
const { readOptions, readActor, toDiscord } = require('../_adapter.js');
const { runLogged } = require('../_logging.js');
const logic = require('./hotPotato.logic.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('hotpotato')
        .setDescription('class command for the Hot Potato, swap Classes with a player in range for 12AP')
        .addUserOption(option =>
            option.setName('victim')
                .setDescription('which player to swap classes with')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('x')
                .setDescription('X coordinate of your victim')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('y')
                .setDescription('Y coordinate of your victim')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('game')
                .setDescription('which game, defaults to oldest active game')
                .setRequired(false)),
    async execute(interaction) {
        await interaction.deferReply();
        const input = logic.parse(
            readOptions(interaction, { victim: 'user', x: 'integer', y: 'integer', game: 'integer' }),
            readActor(interaction),
        );
        const result = await runLogged('hotPotato', logic, input);
        await interaction.editReply(toDiscord(logic.present(result)));
    },
};
