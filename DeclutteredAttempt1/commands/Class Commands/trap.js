const { SlashCommandBuilder } = require('discord.js');
const utils = require('../../utils.js');
var models = require("../../utils.js").models;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('trap')
        .setDescription('class command for Minesweepers, plants a mine on a tile in range for 1AP')
        .addIntegerOption(option =>
            option.setName('x')
                .setDescription('X coordinate of which tile to smoke')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('y')
                .setDescription('Y coordinate of which tile to smoke')
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
                var game = await models.Games.findByPk(gameId ?? await utils.getOldestGameId());
                const player = await models.Players.findOne({where: {Game_ID: game.Game_ID, Discord_ID: playerDiscordID}});

                const playerClass = await models.Classes.findByPk(player.Class_ID);
                const playerTile = await models.Tiles.findByPk(player.Tile_ID);
                const tileInRange = utils.getTileCordinatesOfLine([playerTile.X_Position, playerTile.Y_Position], [x, y]).length <= player.Range_;
                const tileToChange = await models.Tiles.findOne({where: {X_Position: x, Y_Position: y, Layer_ID: playerTile.Layer_ID}});

                //Check Gamestate
                if(await utils.checkGameState(game.GAME_STATE, false, interaction)){
                    return
                }

                //Verification of Variables
                if (!tileToChange) {
                    return interaction.editReply({ content: "Could not find tile to trap at the given coordinates." });
                }

                if(playerClass.Class_Name != "Minesweeper") {
                    return interaction.editReply({ content: "You are not a Minesweeper!" });
                }

                //Check if player is in range of the tile they want to trap
                if (!tileInRange) {
                    return interaction.editReply({ content: "You are not in range of the tile you want to trap!" });
                }

                //Check if player has enough AP to trap
                if (player.Action_Points < 1) {
                    return interaction.editReply({ content: "You dont have enough AP to trap a tile!" });
                }

                //Update tile to be trapped and update player AP
                await models.Players.update({Action_Points: player.Action_Points - 1}, {where: {Player_ID: player.Player_ID}});
                await models.Tiles.update({trapped: true, trapper: player.Player_ID}, {where: {Tile_ID: tileToChange.Tile_ID}});

                return interaction.editReply({ content: "You have planted a mine on coordinates (" + x + ", " + y + ") on layer " + tileToChange.Layer_ID + "!", ephemeral: true });
                
        }
        catch (error) {
        return interaction.editReply({ content: "An error occurred: " + error.message || "Unknown error", ephemeral: true });
        }
    }
};