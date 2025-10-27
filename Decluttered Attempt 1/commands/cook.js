const { SlashCommandBuilder } = require('discord.js');
const utils = require('../utils.js');
var models = require("../utils.js").models;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('cook')
        .setDescription('command for Chef, give another player 2AP & 1 HP and recieve 1 AP, once per AP distribution')
        .addUserOption(option =>
            option.setName('customer')
                .setDescription('which player you cook for')
                .setRequired(true))
        //Need position incase they are trying to select the body of a twin
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
        const gameId = interaction.options.getInteger('game') ?? await utils.getOldestActiveGameId(interaction.user.id);
        const player = await models.Players.findOne({where: {Game_ID: gameId, Discord_ID: interaction.user.id}});
        const playerClass = await models.Classes.findByPk(player.Class_ID)
        const customer = await models.Players.findOne({where: {Game_ID: gameId, Discord_ID: interaction.options.getUser('customer').id}});
        const customersTile = await models.Tiles.findOne({where: {Game_ID: gameId, X_Position: interaction.options.getInteger('x'), Y_Position: interaction.options.getInteger('y')}});  

        if(player.Dead){
            await interaction.editReply({ content: "Dead players can't use this command."});
            return
        }

        //Check Gamestate
        if(await utils.checkGameState(game.GAMESTATES, false, interaction)){
            return
        }

        //Check if player is a Chef
        if (playerClass != "Chef") {
            return interaction.editReply({ content: "You are not a Chef!" });
        }

        const playersOnCustomerTile = [customersTile.Player1, customersTile.Player2, customersTile.Player3, customersTile.Player4];
        //Check if the customer is on the tile provided
        if (!playersOnCustomerTile.includes(customer.Player_ID)) {
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

        //Check if the player has a Meal to cook
        if (player.Meals <= 0) {
            return interaction.editReply({ content: "You have no Meals to cook! Wait until next AP Distribution" });
        }

        //Give reciever the AP & HP
        await models.Players.update({Action_Points: customer.Action_Points + 2, Health: player.Health + 1}, {where: {Player_ID: customer.Player_ID}}); 

        //Give player the AP and take a Meal
        await models.Players.update({Action_Points: player.Action_Points + 1, Meals: player.Meals - 1}, {where: {Player_ID: player.Player_ID}}); 

        return interaction.editReply({ content: interaction.user.username + " cooked for " + interaction.options.getUser('customer').username + " giving " + interaction.options.getUser('customer').username +  " 2 AP & 1 HP and recieves 1 AP!" });
        

    }
};