 const { SlashCommandBuilder } = require('discord.js');
const utils = require('../../utils.js');
var models = require("../../utils.js").models;
const ChaosEvents = require('../../enums.js').ChaosEvents;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('listgames')
        .setDescription('lists all games'),
    async execute(interaction) {
        const logger200 = globalThis.CommandExecutionLogger.child({file: 'listGames.js'})
        await interaction.deferReply();
        
        const games = await models.Games.findAll();
        var gameList = "";
        for (var i = 0; i < games.length; i++) {
            gameList += "Game ID:" + games[i].Game_ID + " - Game State: " + games[i].GAME_STATE +
             "\n Current Chaos Council Event: " + games[i].CURR_CC_EVENT + " - " + ChaosEvents[games[i].CURR_CC_EVENT] + 
             ",\n Winner: " + games[i].winner + "\n--------\n";
        }
        await interaction.editReply(gameList);
    },
};