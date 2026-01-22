const { SlashCommandBuilder } = require('discord.js');
const utils = require('../utils');
var models = require("../utils.js").models;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('timestop-dev')
        .setDescription('pauses the game')
        .addIntegerOption(option =>
            option.setName('game')
                .setDescription('which game, defaults to oldest active game')
                .setRequired(false)),
    async execute(interaction) {
        if(interaction.user.id != process.env.DEV_ID) return;
        const gameID = interaction.options.getInteger('game') ?? (await utils.getOldestActiveGame()).Game_ID;
        if(await models.Games.findByPk(gameID).GAME_STATE == GAMESTATES.DEV_PAUSED) {
            await models.Games.update({GAME_STATE: GAMESTATES.ACTIVE}, {where: {Game_ID: gameID}});
            return interaction.reply(`Game ${gameID} is unpaused!`);
        }
        await models.Games.update({GAME_STATE: utils.GAMESTATES.DEV_PAUSED}, {where: {Game_ID: gameID}});
        await interaction.reply(`Game ${gameID} has been paused!`);
    }
}