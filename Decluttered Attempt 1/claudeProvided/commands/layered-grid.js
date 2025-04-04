// commands/layered-grid.js - Layered Grid Command
const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const { generateLayeredGridFromArrays, parseLayeredGridData } = require('../utils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('layered-grid')
    .setDescription('Generate a grid with environment, mines, and player layers')
    .addStringOption(option => 
      option.setName('data')
        .setDescription('JSON data for the grid layers')
        .setRequired(true)),
  
  // Aliases for text-based commands
  aliases: ['layered-grid'],
  
  // Function for slash command execution
  async execute(interaction) {
    try {
      await interaction.deferReply();
      
      // Get JSON data from option
      // const jsonData = interaction.options.getString('data');
      
      try {
        // Parse the grid data
        // const gridData = JSON.parse(jsonData);
        
        // // Validate grid data
        // if (!gridData || !gridData[global.LAYERS.ENVIRONMENT]) {
        //   return interaction.editReply('Invalid grid format. Environment layer is required.');
        // }

        
        // Generate layered grid image from data
        const imageBuffer = await generateLayeredGridFromArrays();
        
        // Create attachment
        const attachment = new AttachmentBuilder(imageBuffer, { name: 'layered_grid.png' });
        
        // Send the image
        await interaction.editReply({ files: [attachment] });
        
      } catch (parseError) {
        console.error('Error parsing JSON:', parseError);
        await interaction.editReply(`Error parsing JSON: ${parseError.message}`);
      }
      
    } catch (error) {
      console.error('Error executing layered-grid command:', error);
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
      // Send a "processing" message
      const processingMsg = await message.reply('Processing your layered grid...');
      
      // Parse the grid data from the message
      const gridData = parseLayeredGridData(message.content);
      
      // Validate grid data
      if (!gridData || !gridData[global.LAYERS.ENVIRONMENT]) {
        await processingMsg.delete().catch(console.error);
        return message.reply('Invalid grid format. Environment layer is required.');
      }
      
      // Generate layered grid image from data
      const imageBuffer = await generateLayeredGridFromArrays(gridData);
      
      // Create attachment
      const attachment = new AttachmentBuilder(imageBuffer, { name: 'layered_grid.png' });
      
      // Send the image and delete the processing message
      await message.reply({ files: [attachment] });
      processingMsg.delete().catch(console.error);
      
    } catch (error) {
      console.error('Error generating layered grid:', error);
      message.reply(`Error: ${error.message}`);
    }
  }
};