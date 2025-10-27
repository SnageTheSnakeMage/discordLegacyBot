const { SlashCommandBuilder } = require('discord.js');
const utils = require('../utils');
var models = utils.models;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('store')
        .setDescription('stores AP in a game\'s chest')
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('# of AP you wish to take out of the chest defaults to 1')
                .setRequired(false))
        .addIntegerOption(option =>
            option.setName('game')
                .setDescription('which game, defaults to oldest active game')
                .setRequired(false)),
    async execute(interaction) {
        await deferredReply(interaction);
        try {
        //Variables
        var amount = interaction.options.getInteger('amount');
        var gameId = interaction.options.getInteger('game');
        var playerDiscordID = interaction.user.id;

        //Get Game and Player
        var game = await models.Games.findByPk(gameId ?? await utils.getOldestActiveGameId(interaction.user.id));
        const player = await models.Players.findOne({where: {Game_ID: gameId.Game_ID, Discord_ID: playerDiscordID}});
        const playerTile = await models.Tiles.findByPk(player.Tile_ID);
        var playerClass = await models.Classes.findByPk(player.Class_ID);


        if(player.Dead){
            await interaction.editReply({ content: "Dead players can't use this command."});
            return
        }
      
        //Check Gamestate
        if(await utils.checkGameState(game.GAMESTATES, false, interaction)){
          return
        }
        //Check if player is on a chest tile
        if(playerTile.Tile_Type != "Chest") {
            return interaction.editReply({ content: "You are not on a chest tile!" });
        }

        //Check if the player has enough AP
        if(player.Action_Points < amount) {
            return interaction.editReply({ content: "You dont have enough AP to store in the chest!" });
        }

        //Give the chest AP from the player
        await models.Games.update({CHEST_AMOUNT: game.CHEST_AMOUNT + amount}, {where: {Game_ID: game.Game_ID}}); 
        await models.Players.update({Action_Points: player.Action_Points - amount}, {where: {Player_ID: player.Player_ID}});

        return interaction.editReply({ content: "You have stored " + amount + " AP in the chest!" });
    }
    catch (error) {
     return interaction.editReply({ content: "An error occurred: " + error.message || "Unknown error", ephemeral: true });
    }
    }
};