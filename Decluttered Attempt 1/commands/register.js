const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const { Sequelize, where } = require('sequelize');
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: 'G:/LegacyBotDiscord/Decluttered Attempt 1/database/database'
});
var models = initModels(sequelize);
const utils = require('../utils');

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
        .setDescription('which game, defaults to oldest active game')
        .setRequired(false)),

  async execute(interaction) {
    await interaction.deferReply();
    
    if(!interaction.options.getInteger('game')) {
      gameId = await utils.getOldestActiveGameId();
    }
    else {
      gameId = interaction.options.getInteger('game');
    }
    
    const playerIcon = interaction.options.getAttachment('icon');
    if(playerIcon.width != 80 || playerIcon.height != 80) return interaction.editReply({ content: "Player icon must be 80x80 pixels!" }); 
    if(playerIcon.contentType != "image/png") return interaction.editReply({ content: "Player icon must be a png!" });
    const playerId = interaction.user.id;
    
    await utils.registerPlayer(gameId, playerId, playerIcon);
    await interaction.editReply({ content: "Player registered! use the stats command to see where you are, your class, and your stats" });
    
  }
};