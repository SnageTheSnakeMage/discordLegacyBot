 const { SlashCommandBuilder } = require('discord.js');
const utils = require('../../utils.js');
var models = require("../../utils.js").models;
const ChaosEvents = require('G:/LegacyBotDiscord/Decluttered Attempt 1/enums.js').ChaosEvents;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('listgames')
        .setDescription('lists all games'),
    async execute(interaction) {
        await interaction.deferReply();
        
        models.Games.findAll().then((games) => {
            var gameList = "";
            for (var i = 0; i < games.length; i++) {
                gameList += "Game ID:" + games[i].Game_ID + " - Game State: " + games[i].GAME_STATE +
                 "\n Current Chaos Council Event: " + games[i].CURR_CC_EVENT + " - " + ChaosEvents[games[i].CURR_CC_EVENT] + 
                 ",\n Winner: " + games[i].winner + "\n--------\n";
            }
            interaction.editReply(gameList);
        });
    },
};