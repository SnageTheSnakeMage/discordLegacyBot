const { SlashCommandBuilder } = require('discord.js');
const utils = require('../utils');
var models = require("../utils.js").models;

module.exports = {
    cooldown:86400,
    data: new SlashCommandBuilder()
        .setName('cook')
        .setDescription('class command for Chef, give another player in range 2AP & 1 HP and recieve 1 AP. 24hr cooldown')
        .addUserOption(option =>
            option.setName('customer')
                .setDescription('which player you cook for')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('x')
                .setDescription('X coordinate of your customer')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('y')
                .setDescription('Y coordinate of your customer')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('game')
                .setDescription('which game, defaults to oldest active game')
                .setRequired(false)),
    async execute(interaction) {
        await interaction.deferReply();

        //Variables
        const gameId = interaction.options.getInteger('game') ?? await utils.getOldestActiveGameId();
        const player = await models.Players.findOne({where: {Game_ID: gameId, playerId: interaction.user.id}});
        const customer = await models.Players.findOne({where: {Game_ID: gameId, playerId: interaction.options.getUser('customer').id}});
        const customersTile = await models.Tiles.findOne({where: {Game_ID: gameId, X_Position: interaction.options.getInteger('x'), Y_Position: interaction.options.getInteger('y')}});  

        //Check if the game is in timestop
        if(game.GAME_STATE == GAMESTATES.TIMESTOPPED && playerClass.Class_Name == "Clockwatcher")
        {
          await interaction.editReply("Time is stopped! only Clockwatchers can use commands at this time.");
          return
        }

        //Check if player is a Chef
        if (player.Class != "Chef") {
            return interaction.editReply({ content: "You are not a Chef!" });
        }

        //Check if the customer is on the tile provided
        if (customer.Tile_ID != customersTile.Tile_ID) {
            return interaction.editReply({ content: "The customer is not on the tile provided!" });
        }

        //Check if player is in range of their customer
        const tileInRange = utils.getTileCordinatesOfLine([player.X_Position, player.Y_Position], [customersTile.X_Position, customersTile.Y_Position]).length <= player.Range_;
        if (!tileInRange) {
            return interaction.editReply({ content: "Your customer is not in range!" });
        }

        //Check if the customer is in the game
        if (!customer) {
            return interaction.editReply({ content: "The customer is not in the game!" });
        }

        //Check if the player is in the game
        if (!player) {
            return interaction.editReply({ content: "You are not in the game!" });
        }

        //Give reciever the AP & HP
        await models.Players.update({Action_Points: customer.Action_Points + 2}, {where: {playerId: customer.playerId}}); 
        await models.Players.update({Health: player.Health + 1}, {where: {playerId: customer.playerId}});

        //Give player the AP
        await models.Players.update({Action_Points: player.Action_Points + 1}, {where: {playerId: player.playerId}}); 

        return interaction.editReply({ content: "You have cooked for " + interaction.options.getUser('customer').username + " giving them 2 AP & 1 HP and yourself 1 AP!" });
        

    }
};