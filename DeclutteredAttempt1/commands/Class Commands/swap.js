const { SlashCommandBuilder } = require('discord.js');
const { readOptions, readActor, toDiscord } = require('../_adapter.js');
const { runLogged } = require('../_logging.js');
const logic = require('./swap.logic.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('swap')
        .setDescription('class command for Switchmates, swap places with any player for 4AP')
        .addUserOption(option =>
            option.setName('victim')
                .setDescription('which player to swap places with')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('game')
                .setDescription('which game, defaults to oldest active game')
                .setRequired(false)),
    async execute(interaction) {
        await interaction.deferReply();
        const input = logic.parse(
            readOptions(interaction, { victim: 'user', game: 'integer' }),
            readActor(interaction),
        );
        const result = await runLogged('swap', logic, input);
        await interaction.editReply(toDiscord(logic.present(result)));
    },
};
