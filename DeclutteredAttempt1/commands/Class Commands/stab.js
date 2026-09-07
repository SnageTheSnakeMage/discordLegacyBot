const { SlashCommandBuilder } = require('discord.js');
const { readOptions, readActor, toDiscord } = require('../_adapter.js');
const { runLogged } = require('../_logging.js');
const logic = require('./stab.logic.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stab')
        .setDescription('spend 1 AP to deal x2 dmg(up to max) to another player on your tile')
        .addUserOption(option =>
            option.setName('target')
                .setDescription('who you are attacking')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('# of times you wish to stab the target defaults to 1')
                .setRequired(false))
        .addIntegerOption(option =>
            option.setName('game')
                .setDescription('which game, defaults to oldest active game')
                .setRequired(false)),
    async execute(interaction) {
        await interaction.deferReply();
        const input = logic.parse(
            readOptions(interaction, { target: 'user', amount: 'integer', game: 'integer' }),
            readActor(interaction),
        );
        const result = await runLogged('stab', logic, input);
        await interaction.editReply(toDiscord(logic.present(result)));
    },
};
