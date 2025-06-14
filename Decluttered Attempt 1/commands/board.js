// commands/layered-grid.js - Layered Grid Command
const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const { GenerateGameGridImagewithSight, GenerateGameGridImagewithoutSight } = require('../../utils');
const { Sequelize, where } = require('sequelize');
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: 'G:/LegacyBotDiscord/Decluttered Attempt 1/database/database'
});
var models = initModels(sequelize);

module.exports = {
  data: new SlashCommandBuilder()
    .setName('board')
    .setDescription('shows the grid that you are on without input, and the inputted grid if given and your an Oracle')
    .addIntegerOption(option => 
      option.setName('game')
        .setDescription('which grid to show from which game')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('layer')
        .setDescription('which layer of that grid to show')
        .setRequired(false)),
  // Aliases for text-based commands
  aliases: ['playergrid', 'grid'],
  
  // Function for slash command execution
  async execute(interaction) {
    try {
      await interaction.deferReply();

      var player = await models.Players.findOne({
        where: {
          Game_ID: interaction.options.getInteger('game'),
          discordId: interaction.user.id
        }
      })

      var layer = await models.Layers.findOne({
        where: {
          Layer_ID: await models.Tiles.findOne({
              where: {
                  Tile_ID: player.Tile_ID
              }
          }).Layer_ID
        }
      })

        // Generate layered grid image from data
        if(interaction.user.roles.cache.some(role => role.name === 'Oracle')){
            if(interaction.options.getString('layer') == null){
                const imageBuffer = await GenerateGameGridImagewithSight(player.Game_ID, layer.Layer_ID);
            }
            else{
                const imageBuffer = await GenerateGameGridImagewithSight(player.Game_ID, interaction.options.getString('layer'));
            }
        }
        if (interaction.user.roles.cache.some(role => role.name === 'Minesweeper')){ 
            const imageBuffer = await GenerateGameGridImagewithSight(player.Game_ID, layer.Layer_ID);
        }
        else {
            const imageBuffer = await GenerateGameGridImagewithoutSight(player.Game_ID, layer.Layer_ID);
        }
        
        // Create attachment
        const attachment = new AttachmentBuilder(imageBuffer, { name: 'grid.png' });
        
        // Send the image
        await interaction.reply({ files: [attachment] ,  flags: MessageFlags.Ephemeral });
        await interaction.deleteReply();
    } catch (error) {
      console.error('[ERROR][COMMAND] layered-grid.execute: Error executing grid_dev command:', error);
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply(`Error: ${error.message}`);
      } else {
        await interaction.reply({ content: `Error: ${error.message}`, ephemeral: true });
      }
    }
  },
  
// Function for traditional message command execution
//   async onMessage(message, args) {
//     try {
//       // Send a "processing" message
//       const processingMsg = await message.reply('generating grid image...');
      
      
//       // Generate layered grid image from data
//       if(interaction.user.roles.cache.some(role => role.name === 'Oracle') || interaction.user.roles.cache.some(role => role.name === 'Minesweeper')){ 
//         const imageBuffer = await GenerateGameGridImagewithSight(args[0], args[1]);
//       }
//       else {
//         const imageBuffer = await GenerateGameGridImagewithoutSight(args[0], args[1]);
//       }
      
//       // Create attachment
//       const attachment = new AttachmentBuilder(imageBuffer, { name: 'layered_grid.png' });
      
//       // Send the image and delete the processing message
//       await interaction.user.send({ files: [attachment] });
//       processingMsg.delete().catch(console.error);
      
//     } catch (error) {
//       console.error('[ERROR][COMMAND] layered-grid.onMessage: Error generating layered grid:', error);
//       message.reply(`Error: ${error.message}`);
//     }
//   }
};