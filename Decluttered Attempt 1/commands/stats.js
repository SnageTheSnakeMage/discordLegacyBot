const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const utils = require('../utils');
var models = utils.models;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stats')
        .setDescription('displays your stats in a given game')
        .addIntegerOption(option =>
            option.setName('game')
                .setDescription('which game, defaults to oldest active game')
                .setRequired(true)),
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        let gameId = interaction.options.getInteger('game') 
        let game = await models.Games.findByPk(gameId);
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
        const playerLayer = await utils.dbLayerIDtoCommonLayerID(gameId, playerTile.Layer_ID)
        var playerTile2
        var playerLayer2


        var playerTileImg = new AttachmentBuilder("G:/LegacyBotDiscord/Decluttered Attempt 1/tiles/environment/" + playerTile.Tile_Type + ".png") //tiles\players\326874852541595668.png
        var playerImg = new AttachmentBuilder('./tiles/players/' + player.Discord_ID + '.png'); //G:/LegacyBotDiscord/Decluttered Attempt 1/tiles/environment/Blank2.png


        if(playerClass.name == "Twin") {
            playerTile2 = await models.Tiles.findByPk(player.Tile_ID_2);
            playerLayer2 = await utils.dbLayerIDtoCommonLayerID(gameId, playerTile2.Layer_ID)
        }
        var responseEmbed = new EmbedBuilder()
        .setColor("#" + playerClass.Role_Color)
        .setTitle(interaction.user.username)
        .setDescription("Stats for " + interaction.user.username)
        .setAuthor({ name: interaction.user.username, iconURL: interaction.user.displayAvatarURL() })
        .setThumbnail("attachment://" + playerTile.Tile_Type + ".png")
        .addFields(
            { name: "Class", value: playerClass.Class_Name, inline: true },
            { name: "Class Description", value: playerClass.Description, inline: true },
            { name: '\u200B', value: '\u200B' },
            { name: "Health", value: player.Health_Points.toString(), inline: true },
            { name: "Max Health", value: player.MAX_HP.toString(), inline: true },
            { name: "Missed Health", value: player.MISSED_HP.toString(), inline: true },
            { name: "Action Points", value: player.Action_Points.toString(), inline: true },
            { name: "Max Action Points", value: player.MAX_AP.toString(), inline: true },
            { name: "Missed Action Points", value: player.MISSED_AP.toString(), inline: true },
            { name: "Damage", value: (player.Damage * (player.DMG_BUFF + 1)).toString(), inline: true },
            { name: "Max Damage", value: player.MAX_DAMAGE.toString(), inline: true },
            { name: '\u200B', value: '\u200B', inline: true },
            { name: "Range", value: player.Range_.toString(), inline: true },
            { name: "Max Range", value: player.MAX_RANGE.toString(), inline: true },
            { name: '\u200B', value: '\u200B', inline: true },
            { name: "Current Tile", value: playerTile.Tile_Type, inline: true },
            { name: "Kills", value: player.Kills.toString(), inline: true },
        )
        .setImage("attachment://" + player.Discord_ID + ".png")
        .setTimestamp()
        .setFooter({ text: "Game ID: " + player.Game_ID });
        if(playerClass.Class_Name != "Spy" && playerClass.Class_Name != "Twin") {
            responseEmbed.addFields(
                { name: '\u200B', value: '\u200B' },
                { name: "X Position", value: playerTile.X_Position.toString(), inline: true },
                { name: "Y Position", value: playerTile.Y_Position.toString(), inline: true },
                { name: "Layer", value: playerLayer.toString(), inline: true },
            )
        }
        if(playerClass.Class_Name == "Twin") {
            responseEmbed.addFields(
                { name: '\u200B', value: '\u200B' },
                { name: "Second Body's Layer", value: playerLayer2.toString(), inline: true },
                { name: "Second Body's X Position", value: playerTIle2.X_Position.toString(), inline: true },
                { name: "Second Body's Y Position", value: playerTile2.Y_Position.toString(), inline: true },
            )
        }
        console.log("attachment://" + player.Discord_ID + ".png" )
        console.log("G:/LegacyBotDiscord/Decluttered Attempt 1/tiles/environment/" + playerTile.Tile_Type + ".png")
        //TODO MAKE SURE TO BE USING EDITREPLY AND NOT REPLY
        //TODO make the embed pretty
        await interaction.editReply({ embeds: [responseEmbed], files: [playerTileImg, playerImg]});
    }
}