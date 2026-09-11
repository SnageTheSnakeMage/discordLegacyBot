const { SlashCommandBuilder } = require('discord.js');
const { readOptions, readActor, toDiscord } = require('../_adapter.js');
const { runLogged } = require('../_logging.js');
const logic = require('./conjure.logic.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('conjure')
        .setDescription('class command for Druids, turn any non-gateway tile in range into a storm tile for 4AP')
        .addIntegerOption(option =>
            option.setName('x')
                .setDescription('X coordinate of which tile to conjure a storm on')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('y')
                .setDescription('Y coordinate of which tile to conjure a storm on')
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
        const result = await runLogged('conjure', logic, input);
        await interaction.editReply(toDiscord(logic.present(result)));
    },
};
