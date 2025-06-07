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
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('distance')
        .setDescription('how many tiles you move')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('body(for Twin class)')
        .setDescription('which body you are moving, accepts 1 & 2, defaults to 1')
        .setRequired(false)),

  async execute(interaction) {
    await interaction.deferReply();
    
    // Get player data
    const player = await models.Players.findOne({
      where: {
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
      case 'left':
      case 'west':
      case 'w':
      case 'l':
        newX -= distance;
        break;

      case 'right':
      case 'east':
      case 'e':
      case 'r':
        newX += distance;
        break;

      case 'up':
      case 'north':
      case 'n':
      case 'u':
        newY += distance;
        break;

      case 'down':
      case 'south':
      case 's':
      case 'd':
        newY -= distance;
        break;

      case 'northeast':
      case 'ne':
      case 'tl':
      case 'top left':
      case 'top-left':
        newX += distance;
        newY += distance;
        break;

      case 'northwest':
      case 'nw':
      case 'tr':
      case 'top right':
      case 'top-right':
        newX -= distance;
        newY += distance;
        break;

      case 'southeast':
      case 'se':
      case 'bl':
      case 'bottom left':
      case 'bottom-left':
        newX += distance;
        newY -= distance;
        break;

      case 'southwest':
      case 'sw':
      case 'br':
      case 'bottom right':
      case 'bottom-right':
        newX -= distance;
        newY -= distance;
        break;

      default:
        return interaction.editReply({ 
          content: "Invalid direction! Use '/help move' for valid directions." 
        });
    }

    // Ensure coordinates don't go below 0
    newX = Math.max(0, newX);
    newY = Math.max(0, newY);

    try {
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
        content: `You moved to a ${newTile.Tile_Type} tile!` 
      });

    } catch (error) {
      console.error('Error moving player:', error);
      await interaction.editReply({ 
        content: "That tile is full or an error occurred!" 
      });
    }
  }
};