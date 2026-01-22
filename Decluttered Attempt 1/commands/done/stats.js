const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const utils = require('../../utils');
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
        await interaction.deferReply();
        let gameId = interaction.options.getInteger('game') 
        if(!gameId) {
            gameId = await utils.getOldestActiveGameId();
        }
        const player = await models.Players.findOne({
            where: {
                Game_ID: gameId,
                Discord_ID: interaction.user.id
            }
        });
        if (!player) {
            throw new Error("Player not found in game! Please register for the game you wish to move in.");
        }
        const game = await models.Games.findByPk(gameId);

        //Check if the game is in timestop
        if(game.GAME_STATE == GAMESTATES.TIMESTOPPED && playerClass.Class_Name != "Clockwatcher")
        {
          await interaction.editReply("Time is stopped! only Clockwatchers can use commands at this time.");
          return
        }
        //Check if the game is paused
        if(game.GAME_STATE == GAMESTATES.PAUSED)
        {
          await interaction.editReply("Game is paused! only the dev can use commands for this game at this time.");
          return
        }

        const playerClass = await models.Classes.findByPk(player.Class_ID);
        const playerTile = await models.Tiles.findByPk(player.Tile_ID);
        var playerTIle2
        if(playerClass.name == "Twin") {
            playerTile2 = await models.Tiles.findByPk(player.Tile_ID_2);
        }
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
            { name: "Health", value: player.Health_Points.toString(), inline: true },
            { name: "Max Health", value: player.MAX_HP.toString(), inline: true },
            { name: "Missed Health", value: player.MISSED_HP.toString(), inline: true },
            { name: '\u200B', value: '\u200B' },
            { name: "Action Points", value: player.Action_Points.toString(), inline: true },
            { name: "Max Action Points", value: player.MAX_AP.toString(), inline: true },
            { name: "Missed Action Points", value: player.MISSED_AP.toString(), inline: true },
            { name: '\u200B', value: '\u200B' },
            { name: "Damage", value: (player.Damage * (player.DMG_BUFF + 1)).toString(), inline: true },
            { name: "Max Damage", value: player.MAX_DMG.toString(), inline: true },
            { name: '\u200B', value: '\u200B' },
            { name: "Range", value: player.Range_.toString(), inline: true },
            { name: "Max Range", value: player.MAX_RANGE.toString(), inline: true },
            { name: '\u200B', value: '\u200B' },
            { name: "Current Tile", value: playerTile.Tile_Type, inline: true },
            { name: '\u200B', value: '\u200B' },
            { name: "Kills", value: player.Kills.toString(), inline: true },
        )
        .setImage("Decluttered Attempt 1/tiles/players/" + player.Discord_ID + ".png")
        .setTimestamp()
        .setFooter({ text: "Game ID: " + player.Game_ID });
        if(playerClass.Class_Name != "Spy" && playerClass.Class_Name != "Twin") {
            responseEmbed.addFields(
                { name: '\u200B', value: '\u200B' },
                { name: "X Position", value: playerTile.X_Position.toString(), inline: true },
                { name: "Y Position", value: playerTile.Y_Position.toString(), inline: true },
                { name: "Layer", value: utils.dbLayerIDtoCommonLayerID(playerTile.Layer_ID).toString(), inline: true },
            )
        }
        if(playerClass.Class_Name == "Twin") {
            responseEmbed.addFields(
                { name: '\u200B', value: '\u200B' },
                { name: "Second Body's Layer", value: utils.dbLayerIDtoCommonLayerID(playerTile2.Layer_ID).toString(), inline: true },
                { name: "Second Body's X Position", value: playerTile2.X_Position.toString(), inline: true },
                { name: "Second Body's Y Position", value: playerTile2.Y_Position.toString(), inline: true },
            )
        }
        await interaction.reply({ embeds: [responseEmbed] });
    }
}