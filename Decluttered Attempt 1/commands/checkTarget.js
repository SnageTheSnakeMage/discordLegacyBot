const { SlashCommandBuilder } = require('discord.js');
const utils = require('../utils.js');
var models = require("../utils.js").models;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('checkTarget')
        .setDescription('class command for Hitmen, Get the location, name, and class of your target')
        .addIntegerOption(option =>
            option.setName('game')
                .setDescription('which game, defaults to oldest active game')
                .setRequired(false)),
    async execute(interaction) {
        await deferReply(interaction);
        try{
            //Variables
            const gameId = interaction.options.getInteger('game') ?? await utils.getOldestActiveGameId(interaction.user.id);
            const player = await models.Players.findOne({where: {Game_ID: gameId, Discord_ID: interaction.user.id}});
            const playerClass = await models.Classes.findByPK(player.Class_ID)
            if(player.Dead){
                await interaction.editReply({ content: "Dead players can't use this command."});
                return
            }
            
            //Check Gamestate
            if(await utils.checkGameState(gameId.GAMESTATES, false, interaction)){
                return
            }

            //Check if player is a hitman
            if (playerClass != "Hitman") {
                return interaction.editReply({ content: "You are not a hitman!" });
            }
            
            const target = await models.Players.findOne({where: {Game_ID: gameId, Player_ID: player.Hitman_Target}});

            return interaction.editReply({ content: "Target: <@" + target.Discord_ID + "> " + ", Location: (" + target.X_Position + ", " + target.Y_Position + ") layer: " + target.Layer_ID + ", Class: " + target.Class });
        }catch(error){
            return interaction.editReply({ content: "Error: " + error.message });
        }

    }
};