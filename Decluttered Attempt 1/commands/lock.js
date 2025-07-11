const { SlashCommandBuilder } = require('discord.js');
const utils = require('../utils');
const GameStates = require('G:/LegacyBotDiscord/Decluttered Attempt 1/enums.js').GAMESTATES;
var models = utils.models;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lock')
        .setDescription('class command for Guardians, lock or unlock a gateway tile in range for 2AP, If a game is in its finale then one Gateway on the layer must be open')
        .addIntegerOption(option =>
            option.setName('x')
                .setDescription('X coordinate of which gateway to lock/unlock')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('y')
                .setDescription('Y coordinate of which gateway to lock/unlock')
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
        var game = await models.Games.findByPk(gameId ?? await utils.getOldestActiveGameId(interaction.user.id));
        const player = await models.Players.findOne({where: {Game_ID: game.Game_ID, Player_ID: playerDiscordID}});

        const playerClass = await models.Classes.findByPk(player.Class_ID);
        const playerTile = await models.Tiles.findByPk(player.Tile_ID);
        const tileInRange = utils.getTileCordinatesOfLine([playerTile.X_Position, playerTile.Y_Position], [x, y]).length <= player.Range_;
        const tileToChange = await models.Tiles.findOne({where: {X_Position: x, Y_Position: y, Layer_ID: playerTile.Layer_ID}});
        const layersTiles = await models.Tiles.findAll({where: {Layer_ID: playerTile.Layer_ID}});
        const gatewaysRemaining = layersTiles.filter(tile => tile.Tile_Type == "Gateway_Open");

        //Verification of Variables
        if (!tileToChange) {
            return interaction.editReply({ content: "Could not find a gateway to lock at the given coordinates." });
        }

         if(player.Dead){
        await interaction.reply({ content: "Dead players can't use this command.", ephemeral: true });
        return
        }
      //Check Gamestate
      switch(game.GAMESTATES){
        case GAMESTATES.TIMESTOPPED:
          await interaction.reply({ content: "Time is stopped! only Clockwatchers can use commands at this time.", ephemeral: true });
          return
        case GAMESTATES.DEV_PAUSED:
          await interaction.reply({ content: "Game is paused! only the dev can use commands for this game at this time.", ephemeral: true });
          return
        case GAMESTATES.FINISHED:
          await interaction.reply({ content: "Game is over! only the dev can use commands for this game at this time.\n Please register on a new game.", ephemeral: true });
          return
        case GAMESTATES.REGISTRATION:
          await interaction.reply({ content: "Game is in registration phase! only the dev can use commands for this game at this time.\n Please wait for the game to start.", ephemeral: true });
          return
      }

        if(playerClass.Class_Name != "Guardian") {
            return interaction.editReply({ content: "You are not a Guardian!" });
        }

        //Check if inputted tile is a gateway tile
        if(tileToChange.Tile_Type != "Gateway_Open" || tileToChange.Tile_Type != "Gateway_Locked") {
            return interaction.editReply({ content: "You cannot lock a non-gateway tile!" });
        }

        //Check if player is in range of the tile they want to lock/unlock
        if (!tileInRange) {
            return interaction.editReply({ content: "You are not in range of the tile you want to lock/unlock!" });
        }

        //Check if player has enough AP to lock/unlock
        if (player.Action_Points < 2) {
            return interaction.editReply({ content: "You dont have enough AP to lock/unlock a tile!" });
        }

        //Check if the game is in finale and if this would lock the last gateway of the layer
        if(game.GAME_STATE == GameStates.FINALE && tileToChange.Tile_Type == "Gateway_Locked" && gatewaysRemaining.length == 1) {
            return interaction.editReply({ content: "You cannot lock the last open gateway in the layer during a finale!" });
        }

        //Update tile to locked/open tile and update player AP
        if(tileToChange.Tile_Type == "Gateway_Open") {
            await models.Tiles.update({Tile_Type: "Gateway_Locked"}, {where: {Tile_ID: tileToChange.Tile_ID}});
        }
        else if(tileToChange.Tile_Type == "Gateway_Locked") {
            await models.Tiles.update({Tile_Type: "Gateway_Open"}, {where: {Tile_ID: tileToChange.Tile_ID}});
        }
        await models.Players.update({Action_Points: player.Action_Points - 2 }, {where: {Player_ID: player.Player_ID}});

        return interaction.editReply({ content: "You have made a " + tileToChange.Tile_Type + " tile on coordinates (" + x + ", " + y + ") on layer " + tileToChange.Layer_ID + "!" });
    }
    catch (error) {
     return interaction.editReply({ content: "An error occurred: " + error.message || "Unknown error", ephemeral: true });
    }
    }
};