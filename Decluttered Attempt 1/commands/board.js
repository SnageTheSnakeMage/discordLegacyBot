// commands/layered-grid.js - Layered Grid Command
const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const utils = require('../utils');
var models = utils.models;
const GAMESTATES = require('G:/LegacyBotDiscord/Decluttered Attempt 1/enums.js').GAMESTATES;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('board')
    .setDescription('shows the grid that you are on without input, and the inputted grid if given and your an Oracle')
    .addIntegerOption(option => 
      option.setName('game')
        .setDescription('which grid to show from which game, defaults to oldest active game')
        .setRequired(false))
    .addIntegerOption(option =>
      option.setName('layer')
        .setDescription('which layer of that grid to show, defaults to the one you are on')
        .setRequired(false)
        .set)
    .addIntegerOption(option =>
      option.setName('body')
        .setDescription('(FOR TWIN CLASS) Which body you are trying to see, accepts 1 & 2, defaults to 1. use stats to see which body is where')
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
      const playerClass = await models.Classes.findByPk(player.Class_ID);
      if(playerClass.Class_Name != "Twin" && interaction.options.getInteger('body') != null) {
        interaction.editReply({ content: "You can only choose a body if you are a Twin." });
      }

      var gameId = interaction.options.getInteger('game') ?? utils.getOldestActiveGameId(interaction.user.id);
      const game = await models.Games.findByPk(gameId);
      var layer = interaction.options.getInteger('layer')
      //Check which layer to show the player if they dont provide it, and if they are a twin make sure to show the one with the body they chose
      if(!layer){
        if (interaction.options.getInteger('body') == 2) {
        layer = await models.Layers.findOne({
          where: {
            Layer_ID: await models.Tiles.findOne({
                where: {
                    Tile_ID: player.Tile_ID_2
                }
            }).Layer_ID
          }
        })
      }
      //ellegantly catches all the other cases, if they dont pass a body it defaults to body 1 and if they arent a twin it defaults to the one they are on
      else{
        if(!player.Dead)
        layer = await models.Layers.findOne({
          where: {
            Layer_ID: await models.Tiles.findOne({
                where: {
                    Tile_ID: player.Tile_ID
                }
            }).Layer_ID
          }
        })
      }
    }
      //Check Gamestate
      switch(game.GAMESTATES){
        case GAMESTATES.TIMESTOPPED:
          await interaction.reply({ content: "Time is stopped! only Clockwatchers can use commands at this time.", ephemeral: true });
          return
        case GAMESTATES.DEV_PAUSED:
          await interaction.reply({ content: "Game is paused! only the dev can use commands for this game at this time.", ephemeral: true });
          return
        case GAMESTATES.FINISHED:
          await interaction.reply({ content: "Game is over! only the dev can use commands for this game at this time.\n Please register on a new game.", ephemeral: true });
          return
        case GAMESTATES.REGISTRATION:
          await interaction.reply({ content: "Game is in registration phase! only the dev can use commands for this game at this time.\n Please wait for the game to start.", ephemeral: true });
          return
      }

        // Generate image from database and provided inputs
        const imageBuffer = await utils.GenerateGameGridImage(gameId, layer, player.Player_ID);

        // Create attachment
        const attachment = new AttachmentBuilder(imageBuffer, { name: 'grid.png' });
        
        // Send the image
        await interaction.reply({ files: [attachment] ,  flags: MessageFlags.Ephemeral });
        
    } catch (error) {
      console.error('[ERROR][COMMAND][board.js]:', error);
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