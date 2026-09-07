const { SlashCommandBuilder } = require('discord.js');
const { readOptions, readActor, toDiscord } = require('../_adapter.js');
const { runLogged } = require('../_logging.js');
const logic = require('./listGames.logic.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('listgames')
        .setDescription('lists all games'),
    async execute(interaction) {
        await interaction.deferReply();
        const input = logic.parse(readOptions(interaction, {}), readActor(interaction));
        const result = await runLogged('listGames', logic, input);
        await interaction.editReply(toDiscord(logic.present(result)));
    },
};
