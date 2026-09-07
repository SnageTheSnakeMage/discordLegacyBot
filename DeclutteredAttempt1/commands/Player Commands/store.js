const { SlashCommandBuilder } = require('discord.js');
const { readOptions, readActor, toDiscord } = require('../_adapter.js');
const { runLogged } = require('../_logging.js');
const logic = require('./store.logic.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('store')
        .setDescription('stores AP in a game\'s chest')
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('# of AP you wish to take out of the chest defaults to 1')
                .setRequired(false))
        .addIntegerOption(option =>
            option.setName('game')
                .setDescription('which game, defaults to oldest active game')
                .setRequired(false)),
    async execute(interaction) {
        // the old code called the undefined helper deferredReply(interaction);
        // plain deferReply() per TESTING.md - that is a crash fix
        await interaction.deferReply();
        const input = logic.parse(
            readOptions(interaction, { amount: 'integer', game: 'integer' }),
            readActor(interaction),
        );
        const result = await runLogged('store', logic, input);
        await interaction.editReply(toDiscord(logic.present(result)));
    },
};
