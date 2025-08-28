const { SlashCommandBuilder } = require('discord.js');
const utils = require('../utils');
var models = utils.models;
const ICON_REQUIREMENTS = {
  WIDTH: 80,
  HEIGHT: 80,
  FORMAT: 'image/png',
};
const GAMESTATES = utils.GAMESTATES;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('register')
    .setDescription('adds a player to a game')
    .addAttachmentOption(option =>
      option.setName('icon')
        .setDescription('represents your position on the game board, must be a 80x80 pixel png')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('game')
        .setDescription('which game, defaults to oldest registering game')
        .setRequired(false)),

  async execute(interaction) {
    try {
      await interaction.deferReply();
      
      // Step 1: Validate and gather inputs
      const registrationData = await this.validateRegistrationInput(interaction);
      console.log("[INFO][VERBOSE][register.js] Registration data verified as: " + JSON.stringify(registrationData));
      // Step 2: Check if registration is allowed
      await this.checkRegistrationEligibility(registrationData);
      
      // Step 3: Perform the registration
      await this.performRegistration(registrationData);
      
      // Step 4: Confirm success
      await interaction.editReply({ 
        content: "Player registered! Use the stats command to see where you are, your class, and your stats" 
      });
      
    } catch (error) {
      await this.handleRegistrationError(interaction, error);
    }
  },

  async validateRegistrationInput(interaction) {
    // Get game ID with proper validation
    let gameId = interaction.options.getInteger('game');
    if (!gameId) {
      console.log("[INFO][VERBOSE][validateRegistrationInput] No game ID provided, using oldest registering game");
      gameId = await utils.getOldestGamestateGameId(null, GAMESTATES.REGISTRATION);
    }
    
    // Validate game exists and is active
    try{
      var game = await models.Games.findByPk(gameId);
    }catch(error){
      throw new Error("Game not found. Please check the game ID.");
    }
    if (game.GAME_STATE !== GAMESTATES.REGISTRATION) {
      throw new Error("Cannot register for games not in registration phase.");
    }
    if(await models.Players.count({where: {Game_ID: gameId}}) >= game.playerMax){
      throw new Error("Game is full. Please try another game.");
    }

    
    // Validate player icon
    const playerIcon = interaction.options.getAttachment('icon');
    this.validateIconRequirements(playerIcon);
    
    return {
      gameId,
      playerId: interaction.user.id,
      playerIcon,
      game
    };
  },

  validateIconRequirements(attachment) {
    
    if (attachment.contentType !== ICON_REQUIREMENTS.FORMAT) {
      throw new Error("The file is a " + attachment.contentType + " file. Player icon must be a PNG file");
    }
    
    if (attachment.width !== ICON_REQUIREMENTS.WIDTH || attachment.height !== ICON_REQUIREMENTS.HEIGHT) {
      throw new Error(`Player icon must be exactly ${ICON_REQUIREMENTS.WIDTH}x${ICON_REQUIREMENTS.HEIGHT} pixels`);
    }
  },

  async checkRegistrationEligibility(registrationData) {
    // Check if player is already registered in this game
    try {
      var existingPlayer = await models.Players.findOne({
      where: {
        Game_ID: registrationData.gameId,
        Discord_ID: registrationData.playerId
      }
    });
    } catch (error) {
      existingPlayer = null;
    }
    console.error("[ERROR][VERBOSE][checkRegistrationEligibility] Player: " + JSON.stringify(existingPlayer) + " Is already registered in Game: " + registrationData.gameId);
    if (existingPlayer) {
      throw new Error("You are already registered in this game");
    }
  },

  async performRegistration(registrationData) {
    const { gameId, playerId, playerIcon } = registrationData;
    await utils.registerPlayer(gameId, playerId, playerIcon);
  },

  async handleRegistrationError(interaction, error) {
    //Make sure to delete any populated DB rows
    if(typeof registrationData !== "undefined") {
      var existingPlayer = await models.Players.findOne({
        where: {
          Game_ID: registrationData.gameId,
          Discord_ID: registrationData.playerId
        }});
    }
    if(!error.message == "You are already registered in this game" && existingPlayer){
      await models.Players.destroy({where: {Game_ID: registrationData.gameId, Discord_ID: registrationData.playerId}});
      console.log("[INFO][VERBOSE][handleRegistrationError] Player: " + registrationData.playerId + " was removed from Game: " + registrationData.gameId);
    }
    // Tell the user & me what went wrong
    console.error('[ERROR][register.js] Registration failed:', error);
    const errorMessage = error.message || "Registration failed. Please try again or contact support.";
    await interaction.editReply({ content: errorMessage });
  }
};