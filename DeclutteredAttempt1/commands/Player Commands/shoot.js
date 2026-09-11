const { SlashCommandBuilder } = require('discord.js');
const { readOptions, readActor, toDiscord } = require('../_adapter.js');
const { runLogged } = require('../_logging.js');
const logic = require('./shoot.logic.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('shoot')
        .setDescription('spend AP to attack another player in range')
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
            option.setName('amount')
                .setDescription('# of times you wish to attack the target defaults to 1')
                .setRequired(false))
        .addIntegerOption(option =>
            option.setName('game')
                .setDescription('which game, defaults to oldest active game')
                .setRequired(false))
        .addIntegerOption(option =>
            option.setName('body')
            .setDescription('(FOR TWIN CLASS) Which body you are trying to see, defaults to 1')
            .setMaxValue(2)
            .setMinValue(1)
            .setRequired(false)),
    async execute(interaction) {
        await interaction.deferReply();
        const input = logic.parse(
            readOptions(interaction, {
                x: 'integer',
                y: 'integer',
                target: 'user',
                amount: 'integer',
                game: 'integer',
                body: 'integer',
            }),
            readActor(interaction),
        );
        const result = await runLogged('shoot', logic, input);
        await interaction.editReply(toDiscord(logic.present(result)));
    },
};
