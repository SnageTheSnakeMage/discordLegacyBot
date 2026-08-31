const { SlashCommandBuilder } = require('discord.js');
const { readOptions, readActor, toDiscord } = require('../_adapter.js');
const logic = require('./upgrade.logic.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('upgrade')
        .setDescription('provides buttons to upgrade your stats')
        .addStringOption(option =>
            option.setName('stat')
                .setDescription('which stat you are upgrading')
                .setRequired(true)
                .addChoices(
                    { name: "health", value: "Health_Points" },
                    { name: "damage", value: "Damage" },
                    { name: "range", value: "Range_" }))
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('# of times you wish to upgrade the stat defaults to 1')
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
            readOptions(interaction, { stat: 'string', amount: 'integer', game: 'integer', body: 'integer' }),
            readActor(interaction),
        );
        const result = await logic.run(input);
        await interaction.editReply(toDiscord(logic.present(result)));
    },
};
