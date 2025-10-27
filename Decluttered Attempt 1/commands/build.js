const { SlashCommandBuilder } = require('discord.js');
const utils = require('../utils.js');
var models = require("../utils.js").models;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('build')
        .setDescription('command for Constr. Workers, turn a empty non-gateway tile in range into a wall/chest tile for 3AP')
        .addBooleanOption(option =>
            option.setName('wall')
                .setDescription('build a wall or a chest, true = wall, false = chest')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('x')
                .setDescription('X coordinate of which tile to build')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('y')
                .setDescription('Y coordinate of which tile to build')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('game')
                .setDescription('which game, defaults to oldest active game')
                .setRequired(false)),
    async execute(interaction) {
        await interaction.deferReply();
        try {
        //Variables
        var wall = interaction.options.getBoolean('wall');
        var x = interaction.options.getInteger('x');
        var y = interaction.options.getInteger('y');
        var gameId = interaction.options.getInteger('game') ?? await utils.getOldestGameId(interaction.user.id);
        var playerDiscordID = interaction.user.id;
        
        if(player.Dead){
            await interaction.editReply({ content: "Dead players can't use this command."});
            return
        }


        //Get Game and Player
        var game = await models.Games.findByPk(gameId);
        const player = await models.Players.findOne({where: {Game_ID: game.Game_ID, Discord_ID: playerDiscordID}});

        const playerClass = await models.Classes.findByPk(player.Class_ID);
        const playerTile = await models.Tiles.findByPk(player.Tile_ID);
        const tileInRange = utils.getTileCordinatesOfLine([playerTile.X_Position, playerTile.Y_Position], [x, y]).length <= player.Range_;
        const tileToChange = await models.Tiles.findOne({where: {X_Position: x, Y_Position: y, Layer_ID: playerTile.Layer_ID}});

        //Verification of Variables
        if (!tileToChange) {
            return interaction.editReply({ content: "Could not find tile to build on at the given coordinates." });
        }

        if(playerClass.Class_Name != "Construction Worker") {
            return interaction.editReply({ content: "You are not a Construction Worker!" });
        }

        //Check Gamestate
        if(await utils.checkGameState(game.GAMESTATES, false, interaction)){
            return
        }

        //Check if inputted tile is a gateway tile
        if(tileToChange.Tile_Type == "Gateway_Open" || tileToChange.Tile_Type == "Gateway_Locked") {
            return interaction.editReply({ content: "You cannot build on a gateway tile!" });
        }

        //Check if there is a player on the tile if the player wants to build a wall
        if ( wall && tileToChange.Player1 != null || wall && tileToChange.Player2 != null || wall && tileToChange.Player3 != null || wall && tileToChange.Player4 != null) {
            return interaction.editReply({ content: "There is a player on that tile!" });
        }

        //Check if player is in range of the tile they want to build on
        if (!tileInRange) {
            return interaction.editReply({ content: "You are not in range of the tile you want to build on!" });
        }

        //Check if player has enough AP to build a wall or chest
        if (player.Action_Points < 3) {
            return interaction.editReply({ content: "You dont have enough AP to build a wall or chest!" });
        }

        //Build a wall or chest
        if (wall) {
            await models.Players.update({Action_Points: player.Action_Points - 3}, {where: {Player_ID: player.Player_ID}});
            await models.Tiles.update({Tile_Type: "Wall"}, {where: {Tile_ID: tileToChange.Tile_ID}});
        }
        else {
            await models.Players.update({Action_Points: player.Action_Points - 3}, {where: {Player_ID: player.Player_ID}}); 
            await models.Tiles.update({Tile_Type: "Chest"}, {where: {Tile_ID: tileToChange.Tile_ID}}); 
        }

        return interaction.editReply({ content: interaction.user.username + " made a " + tileToChange.Tile_Type + " tile on coordinates (" + x + ", " + y + ") on layer " + tileToChange.Layer_ID + "!" });

        
    }
    catch (error) {
     return interaction.editReply({ content: "An error occurred: " + error.message });
    }
    }
};