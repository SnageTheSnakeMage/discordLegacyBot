const { SlashCommandBuilder } = require('discord.js');
const { readOptions, readActor, toDiscord } = require('../_adapter.js');
const logic = require('./changeGamestate.logic.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('change-gamestate')
        .setDescription('starts a game, and if it doesnt find one then creates one')
        .addIntegerOption(option =>
            option.setName('game')
            .setDescription('which game to change')
            .setRequired(true))
        .addStringOption(option =>
            option.setName('gamestate')
            .setDescription('which gamestate to change it to')
            .setRequired(true)
            .setChoices(
                { name: 'Registration', value: 'REGISTRATION' },
                { name: 'Active', value: 'ACTIVE' },
                { name: 'Over', value: 'OVER' },
                { name: 'TimeStopped', value: 'TIMESTOPPED' },
                { name: 'DevPaused', value: 'DEV_PAUSED' },
                { name: 'Finale', value: 'FINALE' },
                { name: 'Finished', value: 'INACTIVE' },
            )),

    // this command never deferred: both of its old branches replied directly,
    // so the adapter replies directly too (TESTING.md Part 1: the defer style
    // is per-command and is preserved). The dev gate stays here and travels
    // into run() as input.isDev.
    async execute(interaction) {
        const input = logic.parse(
            readOptions(interaction, { game: 'integer', gamestate: 'string' }),
            { ...readActor(interaction), isDev: interaction.user.id === process.env.DEV_ID },
        );
        const result = await logic.run(input);
        await interaction.reply(toDiscord(logic.present(result)));
    },
};
