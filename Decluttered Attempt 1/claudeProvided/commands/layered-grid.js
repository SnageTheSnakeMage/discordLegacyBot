// commands/layered-grid.js - Layered Grid Command
const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const { GenerateGameGridImage } = require('../utils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('grid_dev')
    .setDescription('shows that games grid and layer, dev command')
    .addStringOption(option => 
      option.setName('layer')
        .setDescription('which layer to show')
        .setRequired(true))
    .addStringOption(option => 
      option.setName('game')
        .setDescription('which grid to show from which game')
        .setRequired(true)),
  // Aliases for text-based commands
  aliases: ['gridDev'],
  
  // Function for slash command execution
  async execute(interaction) {
    try {
      await interaction.deferReply();

        // Generate layered grid image from data
        const imageBuffer = await GenerateGameGridImage(interaction.options.getString('game'), interaction.options.getString('layer'));
        
        // Create attachment
        const attachment = new AttachmentBuilder(imageBuffer, { name: 'layered_grid.png' });
        
        // Send the image
        await interaction.editReply({ files: [attachment] });
      
    } catch (error) {
      console.error('[ERROR][COMMAND] layered-grid.execute: Error executing layered-grid command:', error);
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
      const processingMsg = await message.reply('generating grid image...');
      
      
      // Generate layered grid image from data
      const imageBuffer = await GenerateGameGridImage(args[0], args[1]);
      
      // Create attachment
      const attachment = new AttachmentBuilder(imageBuffer, { name: 'layered_grid.png' });
      
      // Send the image and delete the processing message
      await message.reply({ files: [attachment] });
      processingMsg.delete().catch(console.error);
      
    } catch (error) {
      console.error('[ERROR][COMMAND] layered-grid.onMessage: Error generating layered grid:', error);
      message.reply(`Error: ${error.message}`);
    }
  }
};