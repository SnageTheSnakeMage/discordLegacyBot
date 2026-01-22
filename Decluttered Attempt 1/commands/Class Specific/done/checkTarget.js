const { SlashCommandBuilder } = require('discord.js');
const utils = require('../utils');
var models = require("../utils.js").models;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('check-target')
        .setDescription('class command for Hitmen, Get the location, name, and class of your target')
        .addIntegerOption(option =>
            option.setName('game')
                .setDescription('which game, defaults to oldest active game')
                .setRequired(false)),
    async execute(interaction) {
        await deferReply(interaction);
        try{
        //Variables
        const game = interaction.options.getInteger('game') ?? await utils.getOldestActiveGameId();
        const player = await models.Players.findOne({where: {Game_ID: game, playerId: interaction.user.id}});

        //Check if the game is in timestop
        if(game.GAME_STATE == GAMESTATES.TIMESTOPPED && playerClass.Class_Name != "Clockwatcher")
        {
          await interaction.editReply("Time is stopped! only Clockwatchers can use commands at this time.");
          return
        }
        //Check if the game is paused
        if(game.GAME_STATE == GAMESTATES.PAUSED)
        {
          await interaction.editReply("Game is paused! only the dev can use commands for this game at this time.");
          return
        }
        
        //Check if player is a hitman
        if (player.Class != "Hitman") {
            return interaction.editReply({ content: "You are not a hitman!" });
        }
        
        const target = await models.Players.findOne({where: {Game_ID: game, playerId: player.Hitman_Target}});

        return interaction.editReply({ content: "Target: <@" + target.Discord_ID + "> " + ", Location: (" + target.X_Position + ", " + target.Y_Position + ") layer: " + target.Layer_ID + ", Class: " + target.Class });
        }catch(error){
            return interaction.editReply({ content: "Error: " + error.message , ephemeral: true });
        }

    }
};