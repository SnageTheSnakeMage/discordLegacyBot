const { SlashCommandBuilder } = require('discord.js');
const { readOptions, readActor, toDiscord } = require('../_adapter.js');
const { runLogged } = require('../_logging.js');
const logic = require('./build.logic.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('build')
        .setDescription('class command for Construction Workers, build wall on an empty tile or chest on a tile in range. 3AP')
        .addBooleanOption(option =>
            option.setName('wall')
                .setDescription('build a wall or a chest, true = wall, false = chest')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('x')
                .setDescription('X coordinate of which tile to build')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('y')
                .setDescription('Y coordinate of which tile to build')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('game')
                .setDescription('which game, defaults to oldest active game')
                .setRequired(false)),
    async execute(interaction) {
        await interaction.deferReply();
        const input = logic.parse(
            readOptions(interaction, { wall: 'boolean', x: 'integer', y: 'integer', game: 'integer' }),
            readActor(interaction),
        );
        const result = await runLogged('build', logic, input);
        await interaction.editReply(toDiscord(logic.present(result)));
    },
};
