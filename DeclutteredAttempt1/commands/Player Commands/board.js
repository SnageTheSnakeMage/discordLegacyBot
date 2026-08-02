// commands/layered-grid.js - Layered Grid Command
const { SlashCommandBuilder, AttachmentBuilder, MessageFlags } = require('discord.js');
const utils = require('../../utils');
var models = utils.models;
const GAMESTATES = require('../../enums.js').GAMESTATES;
const logger200 = commandExecutionLogger.child({file: 'board.js'})
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
        .setRequired(false))
    .addIntegerOption(option =>
      option.setName('body')
        .setDescription('(FOR TWIN CLASS) Which body you are trying to see, defaults to 1')
        .setRequired(false)
      .addChoices(
        { name: "Body 1", value: 1 },
        { name: "Body 2", value: 2 }
      )),
  // // Aliases for text-based commands
  // aliases: ['playergrid', 'grid'],
  // Function for slash command execution
  //TODO ADD LOGGING
  async execute(interaction) {
    try {
      await interaction.deferReply({flags: MessageFlags.Ephemeral});
      const inputs = this.inputValidation(interaction)
      const attachment = await this.logic(inputs)
      await interaction.editReply({ files: [attachment] });
    } catch (error) {
      logger200.error({function: "execute"}, error);
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply(`Error: ${error.message}`);
      } else {
        await interaction.reply({ content: `Error: ${error.message}`, ephemeral: true });
      }
    }
  },
  async inputValidation(interaction){
    var gameId = interaction.options.getInteger('game') ?? await utils.getOldestGameId(interaction.user.id);
    logger200.silent({function: "inputValidation"}, `set gameId to ${gameId}`)
    var player = await models.Players.findOne({
      where: {
        Game_ID: gameId,
        Discord_ID: interaction.user.id
      }
    })
    logger200.silent({function: "inputValidation"}, `set player to ${JSON.stringify(player)}`)
    const playerClass = await models.Classes.findByPk(player.Class_ID);
    logger200.silent({function: "inputValidation"}, `set playerClass to ${JSON.stringify(playerClass)}`)
    const game = await models.Games.findByPk(gameId);
    logger200.silent({function: "inputValidation"}, `set game to ${JSON.stringify(game)}`)
    var layer = interaction.options.getInteger('layer')
    logger200.silent({function: "inputValidation"}, `set layer to ${JSON.stringify(layer)}`)
    var commonOrDB = true;

    //Check which layer to show the player if they dont provide it, and if they are a twin make sure to show the one with the body they chose
    if(layer == null){
      commonOrDB = false
      if (interaction.options.getInteger('body') == 2) {
        const playerTile2 = await models.Tiles.findByPk(player.Tile_ID_2)
        layer = playerTile2.Layer_ID
        logger200.debug({function: "execute"}, `layer not provided setting layer variable to ${playerTile.Layer_ID}`)
      }
      else{
        if(playerClass.Class_Name != "Oracle"){
          const playerTile = await models.Tiles.findByPk(player.Tile_ID)
          layer = playerTile.Layer_ID
          logger200.debug({function: "execute"}`layer not provided setting layer variable to ${playerTile.Layer_ID}`)
        }
    }
  }
  
  //Check gamestate
  logger200.debug({function: "inputValidation"}, `checking gamestate`)
  switch (game.GAME_STATE) {
    case GAMESTATES.TIMESTOPPED:
      if(playerClass.Class_Name != "Clockwatcher")
      {
        await interaction.editReply("Time is stopped! only Clockwatchers can use commands at this time.");
        return;
      }
      break;
    case GAMESTATES.PAUSED:
      await interaction.editReply("Game is paused! only the dev can use commands for this game at this time.");
      return;
    case GAMESTATES.OVER:
      await interaction.editReply("Game has ended! only the dev can use commands for this game at this time.\n Please register for a new game.");
      return;
    case GAMESTATES.REGISTRATION:
      if(commonOrDB){
        // Generate image from database and provided inputs
        const imageBuffer = await utils.GenerateGameGridImage(gameId, layer, player.Player_ID);
        // Create attachment
        const attachment = new AttachmentBuilder(imageBuffer, { name: 'grid.png' });
        await interaction.editReply({ content: "Game is in registration! only the dev can use commands for this game at this time.\n Please wait for the game to start.", files: [attachment] });
        return;
      }
      else{
        layer = await utils.dbLayerIDtoCommonLayerID(gameId, layer)
        // Generate image from database and provided inputs
        const imageBuffer = await utils.GenerateGameGridImage(gameId, layer, player.Player_ID);
        // Create attachment
        const attachment = new AttachmentBuilder(imageBuffer, { name: 'grid.png' });
        await interaction.editReply({ content: "Game is in registration! only the dev can use commands for this game at this time.\n Please wait for the game to start.", files: [attachment] });
        return;
      }
    default:
      break;
  }

  return {
    commonOrDB,
    gameId,
    layer,
    player,
  }
  },
  async logic(inputs){
    if(inputs.commonOrDB){
        // Generate image from database and provided inputs
        const imageBuffer = await utils.GenerateGameGridImage(inputs.gameId, inputs.layer, inputs.player.Player_ID);
        // Create attachment
        const attachment = new AttachmentBuilder(imageBuffer, { name: 'grid.png' });
      }
      else {
        inputs.layer = await utils.dbLayerIDtoCommonLayerID(inputs.gameId, inputs.layer)
        // Generate image from database and provided inputs
        const imageBuffer = await utils.GenerateGameGridImage(inputs.gameId, inputs.layer, inputs.player.Player_ID);

        // Create attachment
        const attachment = new AttachmentBuilder(imageBuffer, { name: 'grid.png' });
      }
      return attachment
  }
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