const { SlashCommandBuilder } = require('discord.js');
var models = require("../utils.js").models;

module.exports = {
    cooldown:86400,
    data: new SlashCommandBuilder()
        .setName('cook')
        .setDescription('class command for Chef, give another player in range 2AP & 1 HP and recieve 1 AP. 24hr cooldown')
        .addMentionableOption(option =>
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
        const customer = await models.Players.findOne({where: {Game_ID: gameId, playerId: interaction.options.getMentionable('customer').id}});
        const customersTile = await models.Tiles.findOne({where: {Game_ID: gameId, X_Position: interaction.options.getInteger('x'), Y_Position: interaction.options.getInteger('y')}});  

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
        

    }
};