const { SlashCommandBuilder } = require('discord.js');
const { readOptions, readActor, toDiscord } = require('../_adapter.js');
const { runLogged } = require('../_logging.js');
const logic = require('./snipe.logic.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('snipe')
        .setDescription('class command for the Sniper, pierce walls and hit anyone in the path of attack')
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
                .setRequired(false)),
    async execute(interaction) {
        await interaction.deferReply();
        const input = logic.parse(
            readOptions(interaction, {
                x: 'integer', y: 'integer', target: 'user', amount: 'integer', game: 'integer',
            }),
            readActor(interaction),
        );
        const result = await runLogged('snipe', logic, input);
        await interaction.editReply(toDiscord(logic.present(result)));
    },
};
