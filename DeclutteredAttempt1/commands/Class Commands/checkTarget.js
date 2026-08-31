const { SlashCommandBuilder } = require('discord.js');
const utils = require('../../utils.js');
var models = require("../../utils.js").models;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('check-target')
        .setDescription('class command for Hitmen, Get the location, name, and class of your target')
        .addIntegerOption(option =>
            option.setName('game')
                .setDescription('which game, defaults to oldest active game')
                .setRequired(false)),
    async execute(interaction) {
        await interaction.deferReply();
        try{
        //Variables
        const gameId = interaction.options.getInteger('game') ?? await utils.getOldestGameId(interaction.user.id);
        const game = await models.Games.findByPk(gameId)
        const player = await models.Players.findOne({where: {Game_ID: gameId, Discord_ID: interaction.user.id}});

        //Check Gamestate
        if(await utils.checkGameStateAndReply(game.GAME_STATE, false, interaction)){
            return
        }
        
        //Check if player is a hitman
        if (player.Class_ID != 10) {
            return interaction.editReply({ content: "You are not a hitman!" });
        }
        
        const target = await models.Players.findOne({where: {Game_ID: game, Player_ID: player.Hitman_Target}});

        if(!target){
            return interaction.editReply({ content: "No current target..."})
        }

        return interaction.editReply({ content: "Target: <@" + target.Discord_ID + "> " + ", Location: (" + target.X_Position + ", " + target.Y_Position + ") layer: " + target.Layer_ID + ", Class: " + target.Class });
        }catch(error){
            return interaction.editReply({ content: "Error: " + error.message , ephemeral: true });
        }

    }
};