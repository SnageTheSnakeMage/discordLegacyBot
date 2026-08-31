const { SlashCommandBuilder } = require('discord.js');
const utils = require('../../utils.js');
var models = require("../../utils.js").models;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('burn')
        .setDescription('class command for Pyromaniacs, turn any non-gateway tile in range into a fire tile for 4AP')
        .addIntegerOption(option =>
            option.setName('x')
                .setDescription('X coordinate of which tile to burn')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('y')
                .setDescription('Y coordinate of which tile to burn')
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
                var gameId = interaction.options.getInteger('game') ?? await utils.getOldestGameId(interaction.user.id);
                var playerDiscordID = interaction.user.id;
       
                //Get Game and Player
                var game = await models.Games.findByPk(gameId);
                const player = await models.Players.findOne({where: {Game_ID: game.Game_ID, Discord_ID: playerDiscordID}});

                const playerClass = await models.Classes.findByPk(player.Class_ID);
                const playerTile = await models.Tiles.findByPk(player.Tile_ID);
                const tileInRange = utils.getTileCordinatesOfLine([playerTile.X_Position, playerTile.Y_Position], [x, y]).length <= player.Range_;
                const tileToChange = await models.Tiles.findOne({where: {X_Position: x, Y_Position: y, Layer_ID: playerTile.Layer_ID}});

                //Verification of Variables
                if (!tileToChange) {
                    return interaction.editReply({ content: "Could not find tile to burn at the given coordinates." });
                }

                if(player.Dead){
                    await interaction.editReply({ content: "Dead players can't use this command." });
                    return
                }

                //Check Gamestate
                if(await utils.checkGameStateAndReply(game.GAME_STATE, false, interaction)){
                    return
                }

                if(playerClass.Class_Name != "Pyromaniac") {
                    return interaction.editReply({ content: "You are not a Pyromaniac!" });
                }

                //Check if inputted tile is a gateway tile
                if(tileToChange.Tile_Type == "Gateway_Open" || tileToChange.Tile_Type == "Gateway_Locked") {
                    return interaction.editReply({ content: "You cannot burn a gateway tile!" });
                }

                //Check if player is in range of the tile they want to burn
                if (!tileInRange) {
                    return interaction.editReply({ content: "You are not in range of the tile you want to burn!" });
                }

                //Check if player has enough AP to burn
                if (player.Action_Points < 4) {
                    return interaction.editReply({ content: "You dont have enough AP to burn a tile!" });
                }

                //Update tile to fire tile and update player AP
                await models.Players.update({Action_Points: player.Action_Points - 4}, {where: {Player_ID: player.Player_ID}});
                await models.Tiles.update({Tile_Type: "Fire"}, {where: {Tile_ID: tileToChange.Tile_ID}});

                return interaction.editReply({ content: interaction.user.username + " made a " + tileToChange.Tile_Type + " tile on coordinates (" + x + ", " + y + ") on layer " + tileToChange.Layer_ID + "!" });
        }
        catch (error) {
        return interaction.editReply({ content: "An error occurred: " + error.message });
        }
    }
};