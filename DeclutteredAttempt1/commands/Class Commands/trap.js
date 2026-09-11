const { SlashCommandBuilder } = require('discord.js');
const { readOptions, readActor, toDiscord } = require('../_adapter.js');
const { runLogged } = require('../_logging.js');
const logic = require('./trap.logic.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('trap')
        .setDescription('class command for Minesweepers, plants a mine on a tile in range for 1AP')
        .addIntegerOption(option =>
            option.setName('x')
                .setDescription('X coordinate of which tile to smoke')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('y')
                .setDescription('Y coordinate of which tile to smoke')
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
        const result = await runLogged('trap', logic, input);
        await interaction.editReply(toDiscord(logic.present(result)));
    },
};
