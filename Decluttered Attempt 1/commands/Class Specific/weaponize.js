const { SlashCommandBuilder } = require('discord.js');
const utils = require('../utils');
var models = require("../utils.js").models;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('weaponize')
        .setDescription('class command for Blacksmiths, give a x2 dmg buff to anyone in ranges next attack  for 6AP')
        .addUserOption(option =>
            option.setName('player')
                .setDescription('which player you wish to give the buff to, defaults to yourself')
                .setRequired(false))
        .addIntegerOption(option =>
            option.setName('x')
                .setDescription('X coordinate of the player to give the buff to')
                .setRequired(false))
        .addIntegerOption(option =>
            option.setName('y')
                .setDescription('Y coordinate of the player to give the buff to')
                .setRequired(false))
        .addIntegerOption(option =>
            option.setName('game')
                .setDescription('which game, defaults to oldest active game')
                .setRequired(false)),
    async execute(interaction) {
        await deferReply(interaction);

        //Variables
        var targetId = interaction.options.getUser('player').id ?? interaction.user.id;
        var x = interaction.options.getInteger('x');
        var y = interaction.options.getInteger('y');
        var gameId = interaction.options.getInteger('game');
        var player = await models.Players.findOne({where: {Game_ID: gameId, playerId: interaction.user.id}});
        var playersTile = await models.Tiles.findOne({where: {Tile_ID: player.Tile_ID}});
        var targetTile = await models.Tiles.findOne({where: {Layer_ID: playersTile.Layer_ID, X_Position: x, Y_Position: y}});
        var targetPlayer = await models.Players.findOne({where: {Game_ID: gameId, playerId: targetId}});

        //Check if the tile provided is in the game
        if (!targetTile) {
            return interaction.editReply({ content: "The tile provided is not in the game!" });
        }

        //Check the target is on the tile provided
        if (targetTile.Tile_ID != targetPlayer.Tile_ID) {
            return interaction.editReply({ content: "Your target is not on the tile provided!" });
        }

        //Check the target is in range
        const tileInRange = utils.getTileCordinatesOfLine([player.X_Position, player.Y_Position], [targetTile.X_Position, targetTile.Y_Position]).length <= player.Range_;
        if (!tileInRange) {
            return interaction.editReply({ content: "Your target is not in range!" });
        }

        //Check the player is a Blacksmith
        if (player.Class != "Blacksmith") {
            return interaction.editReply({ content: "You are not a Blacksmith!" });
        }

        //Check the target is in the game
        if (!targetId) {
            return interaction.editReply({ content: "Could not find target player!" });
        }

        //Check if the player has enough AP
        if (player.Action_Points < 6) {
            return interaction.editReply({ content: "You dont have enough AP to weaponize!" });
        }

        //Give the target the buff
        await models.Players.update({DMG_BUFF: targetPlayer.DMG_BUFF + 1}, {where: {Game_ID: gameId, playerId: targetId}});

        //Take the AP
        await models.Players.update({Action_Points: player.Action_Points - 6}, {where: {Game_ID: gameId, playerId: interaction.user.id}});

        //Send message
        //TODO add in duration system and timestamps
        return interaction.editReply({ content: "You have given " + interaction.options.getUser('player').username + " a double damage buff! it will expire " });
    },
};
