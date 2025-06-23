const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const utils = require('../utils');
var models = utils.models;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stats')
        .setDescription('displays your stats in a given game')
        .addIntegerOption(option =>
            option.setName('game')
                .setDescription('which game, defaults to oldest active game')
                .setRequired(false)),
    async execute(interaction) {
        let gameId = interaction.options.getInteger('game');
        const player = await models.Players.findOne({
            where: {
                Game_ID: gameId,
                Discord_ID: interaction.user.id
            }
        });
        if (!player) {
            throw new Error("Player not found in game! Please register for the game you wish to move in.");
        }
        const playerClass = await models.Classes.findByPk(player.Class_ID);
        const playerTile = await models.Tiles.findByPk(player.Tile_ID);
        var responseEmbed = new EmbedBuilder()
        .setColor("#" + playerClass.Role_Color)
        .setTitle(interaction.user.username)
        .setDescription("Stats for " + interaction.user.username)
        .setAuthor({ name: interaction.user.username, iconURL: interaction.user.avatarURL() })
        .setThumbnail("Decluttered Attempt 1/tiles/environment/" + playerTile.Tile_Type + ".png")
        .addFields(
            { name: "Class", value: playerClass.Class_Name, inline: true },
            { name: "Class Description", value: playerClass.Description, inline: true },
            { name: '\u200B', value: '\u200B' },
            { name: "Health", value: player.Health_Points, inline: true },
            { name: "Max Health", value: playerClass.MAX_HP, inline: true },
            { name: "Missed Health", value: player.MISSED_HP, inline: true },
            { name: '\u200B', value: '\u200B' },
            { name: "Action Points", value: player.Action_Points, inline: true },
            { name: "Max Action Points", value: playerClass.MAX_AP, inline: true },
            { name: "Missed Action Points", value: player.MISSED_AP, inline: true },
            { name: '\u200B', value: '\u200B' },
            { name: "Damage", value: player.Damage, inline: true },
            { name: "Max Damage", value: playerClass.MAX_DMG, inline: true },
            { name: '\u200B', value: '\u200B' },
            { name: "Range", value: player.Range_, inline: true },
            { name: "Max Range", value: playerClass.MAX_RANGE, inline: true },
            { name: '\u200B', value: '\u200B' },
            { name: "Current Tile", value: playerTile.Tile_Type, inline: true },
            { name: '\u200B', value: '\u200B' },
            { name: "Kills", value: player.Kills, inline: true },
        )
        .setImage("Decluttered Attempt 1/tiles/players/" + player.Discord_ID + ".png")
        .setTimestamp()
        .setFooter({ text: "Game ID: " + player.Game_ID });
        if(playerClass.Class_Name != "Spy") {
            responseEmbed.addFields(
                { name: '\u200B', value: '\u200B' },
                { name: "X_Position", value: playerTile.X_Position, inline: true },
                { name: "Y_Position", value: playerTile.Y_Position, inline: true },
                { name: "Layer", value: utils.dbLayerIDtoCommonLayerID(playerTile.Layer_ID), inline: true },
            )
        }
        await interaction.reply({ embeds: [responseEmbed] });
    }
}