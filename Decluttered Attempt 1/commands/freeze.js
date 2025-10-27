const { SlashCommandBuilder } = require('discord.js');
const utils = require('../utils.js');
var models = require("../utils.js").models;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('freeze')
        .setDescription('class command for Snowmen, turn any empty non-gateway tile in range into an ice tile for 3AP')
        .addIntegerOption(option =>
            option.setName('x')
                .setDescription('X coordinate of which tile to freeze')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('y')
                .setDescription('Y coordinate of which tile to freeze')
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
                var gameId = interaction.options.getInteger('game') ?? await utils.getOldestActiveGameId(interaction.user.id);
                var playerDiscordID = interaction.user.id;
            
                //Get Game and Player
                var game = await models.Games.findByPk(gameId);
                const player = await models.Players.findOne({where: {Game_ID: game.Game_ID, Discord_ID: playerDiscordID}});

                const playerClass = await models.Classes.findByPk(player.Class_ID);
                const playerTile = await models.Tiles.findByPk(player.Tile_ID);
                const tileInRange = utils.getTileCordinatesOfLine([playerTile.X_Position, playerTile.Y_Position], [x, y]).length <= player.Range_;
                const tileToChange = await models.Tiles.findOne({where: {X_Position: x, Y_Position: y, Layer_ID: playerTile.Layer_ID}});

                if(player.Dead){
                    await interaction.editReply({ content: "Dead players can't use this command."});
                    return
                }
                //Check if the tile is empty
                if(tileToChange.Player1 != null || tileToChange.Player2 != null || tileToChange.Player3 != null || tileToChange.Player4 != null) {
                    return interaction.editReply({ content: "There is a player on this tile!" });
                }

                //Check Gamestate
                if(await utils.checkGameState(game.GAMESTATES, false, interaction)){
                    return
                }

                //Verification of Variables
                if (!tileToChange) {
                    return interaction.editReply({ content: "Could not find tile to freeze at the given coordinates." });
                }

                if(playerClass.Class_Name != "Snowman") {
                    return interaction.editReply({ content: "You are not a Snowman!" });
                }

                //Check if inputted tile is a gateway tile
                if(tileToChange.Tile_Type == "Gateway_Open" || tileToChange.Tile_Type == "Gateway_Locked") {
                    return interaction.editReply({ content: "You cannot freeze a gateway tile!" });
                }

                //Check if player is in range of the tile they want to freeze
                if (!tileInRange) {
                    return interaction.editReply({ content: "You are not in range of the tile you want to freeze!" });
                }

                //Check if player has enough AP to freeze
                if (player.Action_Points < 3) {
                    return interaction.editReply({ content: "You dont have enough AP to freeze a tile!" });
                }

                //Update tile to fire tile and update player AP
                await models.Players.update({Action_Points: player.Action_Points - 3}, {where: {Player_ID: player.Player_ID}});
                await models.Tiles.update({Tile_Type: "Ice"}, {where: {Tile_ID: tileToChange.Tile_ID}});

                return interaction.editReply({ content: interaction.user.username + " made a " + tileToChange.Tile_Type + " tile on coordinates (" + x + ", " + y + ") on layer " + tileToChange.Layer_ID + "!" });
        }
        catch (error) {
        return interaction.editReply({ content: "An error occurred: " + error.message || "Unknown error", ephemeral: true });
        }
    }
};