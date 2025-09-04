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
        .setDescription('which grid to show from which game, defaults to oldest active/registration game you are in')
        .setRequired(false))
    .addIntegerOption(option =>
      option.setName('layer')
        .setDescription('which layer of that grid to show, defaults to the one you are on')
        .setRequired(false))
    .addIntegerOption(option =>
      option.setName('body')
        .setDescription('(FOR TWIN CLASS) Which body you are trying to see, defaults to 1.')
        .setRequired(false)
        .setMaxValue(2)
        .setMinValue(1)),
  // Aliases for text-based commands
  aliases: ['playergrid', 'grid'],
  
  // Function for slash command execution
  async execute(interaction) {
    try {
      await interaction.deferReply({ ephemeral: true });

      var commandVariables = await this.validateInputsAndGetVariables(interaction);

      utils.checkGameState(commandVariables.game.GAME_STATE, commandVariables.playerClass.Class_Name == "Clockwatcher", interaction);

      // Generate image from database and provided inputs

      if(commandVariables.body == 2){
        commandVariables.imageBuffer = await utils.GenerateGameGridImage(commandVariables.gameId, commandVariables.layer, commandVariables.player.Player_ID);
      }
      else{
        commandVariables.imageBuffer = await utils.GenerateGameGridImage(commandVariables.gameId, commandVariables.layer, commandVariables.player.Player_ID);
      } 

      // Create attachment
      const attachment = new AttachmentBuilder(commandVariables.imageBuffer, { name: 'grid.png' });
      
      // Send the image
      await interaction.editReply({ files: [attachment] ,  ephemeral: true });
        
    } catch (error) {
      console.error('[ERROR][board.js][execute]:', error);
      await interaction.editReply('[ERROR][board.js][execute]:', error);
    }
  },
  async validateInputsAndGetVariables(interaction){
    try
    {
      var gameId = interaction.options.getInteger('game') ?? await utils.getOldestGameId(interaction.user.id);
      var body = interaction.options.getInteger('body') ?? 1;
      var player = await models.Players.findOne({
        where: {
          Game_ID:gameId,
          Discord_ID: interaction.user.id
        }
      })

      const playerTile = await models.Tiles.findOne({ where: { Tile_ID: player.Tile_ID } });
      
      const playerClass = await models.Classes.findByPk(player.Class_ID);
      if(playerClass.Class_Name != "Twin" && interaction.options.getInteger('body') != null) {
        interaction.editReply({ content: "You can only choose a body if you are a Twin." });
      }


      const game = await models.Games.findByPk(gameId);
      var layer = interaction.options.getInteger('layer')
      //Check which layer to show the player if they dont provide it, and if they are a twin make sure to show the one with the body they chose
      if(!layer){
        if (interaction.options.getInteger('body') == 2) {
        var playerTile2 = await models.Tiles.findOne({ where: { Tile_ID: player.Tile_ID_2 }})
        layer = await models.Layers.findOne({ where: { Layer_ID:  playerTile2.Layer_ID }})
        layer = await utils.dbLayerIDtoCommonLayerID(gameId, layer.Layer_ID)
      }
      //ellegantly catches all the other cases, if they dont pass a body it defaults to body 1 and if they arent a twin it defaults to the one they are on
      else{
        if(!player.Dead){
          layer = await models.Layers.findOne({
            where: {
              Layer_ID: playerTile.Layer_ID
            }
          })
          layer = await utils.dbLayerIDtoCommonLayerID(gameId, layer.Layer_ID)
        }
        else{
          interaction.editReply({ content: "Dead players can't use this command.", ephemeral: true });
          return
        }
      }
    }
    var imageBuffer

    return {gameId, body, player, playerTile, playerClass, game, layer, playerTile2, imageBuffer};
  }
  catch (error) {
    console.error('[ERROR][board.js][validateInputsAndGetVariables]:', error);
    await interaction.editReply('[ERROR][board.js][execute]:', error);
  }
 },

};