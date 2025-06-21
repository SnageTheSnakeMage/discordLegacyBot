const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const { Sequelize } = require('sequelize');
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: 'G:/LegacyBotDiscord/Decluttered Attempt 1/database/database'
});
var models = initModels(sequelize);
const utils = require('../utils');

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
      option.setName('body(for Twin class)')
        .setDescription('which body you are moving, accepts 1 & 2, defaults to 1')
        .setRequired(false))
    .addIntegerOption(option =>
      option.setName('game')
        .setDescription('which game, defaults to oldest active game')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('path')
        .setDescription('a collection of directions and distances, required if you wish to move on an ice tile, "direction,distance;direction,distance;..."')
        .setRequired(false)),


  async execute(interaction) {

    await interaction.deferReply();
    try{
      utils.commandResolutionErrorThrower();

      //Verification & Variables

      const player = await models.Players.findOne({
        where: {
          Game_ID: gameId,
          Discord_ID: interaction.user.id,
        }
      });

      const originalTile = await models.Tiles.findOne({
        where: {
          Tile_ID: player.Tile_ID
        }});

      if(!interaction.options.getInteger('game')) {
        gameId = await utils.getOldestActiveGameId();
      }
      else {
        gameId = interaction.options.getInteger('game');
      }
      if(interaction.options.getString('path') != null) {
        await utils.verifyinputPath(interaction.options.getString('path'), originalTile.Layer_ID, originalTile.X_Position, originalTile.Y_Position);
      }



      if (!player) {
        return interaction.editReply({ 
          content: "Player not found!, please register" 
        });
      }

      // Calculate new position
      let newX = originalTile.X_Position;
      let newY = originalTile.Y_Position;
      const direction = interaction.options.getString('direction').toLowerCase();

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
      
      var iceTileDeduction = 0;
      const distance = interaction.options.getInteger('distance');
      var lastTileIsIce = false;

      var iceChecklist = utils.getTileCordinatesOfLine([originalTile.X_Position, originalTile.Y_Position], [newX, newY]);
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
          lastTileIsIce = true
          if(interaction.options.getString('path') == null) {
            interaction.editReply({
              content: "You must provide a path to move onto an ice tile"
            });}
          else {
            
          }
        }
      }

      const spentAP = utils.moveCost * (distance - iceTileDeduction);

      // Check if player has enough action points
      if (player.Action_Points < spentAP) {
        return interaction.editReply({ 
          content: "Not enough action points!" 
        });
      }

      // Deduct action points
      await models.Players.update({
        Action_Points: player.Action_Points - spentAP
      }, {
        where: {
          Discord_ID: interaction.user.id
        }
      });

      // Determine which body to move (for Twin class)
      const bodyToMove = interaction.options.getInteger('body(for Twin class)');

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

      // Ensure coordinates don't go above max
      currentLayer = await models.Layers.findOne({where: {Layer_ID: originalTile.Layer_ID}});
      newX = Math.min(currentLayer.X_Bound, newX);
      newY = Math.min(currentLayer.Y_Bound, newY);

      var response = "";
      var lastStringAddedToResponse = "";
      var amountOfRepeats = 0;
      try {
        
        var movementCords = utils.getTileCordinatesOfLine([originalTile.X_Position, originalTile.Y_Position], [newX, newY]);
        for (cord in movementCords) {
          
          var cur_Tile = await models.Tiles.findOne({where: {X_Position: movementCords[cord][0], Y_Position: movementCords[cord][1], Layer_ID: originalTile.Layer_ID}});
          var nxt_Tile = await models.Tiles.findOne({where: {X_Position: movementCords[cord + 1][0], Y_Position: movementCords[cord + 1][1], Layer_ID: originalTile.Layer_ID}});
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
        if(lastTileIsIce) {

        }

        // Add player to new tile
        await utils.movePlayerToTile(
          player.Player_ID, 
          originalTile.Layer_ID, 
          newX, 
          newY
        );
        
        await interaction.editReply({ 
          content: response
        });

        //if player is a spy delete their action logs after 10 seconds
        if(player.Class_ID == 38){
          await utils.delay(10000);
        await interaction.deleteReply();
        }

      } catch (error) {
        console.error('Error moving player:', error);
        await interaction.editReply({ 
          content: response + error.message 
        });
      }
  }
  catch (error) {
    console.error('Error executing move command:', error);
    await interaction.reply({ 
      content: `Error: ${error.message}`, 
      ephemeral: true 
    });
  }}
};