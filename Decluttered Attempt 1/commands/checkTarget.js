const { SlashCommandBuilder } = require('discord.js');
const utils = require('../utils');
var models = require("../utils.js").models;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('checktarget')
        .setDescription('class command for Hitmen, Get the location, name, and class of your target')
        .addIntegerOption(option =>
            option.setName('game')
                .setDescription('which game, defaults to oldest active game')
                .setRequired(false)),
    async execute(interaction) {
        await deferReply(interaction);
        try{
        //Variables
        const game = interaction.options.getInteger('game') ?? await utils.getOldestActiveGameId(interaction.user.id);
        const player = await models.Players.findOne({where: {Game_ID: game, Player_ID: interaction.user.id}});

         if(player.Dead){
        await interaction.reply({ content: "Dead players can't use this command.", ephemeral: true });
        return
        }
        //Check Gamestate
        await utils.checkGameState(game.GAMESTATES, false);

        //Check if player is a hitman
        if (player.Class != "Hitman") {
            return interaction.editReply({ content: "You are not a hitman!" });
        }
        
        const target = await models.Players.findOne({where: {Game_ID: game, Player_ID: player.Hitman_Target}});

        return interaction.editReply({ content: "Target: <@" + target.Discord_ID + "> " + ", Location: (" + target.X_Position + ", " + target.Y_Position + ") layer: " + target.Layer_ID + ", Class: " + target.Class });
        }catch(error){
            return interaction.editReply({ content: "Error: " + error.message , ephemeral: true });
        }

    }
};