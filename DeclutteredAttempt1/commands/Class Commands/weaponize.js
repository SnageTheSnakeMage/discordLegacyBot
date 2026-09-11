const { SlashCommandBuilder } = require('discord.js');
const { readOptions, readActor, toDiscord } = require('../_adapter.js');
const { runLogged } = require('../_logging.js');
const logic = require('./weaponize.logic.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('weaponize')
        .setDescription('class command for Blacksmiths, give a x2 dmg buff to anyone in range\'s next attack for 6AP')
        .addUserOption(option =>
            option.setName('player')
                .setDescription('which player you wish to give the buff to, defaults to yourself')
                .setRequired(false))
        .addIntegerOption(option =>
            option.setName('x')
                .setDescription('X coordinate of the player to give the buff to, defaults to your current tile')
                .setRequired(false))
        .addIntegerOption(option =>
            option.setName('y')
                .setDescription('Y coordinate of the player to give the buff to, defaults to your current tile')
                .setRequired(false))
        .addIntegerOption(option =>
            option.setName('game')
                .setDescription('which game, defaults to oldest active game')
                .setRequired(false)),
    async execute(interaction) {
        // the old code called an undefined deferReply(interaction) helper; a
        // plain public defer is what it meant to do
        await interaction.deferReply();
        const input = logic.parse(
            readOptions(interaction, { player: 'user', x: 'integer', y: 'integer', game: 'integer' }),
            readActor(interaction),
        );
        const result = await runLogged('weaponize', logic, input);
        await interaction.editReply(toDiscord(logic.present(result)));
    },
};
