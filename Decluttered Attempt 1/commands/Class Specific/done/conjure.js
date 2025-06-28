const { SlashCommandBuilder } = require('discord.js');
const utils = require('../utils');
var models = require("../utils.js").models;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('conjure')
        .setDescription('class command for Druids, turn any non-gateway tile in range into a storm tile for 4AP')
        .addIntegerOption(option =>
            option.setName('x')
                .setDescription('X coordinate of which tile to conjure a storm on')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('y')
                .setDescription('Y coordinate of which tile to conjure a storm on')
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
                var playerDiscordID = interaction.user.id;
       
                //Get Game and Player
                var game = await models.Games.findByPk(gameId ?? await utils.getOldestActiveGameId());
                const player = await models.Players.findOne({where: {Game_ID: game.Game_ID, playerId: playerDiscordID}});

                const playerClass = await models.Classes.findByPk(player.Class_ID);
                const playerTile = await models.Tiles.findByPk(player.Tile_ID);
                const tileInRange = utils.getTileCordinatesOfLine([playerTile.X_Position, playerTile.Y_Position], [x, y]).length <= player.Range_;
                const tileToChange = await models.Tiles.findOne({where: {X_Position: x, Y_Position: y, Layer_ID: playerTile.Layer_ID}});

                //Check if the game is in timestop
                if(game.GAME_STATE == GAMESTATES.TIMESTOPPED && playerClass.Class_Name == "Clockwatcher")
                {
                await interaction.editReply("Time is stopped! only Clockwatchers can use commands at this time.");
                return
                }

                //Verification of Variables
                if (!tileToChange) {
                    return interaction.editReply({ content: "Could not find tile to conjure a storm on at the given coordinates." });
                }

                if(playerClass.Class_Name != "Druid") {
                    return interaction.editReply({ content: "You are not a Druid!" });
                }

                 //Check if inputted tile is a gateway tile
                if(tileToChange.Tile_Type == "Gateway_Open" || tileToChange.Tile_Type == "Gateway_Locked") {
                    return interaction.editReply({ content: "You cannot conjure a storm on a gateway tile!" });
                }

                //Check if player is in range of the tile they want to conjure a storm on
                if (!tileInRange) {
                    return interaction.editReply({ content: "You are not in range of the tile you want to conjure a storm on!" });
                }

                //Check if player has enough AP to conjure a storm on
                if (player.Action_Points < 4) {
                    return interaction.editReply({ content: "You dont have enough AP to conjure a storm on a tile!" });
                }

                //Update tile to conjure a storm on tile and update player AP
                await models.Players.update({Action_Points: player.Action_Points - 4}, {where: {playerId: player.playerId}});
                await models.Tiles.update({Tile_Type: "Storm"}, {where: {Tile_ID: tileToChange.Tile_ID}});

                return interaction.editReply({ content: "You have made a " + tileToChange.Tile_Type + " tile on coordinates (" + x + ", " + y + ") on layer " + tileToChange.Layer_ID + "!" });
        }
        catch (error) {
        return interaction.editReply({ content: "An error occurred: " + error.message || "Unknown error", ephemeral: true });
        }
    }
};