const { SlashCommandBuilder } = require('discord.js');
const { readOptions, readActor, toDiscord } = require('../_adapter.js');
const { runLogged } = require('../_logging.js');
const logic = require('./lock.logic.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lock')
        .setDescription('For Guardians lock/unlock a gateway tile in range(2AP),during a finale 1 Gateway/layer must be open')
        .addIntegerOption(option =>
            option.setName('x')
                .setDescription('X coordinate of which gateway to lock/unlock')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('y')
                .setDescription('Y coordinate of which gateway to lock/unlock')
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
        const result = await runLogged('lock', logic, input);
        await interaction.editReply(toDiscord(logic.present(result)));
    },
};
