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
        '**Grid Bot Commands**\n\n' +
        '`/layered-grid` - Generate a grid with environment, mines, and player layers\n' +
        '`/layered-grid-custom` - Generate a grid with custom tile size\n' +
        '`/layered-grid-setup` - Show setup instructions for layered tiles\n' +
        '`/help` - Show this help message\n\n' +
        'For legacy text commands, replace `/` with `!` (e.g., `!layered-grid`)';
      
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
        '**Grid Bot Commands**\n\n' +
        '`!layered-grid {...}` - Generate a grid with environment, mines, and player layers\n' +
        '`!layered-grid-custom 64 {...}` - Generate a grid with custom tile size\n' +
        '`!layered-grid-setup` - Show setup instructions for layered tiles\n' +
        '`!help` - Show this help message\n\n' +
        'Slash commands are also available (e.g., `/layered-grid`)';
      
      message.reply(helpText);
      
    } catch (error) {
      console.error('Error displaying help:', error);
      message.reply(`Error: ${error.message}`);
    }
  }
};