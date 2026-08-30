const { SlashCommandBuilder } = require('discord.js');
const utils = require('../../utils.js');
var models = require("../../utils.js").models;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('hotpotato')
        .setDescription('class command for the Hot Potato, swap Classes with a player in range for 12AP')
        .addUserOption(option =>
            option.setName('victim')
                .setDescription('which player to swap classes with')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('x')
                .setDescription('X coordinate of your victim')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('y')
                .setDescription('Y coordinate of your victim')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('game')
                .setDescription('which game, defaults to oldest active game')
                .setRequired(false)),
    async execute(interaction) {
        await deferReply(interaction);

        //Variables
        var x = interaction.options.getInteger('x');
        var y = interaction.options.getInteger('y');
        var gameId = interaction.options.getInteger('game') ?? await utils.getOldestGameId();
        var player = await models.Players.findOne({where: {Game_ID: gameId, Discord_ID: interaction.user.id}});
        var victim = await models.Players.findOne({where: {Game_ID: gameId, Discord_ID: interaction.options.getUser('victim').id}});
        var playersTile = await models.Tiles.findByPk(player.Tile_ID);
        var victimTile = await models.Tiles.findOne({where: {Layer_ID: playersTile.Layer_ID, X_Position: x, Y_Position: y}});
        var game = await models.Games.findOne({where: {Game_ID: gameId}});

        //Check Gamestate
        if(await utils.checkGameState(game.GAME_STATE, false, interaction)){
            return
        }

        //Check the player is a hot potato
        if (player.Class != "Hot Potato") {
            return interaction.editReply({ content: "You are not a Hot Potato!" });
        }

        //Check the victim is in the game
        if (!victim) {
            return interaction.editReply({ content: "The victim is not in the game!" });
        }

        //Check victim is one their tile
        if (victim.Tile_ID != victimTile.Tile_ID) {
            return interaction.editReply({ content: "The victim is not on the tile provided!" });
        }

        //Check if player is in range of their victim
        const tileInRange = utils.getTileCordinatesOfLine([playersTile.X_Position, playersTile.Y_Position], [victimTile.X_Position, victimTile.Y_Position]).length <= player.Range_;
        if (!tileInRange) {
            return interaction.editReply({ content: "Your victim is not in range!" });
        }

        //Check if the player has enough AP
        if (player.Action_Points < 12) {
            return interaction.editReply({ content: "You dont have enough AP to swap classes!" });
        }

        //Swap classes
        var extraResponse = await utils.hotPotatoSwap(player, victim, interaction.user.username, interaction.options.getUser('victim').username);
        await models.Players.update({Class_ID: victim.Class_ID}, {where: {Player_ID: player.Player_ID}}); 
        await models.Players.update({Class_ID: player.Class_ID}, {where: {Player_ID: victim.Player_ID}}); 
        

        return interaction.editReply({ content: "You have swapped classes with " + interaction.options.getUser('victim').username + "!\n" + extraResponse });
    },
};