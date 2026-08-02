// commands/layered-grid.js - Layered Grid Command
const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const utils = require('../../utils');
const logger200 = commandExecutionLogger.child({file: 'grid_dev.js'})

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
   if(interaction.user.id != process.env.DEV_ID) return;
    try {
      await interaction.deferReply();

        // Generate layered grid image from data
        const imageBuffer = await utils.GenerateGameGridImage(interaction.options.getString('game'), interaction.options.getString('layer'));
        
        // Create attachment
        const attachment = new AttachmentBuilder(imageBuffer, { name: 'grid.png' });
        
        // Send the image
        await interaction.user.send({ files: [attachment] });
        await interaction.deleteReply();
    } catch (error) {
      logger200.error({function:"execute"}, "Error executing grid_dev command:', error");
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply(`Error: ${error.message}`);
      } else {
        await interaction.reply({ content: `Error: ${error.message}`, ephemeral: true });
      }
    }
  },
}
  
  // Function for traditional message command execution
//   async onMessage(message, args) {
//     try {
//       // Send a "processing" message
//       await interaction.deferReply({flags: MessageFlags.Ephemeral});
      
//       // Generate layered grid image from data
//       const imageBuffer = await utils.GenerateGameGridImage(args[0], args[1]);
      
//       // Create attachment
//       const attachment = new AttachmentBuilder(imageBuffer, { name: 'layered_grid.png' });
      
//       // Send the image and delete the processing message
//       await interaction.editReply({ files: [attachment] });
//     } catch (error) {
//       console.error('[ERROR][COMMAND] layered-grid.onMessage: Error generating layered grid:', error);
//       message.reply(`Error: ${error.message}`);
//     }
//   }
// };