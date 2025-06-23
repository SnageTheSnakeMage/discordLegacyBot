const { SlashCommandBuilder } = require('discord.js');
const utils = require('../../utils');
var models = utils.models;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('retrieve')
        .setDescription('retrieves AP from a game\'s chest')
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('# of AP you wish to take out of the chest defaults to 1')
                .setRequired(false))
        .addIntegerOption(option =>
            option.setName('game')
                .setDescription('which game, defaults to oldest active game')
                .setRequired(false)),
    async execute(interaction) {
        await deferredReply(interaction);
        try {
        //Variables
        var amount = interaction.options.getInteger('amount');
        var gameId = interaction.options.getInteger('game');
        var playerDiscordID = interaction.user.id;

        //Get Game and Player
        var game = await models.Games.findByPk(gameId ?? await utils.getOldestActiveGameId());
        const player = await models.Players.findOne({where: {Game_ID: gameId.Game_ID, playerId: playerDiscordID}});
        const playerTile = await models.Tiles.findByPk(player.Tile_ID);

        //Check if player is on a chest tile
        if(playerTile.Tile_Type != "Chest") {
            return interaction.editReply({ content: "You are not on a chest tile!" });
        }

        //Check if there is that much AP in the chest
        if(game.CHEST_AMOUNT < amount) {
            return interaction.editReply({ content: "There is not enough AP in the chest!" });
        }

        //Give player AP from the chest
        await models.Games.update({CHEST_AMOUNT: game.CHEST_AMOUNT - amount}, {where: {Game_ID: game.Game_ID}}); 
        await models.Players.update({Action_Points: player.Action_Points + amount}, {where: {playerId: player.playerId}});

        return interaction.editReply({ content: "You have retrieved " + amount + " AP from the chest!" });
    }
    catch (error) {
     return interaction.editReply({ content: "An error occurred: " + error.message || "Unknown error", ephemeral: true});
    }
    }
};