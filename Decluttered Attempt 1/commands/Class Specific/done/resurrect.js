const { SlashCommandBuilder } = require('discord.js');
const utils = require('../utils');
var models = require("../utils.js").models;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('resurrect')
        .setDescription('class command for Necromancers, resurrects a player to a tile for 12AP')
        .addUserOption(option =>
            option.setName('player')
                .setDescription('which player you wish to resurrect')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('x')
                .setDescription('X coordinate of which tile to resurrect the player on')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('y')
                .setDescription('Y coordinate of which tile to resurrect the player on')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('layer')
                .setDescription('layer of which tile to resurrect the player on, defaults to players current layer')
                .setRequired(false))
        .addIntegerOption(option =>
            option.setName('game')
                .setDescription('which game, defaults to oldest active game')
                .setRequired(false)),
    async execute(interaction) {
        await interaction.deferReply();

        //Variables
 
        const game = await models.Games.findByPk(interaction.options.getInteger('game')) ?? await utils.getOldestActiveGameId();
        const player = await models.Players.findOne({where: {Game_ID: game, playerId: interaction.user.id}});
        const playersTile = await models.Tiles.findOne({where: {Tile_ID: player.Tile_ID}});
        const layer = await utils.commonLayerIDtoDbLayerID(game,interaction.options.getInteger('layer')) ?? playersTile.Layer_ID;
        const inputtedTile = await models.Tiles.findOne({where: {Layer_ID: layer, X_Position: interaction.options.getInteger('x'), Y_Position: interaction.options.getInteger('y')}});
        const resurectee = await models.Players.findOne({where: {Game_ID: game, playerId: interaction.options.getUser('player').id}});

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

        //Check if player is a Necromancer
        if (player.Class != "Necromancer") {
            return interaction.editReply({ content: "You are not a Necromancer!" });
        }

        //Check if the tile provided is in the game
        if (!inputtedTile) {
            return interaction.editReply({ content: "The tile provided is not in the game!" });
        }

        //Check if resurrectee is in the game
        if (!resurectee) {
            return interaction.editReply({ content: "The resurrectee is not in this game!" });
        }

        //Check if resurrectee is dead
        if (resurectee.Dead === 0) {
            return interaction.editReply({ content: "The resurrectee is not dead!" });
        }

        //Check if player has enough AP
        if (player.Action_Points < 12) {
            return interaction.editReply({ content: "You dont have enough AP to resurrect!" });
        }

        //Check if the inputted tile has room and is not Void, Wall, or Ice
        if (inputtedTile.Tile_Type === "Void" || inputtedTile.Tile_Type === "Wall" || inputtedTile.Tile_Type === "Ice") {
            return interaction.editReply({ content: "You cannot resurrect to that tile!" });
        }

        if(inputtedTile.Player1_ID != null || inputtedTile.Player2_ID != null || inputtedTile.Player3_ID != null || inputtedTile.Player4_ID != null) {
            return interaction.editReply({ content: "You cannot resurrect to that tile!" });
        }

        //Resurrect the player
        await models.Players.update({Dead: 0}, {where: {playerId: resurectee.playerId}}); 
        await models.Tiles.update({Player_ID: resurectee.playerId}, {where: {Tile_ID: resurectee.Tile_ID}}); 
        await models.Players.update({Action_Points: player.Action_Points - 12}, {where: {playerId: player.playerId}}); 

        return interaction.editReply({ content: "You have resurrected " + interaction.options.getUser('player').username + " to the tile provided!" });

    }
};