const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const { Sequelize, where } = require('sequelize');
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
        .setDescription('left, up, north, southwest, etc. Use /help for full list')
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
        .setMinValue(0)
      )

    .addIntegerOption(option =>
      option.setName('body(for Twin class)')
        .setDescription('which body you are moving, accepts 1 & 2, defaults to 1')
        .setRequired(false))
    .addIntegerOption(option =>
      option.setName('game')
        .setDescription('which game, defaults to oldest active game')
        .setRequired(false)),

  async execute(interaction) {
    await interaction.deferReply();
    
    if(!interaction.options.getInteger('game')) {
      gameId = await utils.getOldestActiveGameId();
    }
    else {
      gameId = interaction.options.getInteger('game');
    }

    // Get player data
    const player = await models.Players.findOne({
      where: {
        Game_ID: gameId,
        Discord_ID: interaction.user.id,
      }
    });

    if (!player) {
      return interaction.editReply({ content: "Player not found!, please register" });
    }

    const distance = interaction.options.getInteger('distance');
    const spentAP = utils.moveCost * distance;

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
    let currentTile;

    if (bodyToMove === "2") {
      currentTile = await models.Tiles.findOne({
        where: {
          Tile_ID: player.Tile_ID_2
        }
      });
    } else {
      currentTile = await models.Tiles.findOne({
        where: {
          Tile_ID: player.Tile_ID
        }
      });
    }

    if (!currentTile) {
      return interaction.editReply({ 
        content: "Current tile not found! please register, or ask a Dev about why your not on the board" 
      });
    }

    // Calculate new position
    let newX = currentTile.X_Position;
    let newY = currentTile.Y_Position;
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

    // Ensure coordinates don't go above max
    currentLayer = await models.Layers.findOne({where: {Layer_ID: currentTile.Layer_ID}});
    newX = Math.min(currentLayer.X_Bound, newX);
    newY = Math.min(currentLayer.Y_Bound, newY);

    var response = "";
    var lastStringAddedToResponse = "";
    var amountOfRepeats = 0;
    try {
    var movementCords = utils.getTileCordinatesOfLine([currentTile.X_Position, currentTile.Y_Position], [newX, newY]);
    for (cord in movementCords) {
      var cur_Tile = await models.Tiles.findOne({where: {X_Position: movementCords[cord][0], Y_Position: movementCords[cord][1], Layer_ID: currentTile.Layer_ID}});
      var nxt_Tile = await models.Tiles.findOne({where: {X_Position: movementCords[cord + 1][0], Y_Position: movementCords[cord + 1][1], Layer_ID: currentTile.Layer_ID}});
      if(lastStringAddedToResponse != `You moved from a ${cur_Tile.Tile_Type} tile to a ${nxt_Tile.Tile_Type} tile! \n`){
        response += `You moved from a ${cur_Tile.Tile_Type} tile to a ${nxt_Tile.Tile_Type} tile! \n`;
        lastStringAddedToResponse = `You moved from a ${cur_Tile.Tile_Type} tile to a ${nxt_Tile.Tile_Type} tile! \n`;
        amountOfRepeats = 0;
      }
      else{
        amountOfRepeats += 1;
        response += `x${amountOfRepeats + 1} \n`;
      }
      utils.moveFromTiletoTile(cur_Tile, nxt_Tile, player);
    }

      // Add player to new tile
      await utils.movePlayerToTile(
        player.Player_ID, 
        currentTile.Layer_ID, 
        newX, 
        newY
      );

      // Get the new tile information
      const newTile = await models.Tiles.findOne({
        where: {
          Layer_ID: currentTile.Layer_ID,
          X_Position: newX,
          Y_Position: newY
        }
      });
      
      await interaction.editReply({ 
        content: response
      });

    } catch (error) {
      console.error('Error moving player:', error);
      await interaction.editReply({ 
        content: response + "That last tile is full, restricted(meaning you cant move on it lke Void or Wall) or an error occurred!" 
      });
    }
  }
};