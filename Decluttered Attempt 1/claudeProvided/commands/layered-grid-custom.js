// commands/layered-grid-custom.js - Custom Sized Layered Grid Command
const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const { generateLayeredGridFromArrays, parseLayeredGridData } = require('../utils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('layered-grid-custom')
    .setDescription('Generate a grid with custom tile size')
    .addIntegerOption(option => 
      option.setName('size')
        .setDescription('Tile size in pixels (16-256)')
        .setRequired(true)
        .setMinValue(16)
        .setMaxValue(256))
    .addStringOption(option => 
      option.setName('data')
        .setDescription('JSON data for the grid layers')
        .setRequired(true)),
  
  // Aliases for text-based commands
  aliases: ['layered-grid-custom'],
  
  // Function for slash command execution
  async execute(interaction) {
    try {
      await interaction.deferReply();
      
      // Get parameters from options
      const tileSize = interaction.options.getInteger('size');
      const jsonData = interaction.options.getString('data');
      
      try {
        // Parse the grid data
        const gridData = JSON.parse(jsonData);
        
        // Validate grid data
        if (!gridData || !gridData[global.LAYERS.ENVIRONMENT]) {
          return interaction.editReply('Invalid grid format. Environment layer is required.');
        }
        
        // Generate and send the image
        const imageBuffer = await generateLayeredGridFromArrays(gridData, tileSize);
        const attachment = new AttachmentBuilder(imageBuffer, { name: 'custom_layered_grid.png' });
        
        await interaction.editReply({ files: [attachment] });
        
      } catch (parseError) {
        console.error('Error parsing JSON:', parseError);
        await interaction.editReply(`Error parsing JSON: ${parseError.message}`);
      }
      
    } catch (error) {
      console.error('Error executing layered-grid-custom command:', error);
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply(`Error: ${error.message}`);
      } else {
        await interaction.reply({ content: `Error: ${error.message}`, ephemeral: true });
      }
    }
  },
  
  // Function for traditional message command execution
  async onMessage(message, args) {
    try {
      // Format: !layered-grid-custom 64 { "environment": [[...]], ... }
      const parts = message.content.split(' ');
      const tileSize = parseInt(parts[1], 10);
      
      if (isNaN(tileSize) || tileSize < 16 || tileSize > 256) {
        return message.reply('Invalid tile size. Please use a number between 16 and 256.');
      }
      
      // Get the grid data (everything after the tile size)
      const dataText = message.content.substring(message.content.indexOf('{'));
      const gridData = JSON.parse(dataText);
      
      // Validate grid data
      if (!gridData || !gridData[global.LAYERS.ENVIRONMENT]) {
        return message.reply('Invalid grid format. Environment layer is required.');
      }
      
      // Generate and send the image
      const imageBuffer = await generateLayeredGridFromArrays(gridData, tileSize);
      const attachment = new AttachmentBuilder(imageBuffer, { name: 'custom_layered_grid.png' });
      message.reply({ files: [attachment] });
      
    } catch (error) {
      console.error('Error generating custom layered grid:', error);
      message.reply(`Error: ${error.message}`);
    }
  }
};