// commands/help.js - Help Command
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show available grid commands and how to use them'),
  
  // Aliases for text-based commands
  aliases: ['help'],
  
  // Function for slash command execution
  async execute(interaction) {
    try {
      const helpText = 
        'PUT HELP TEXT HERE';
      
      await interaction.reply({ content: helpText, ephemeral: false });
      
    } catch (error) {
      console.error('Error executing help command:', error);
      await interaction.reply({ 
        content: `Error: ${error.message}`, 
        ephemeral: true 
      });
    }
  },
  
  // Function for traditional message command execution
  async onMessage(message, args) {
    try {
      const helpText = 
        'PUT HELP TEXT HERE';
      
      message.reply(helpText);
      
    } catch (error) {
      console.error('Error displaying help:', error);
      message.reply(`Error: ${error.message}`);
    }
  }
};