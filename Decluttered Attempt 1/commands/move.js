const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const { Sequelize } = require('sequelize');
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: 'G:/LegacyBotDiscord/Decluttered Attempt 1/database/database'
});
const utils = require('../utils');
var models = utils.models;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('move')
    .setDescription('moves a player <distance> tiles in <direction>')
    .addStringOption(option =>
      option.setName('direction')
        .setDescription('which direction you are moving')
        .setRequired(true)
        .addChoices(
          { name: "left", value: "east" },
          { name: "right", value: "west" },
          { name: "up", value: "north" },
          { name: "down", value: "south" },
          { name: "nw", value: "northwest" },
          { name: "ne", value: "northeast" },
          { name: "sw", value: "southwest" },
          { name: "se", value: "southeast" }))
    .addIntegerOption(option =>
      option.setName('distance')
        .setDescription('how many tiles you move')
        .setRequired(true)
        .setMinValue(0))
    .addIntegerOption(option =>
      option.setName('body')
        .setDescription('(FOR TWIN CLASS) Which body you are moving, accepts 1 & 2, defaults to 1. use stats to see which body is where')
        .setRequired(false))
    .addIntegerOption(option =>
      option.setName('game')
        .setDescription('which game, defaults to oldest active game you are registered in')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('path')
        .setDescription('a collection of directions and distances, required if you wish to move on an ice tile, "direction,distance;direction,distance;..."')
        .setRequired(false)),


  async execute(interaction) {

    await interaction.deferReply();
    try{

      //#region Verification
      if(!interaction.options.getInteger('game')) {
        gameId = await utils.getOldestActiveGameId();
      }
      else {
        gameId = interaction.options.getInteger('game');
      }

      const player = await models.Players.findOne({
        where: {
          Game_ID: gameId,
          Discord_ID: interaction.user.id,
        }
      });
     if (!player) {
        return interaction.editReply({ content: "Player not found in game!, please register for the game you wish to move in." });
      }

      const originalTile = await models.Tiles.findOne({
        where: {
          Tile_ID: player.Tile_ID
        }});
      if(interaction.options.getString('path') != null) {
        await utils.verifyinputPath(interaction.options.getString('path'), originalTile.Layer_ID, originalTile.X_Position, originalTile.Y_Position);
      }

      // Determine which body to move (for Twin class)
      const bodyToMove = interaction.options.getInteger('body');

      if (bodyToMove === "2") {
        originalTile = await models.Tiles.findOne({
          where: {
            Tile_ID: player.Tile_ID_2
          }
        });
      } else {
        originalTile = await models.Tiles.findOne({
          where: {
            Tile_ID: player.Tile_ID
          }
        });
      }

      if (!originalTile) {
        return interaction.editReply({ 
          content: "Current tile not found! please register, or ask a Dev about why your not on the board" 
        });
      }
      //#endregion Verification
      //#region Variables
      var iceTileDeduction = 0;
      const distance = interaction.options.getInteger('distance');

      let newX = originalTile.X_Position;
      let newY = originalTile.Y_Position;
      const direction = interaction.options.getString('direction').toLowerCase();

      //Check if player is moving onto an ice tile at any time in their path or run
      //Also used to count the amount of tiles the player is moving for the movement cost calculation
      //Also used to find which tiles should be checked when doing the tile to tile movement updating
      var iceChecklist

      var response = "";
      var lastStringAddedToResponse = "";
      var amountOfRepeats = 0;
      //#endregion Variables

      //#region Calculation of New Position
      if(interaction.options.getString('path') != null){
         for (run in utils.addStartToPathArray(direction, distance, utils.inputPathToArray(interaction.options.getString('path')))) {
        switch (direction) {
          case 'west':
            newX -= distance;
            break;
          case 'east':
            newX += distance;
            break;
          case 'north':
            newY += distance;
            break;
          case 'south':
            newY -= distance;
            break;
          case 'northeast':
            newX += distance;
            newY += distance;
            break;
          case 'northwest':
            newX -= distance;
            newY += distance;
            break;
          case 'southeast':
            newX += distance;
            newY -= distance;
            break;
          case 'southwest':
            newX -= distance;
            newY -= distance;
            break;
          default:
            throw "Invalid direction";
        }
      }}
      else {
        switch (direction) {
          case 'west':
            newX -= distance;
            break;
          case 'east':
            newX += distance;
            break;
          case 'north':
            newY += distance;
            break;
          case 'south':
            newY -= distance;
            break;
          case 'northeast':
            newX += distance;
            newY += distance;
            break;
          case 'northwest':
            newX -= distance;
            newY += distance;
            break;
          case 'southeast':
            newX += distance;
            newY -= distance;
            break;
          case 'southwest':
            newX -= distance;
            newY -= distance;
            break;
        }
      }
      
      // Ensure coordinates don't go above max
      currentLayer = await models.Layers.findOne({where: {Layer_ID: originalTile.Layer_ID}});
      newX = Math.min(currentLayer.X_Bound, newX);
      newY = Math.min(currentLayer.Y_Bound, newY);
//#endregion Calculation of New Position
      

      //iceChecklist represents all the cordinates of the tiles a player is moving onto
      interaction.options.getString('path') == null ? iceChecklist = utils.getTileCordinatesOfLine([originalTile.X_Position, originalTile.Y_Position], [newX, newY]) : iceChecklist = utils.getTileCordinatesOfPath([originalTile.X_Position, originalTile.Y_Position], utils.addStartToPathArray(direction, distance, utils.inputPathToArray(interaction.options.getString('path'))));
      for (cord in iceChecklist) {
        var tile = await models.Tiles.findOne({
          where: {
            X_Position: iceChecklist[cord][0],
            Y_Position: iceChecklist[cord][1]
          }
        });
        if(tile.Tile_Type == "Ice") {
          iceTileDeduction++;
        }
        if(cord == iceChecklist.length && tile.Tile_Type == "Ice") {
          throw "Cannot end a movement on an ice tile, please either provide a path that moves off the ice, or move onto a non-ice tile.";
        }
      }

      const spentAP = utils.moveCost * (iceChecklist.length - iceTileDeduction);

      // Check if player has enough action points
      if (player.Action_Points < spentAP) {
        throw "Player does not enough action points for movement requested.";
      }


      try {
        for (cord in iceChecklist) {
          var cur_Tile = await models.Tiles.findOne({where: {X_Position: iceChecklist[cord][0], Y_Position: iceChecklist[cord][1], Layer_ID: originalTile.Layer_ID}});
          var nxt_Tile = await models.Tiles.findOne({where: {X_Position: iceChecklist[cord + 1][0], Y_Position: iceChecklist[cord + 1][1], Layer_ID: originalTile.Layer_ID}});
          if(lastStringAddedToResponse != `You moved from a ${cur_Tile.Tile_Type} tile to a ${nxt_Tile.Tile_Type} tile! \n`){
            response += `You moved from a ${cur_Tile.Tile_Type} tile to a ${nxt_Tile.Tile_Type} tile! \n`;
            lastStringAddedToResponse = `You moved from a ${cur_Tile.Tile_Type} tile to a ${nxt_Tile.Tile_Type} tile! \n`;
            amountOfRepeats = 1;
          }
          else{
            response += `x${amountOfRepeats + 1} \n`;
          }
          utils.moveFromTiletoTile(cur_Tile, nxt_Tile, player);
        }

        // Add player to new tile
        await utils.movePlayerToTile(
          player.Player_ID, 
          originalTile.Layer_ID, 
          newX, 
          newY
        );

        // Deduct action points
        await models.Players.update(
          { Action_Points: player.Action_Points - spentAP } , 
          {where: {
           Discord_ID: interaction.user.id,
            Player_ID: player.Player_ID,
            Game_ID: gameId
          }}
        );

        //finalize and send the response
        await interaction.editReply({ 
          content: response
        });

        //if player is a spy delete their action logs after 5 seconds
        if(player.Class_ID == models.Classes.findOne({where: {Class_Name: "Spy"}}).Class_ID) {
          await utils.delay(5000);
          await interaction.deleteReply();
        }

      } catch (error) {
        console.error('[ERROR][move.js] Error moving player:', error);
        await interaction.editReply({ 
          content: response + error.message 
        });
      }
  }
  catch (error) {
    console.error('[ERROR][move.js] Error executing move command:', error);
    await interaction.reply({ 
      content: `Error: ${error.message}`, 
      ephemeral: true 
    });
  }}
};