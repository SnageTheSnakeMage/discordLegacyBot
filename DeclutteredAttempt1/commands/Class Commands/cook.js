const { SlashCommandBuilder } = require('discord.js');
const utils = require('../../utils.js');
var models = require("../../utils.js").models;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('cook')
        .setDescription('class command for Chef, give a player in range 2AP & 1 HP and recieve 1 AP.')
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
        const gameId = interaction.options.getInteger('game') ?? await utils.getOldestGameId();
        const player = await models.Players.findOne({where: {Game_ID: gameId, Discord_ID: interaction.user.id}});
        const customer = await models.Players.findOne({where: {Game_ID: gameId, Discord_ID: interaction.options.getUser('customer').id}});
        const playersTile = await models.Tiles.findByPk(player.Tile_ID);
        const customersTile = await models.Tiles.findOne({where: {Layer_ID: playersTile.Layer_ID, X_Position: interaction.options.getInteger('x'), Y_Position: interaction.options.getInteger('y')}});  

        //Check Gamestate
        if(await utils.checkGameStateAndReply(game.GAME_STATE, false, interaction)){
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
        const tileInRange = utils.getTileCordinatesOfLine([playersTile.X_Position, playersTile.Y_Position], [customersTile.X_Position, customersTile.Y_Position]).length <= player.Range_;
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

        //Check if player has enough meals
        if(player.Meals <= 0){
            return interaction.editReply({content: "You don't have enough ingriedients for a meal! Wait until next AP distribution"})
        }

        //Give reciever the AP & HP
        await models.Players.update({Action_Points: customer.Action_Points + 2}, {where: {Player_ID: customer.Player_ID}}); 
        await models.Players.update({Health_Points: customer.Health_Points + 1}, {where: {Player_ID: customer.Player_ID}});

        //Give player the AP
        await models.Players.update({Action_Points: player.Action_Points + 1, Meals: player.Meals - 1}, {where: {Player_ID: player.Player_ID}}); 

        return interaction.editReply({ content: "You have cooked for " + interaction.options.getUser('customer').username + " giving them 2 AP & 1 HP and yourself 1 AP!" });
        

    }
};