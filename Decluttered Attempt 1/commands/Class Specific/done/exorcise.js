const { SlashCommandBuilder } = require('discord.js');
const utils = require('../utils');
var models = require("../utils.js").models;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('exorcise')
        .setDescription('class command for Exorcists, turn any non-gateway tile in range into a blank tile for 3AP, and can remove a players class for 16 AP')
        .addUserOption(option =>
            option.setName('player')
                .setDescription('which player to remove a class from, required if you wish to remove a class')
                .setRequired(false))
        .addIntegerOption(option =>
            option.setName('x')
                .setDescription('X coordinate of which tile to exorcise')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('y')
                .setDescription('Y coordinate of which tile to exorcise')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('game')
                .setDescription('which game, defaults to oldest active game')
                .setRequired(false)),
    async execute(interaction) {
        await interaction.deferReply();
        try {
        //Variables
        var x = interaction.options.getInteger('x');
        var y = interaction.options.getInteger('y');
        var gameId = interaction.options.getInteger('game');
        var targetDiscordID = interaction.options.getUser('player').id ?? null;
        var playerDiscordID = interaction.user.id;

        //Get Game and Player
        var game = await models.Games.findByPk(gameId ?? await utils.getOldestActiveGameId());
        const player = await models.Players.findOne({where: {Game_ID: game.Game_ID, playerId: playerDiscordID}});
        const targetPlayer = await models.Players.findOne({where: {Game_ID: game.Game_ID, playerId: targetDiscordID}});

        const playerClass = await models.Classes.findByPk(player.Class_ID);
        const playerTile = await models.Tiles.findByPk(player.Tile_ID);
        const tileInRange = utils.getTileCordinatesOfLine([playerTile.X_Position, playerTile.Y_Position], [x, y]).length <= player.Range_;
        const tileToChange = await models.Tiles.findOne({where: {X_Position: x, Y_Position: y, Layer_ID: playerTile.Layer_ID}});

        //Verification of Variables
        if (!tileToChange) {
            return interaction.editReply({ content: "Could not find tile to exorcise at the given coordinates." });
        }

        if(playerClass.Class_Name != "Exorcist") {
            return interaction.editReply({ content: "You are not a Exorcist!" });
        }

        //Check if inputted tile is a gateway tile
        if(tileToChange.Tile_Type == "Gateway_Open" && !targetPlayer || tileToChange.Tile_Type == "Gateway_Locked" && !targetPlayer) {
            return interaction.editReply({ content: "You cannot exorcise a gateway tile!" });
        }

        //Check if player is in range of the tile or player they want to exorcise
        if (!tileInRange) {
            return interaction.editReply({ content: "You are not in range of the tile or player you want to exorcise!" });
        }

        //Check if player has enough AP to exorcise
        if (player.Action_Points < 3 && !targetPlayer) {
            return interaction.editReply({ content: "You dont have enough AP to dig a tile!" });
        }

        //Check if player has enough AP to remove a class
        if (player.Action_Points < 16 && targetPlayer) {
            return interaction.editReply({ content: "You dont have enough AP to remove a class!" });
        }

        //Update tile to fire tile and update player AP
        if(!targetPlayer)
        {
            await models.Players.update({Action_Points: player.Action_Points - 4}, {where: {playerId: player.playerId}});
            await utils.revertTileToBlank(tileToChange);
        }

        if (targetPlayer) {
            await models.Players.update({Class_Name: "Average"}, {where: {playerId: targetPlayer.playerId}}); 
            await models.Players.update({Action_Points: targetPlayer.Action_Points - 16}, {where: {playerId: targetPlayer.playerId}}); 

            //TODO add this function
            await utils.classRemoval(targetPlayer);
            return interaction.editReply({ content: "You have exorcised " + interaction.options.getUser('player').username + " and removed their class!" });
        }
        

        return interaction.editReply({ content: "You have made a " + tileToChange.Tile_Type + " tile on coordinates (" + x + ", " + y + ") on layer " + tileToChange.Layer_ID + "!" });
    }
    catch (error) {
     return interaction.editReply({ content: "An error occurred: " + error.message || "Unknown error", ephemeral: true });
    }
    }
};