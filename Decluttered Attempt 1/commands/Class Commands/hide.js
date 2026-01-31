const { SlashCommandBuilder } = require('discord.js');
const utils = require('../../utils.js');
var models = require("../../utils.js").models;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('hide')
        .setDescription('class command for Hunter, turn any non-gateway tile in range into a bush tile for 5AP')
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
                var gameId = interaction.options.getInteger('game');
                var playerDiscordID = interaction.user.id;
            
                //Get Game and Player
                var game = await models.Games.findByPk(gameId ?? await utils.getOldestActiveGameId());
                const player = await models.Players.findOne({where: {Game_ID: game.Game_ID, playerId: playerDiscordID}});

                //Check Gamestate
                if(await utils.checkGameState(game.GAMESTATES, false, interaction)){
                    return
                }

                //Verification of Variables
                if (!tileToChange) {
                    return interaction.editReply({ content: "Could not find tile to hide at the given coordinates." });
                }

                if(playerClass.Class_Name != "Hunter") {
                    return interaction.editReply({ content: "You are not a Hunter!" });
                }

                //Check if inputted tile is a gateway tile
                if(tileToChange.Tile_Type == "Gateway_Open" || tileToChange.Tile_Type == "Gateway_Locked") {
                    return interaction.editReply({ content: "You cannot hide a gateway tile!" });
                }

                //Check if player is in range of the tile they want to hide
                if (!tileInRange) {
                    return interaction.editReply({ content: "You are not in range of the tile you want to hide!" });
                }

                //Check if player has enough AP to hide
                if (player.Action_Points < 5) {
                    return interaction.editReply({ content: "You dont have enough AP to hide a tile!" });
                }

                //Update tile to hide tile and update player AP
                await models.Players.update({Action_Points: player.Action_Points - 5}, {where: {playerId: player.playerId}});
                await models.Tiles.update({Tile_Type: "Bush"}, {where: {Tile_ID: tileToChange.Tile_ID}});

                return interaction.editReply({ content: "You have made a " + tileToChange.Tile_Type + " tile on coordinates (" + x + ", " + y + ") on layer " + tileToChange.Layer_ID + "!" });
        }
        catch (error) {
            return interaction.editReply({ content: "An error occurred: " + error.message || "Unknown error", ephemeral: true });
        }
    }
};