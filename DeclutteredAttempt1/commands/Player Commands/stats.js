const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder, MessageFlags } = require('discord.js');
const utils = require('../../utils');
var models = utils.models;
module.exports = {
    data: new SlashCommandBuilder()
        .setName('stats')
        .setDescription('displays your stats in a given game')
        .addBooleanOption(option =>
            option.setName('visible')
                .setDescription('wether the stats are publicly or privately shown')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option.setName('game')
                .setDescription('which game, defaults to oldest active game')
                .setRequired(false))
        .addUserOption(option =>
            option.setName('player')
            .setDescription("who's stats you want to see, defaults to you.")
            .setRequired(false)
        ),
    async execute(interaction) {
        const logger200 = globalThis.CommandExecutionLogger.child({file: 'stats.js'})
        if(interaction.options.getBoolean('visible')){
            await interaction.deferReply();
        }
        else{
            await interaction.deferReply({flags: MessageFlags.Ephemeral});
        }
        let seeingPlayer = await models.Players.findOne({where: {Discord_ID: interaction.user.id}})
        let gameId = interaction.options.getInteger('game') 
        let playerDiscordUser = interaction.options.getUser('player')
        if(!gameId) {
            gameId = await utils.getOldestGameId(interaction.user.id);
        }
        if(!playerDiscordUser){
            playerDiscordUser = interaction.user
            var player = await models.Players.findOne({
            where: {
                Game_ID: gameId,
                Discord_ID: interaction.user.id
            }
        });}
        else {
            var player = await models.Players.findOne({
                where: {
                    Game_ID: gameId,
                    Discord_ID: playerDiscordUser.id
                }
            });
        }

        if (!player) {
            throw new Error("Player not found in game! Please register for the game you wish to move in.");
        }
        const game = await models.Games.findByPk(gameId);

        //Check Gamestate
        if(await utils.checkGameState(game.GAME_STATE, false, interaction)){
            return
        }

        const playerClass = await models.Classes.findByPk(player.Class_ID);
        const playerTile = await models.Tiles.findByPk(player.Tile_ID);
        const commonLayerID = `${await utils.dbLayerIDtoCommonLayerID(gameId, playerTile.Layer_ID)}`
        
        var localAttachmentThumbnail = new AttachmentBuilder(`tiles/environment/${playerTile.Tile_Type}.png`, {name: `tileThumbnail.png`})
        var localAttachmentIcon = new AttachmentBuilder(`tiles/players/${player.Discord_ID}.png`, {name: `icon.png`})
        var responseEmbed = new EmbedBuilder()
        .setColor("#" + playerClass.Role_Color)
        .setTitle(playerDiscordUser.username)
        .setDescription("Stats for " + playerDiscordUser.username)
        .setAuthor({ name: playerDiscordUser.username, iconURL: playerDiscordUser.avatarURL() })
        .setThumbnail("attachment://tileThumbnail.png")
        .addFields(
            { name: "Class", value: playerClass.Class_Name, inline: true },
            { name: "Class Description", value: playerClass.Description, inline: true },
            { name: '\u200B', value: '\u200B' },
            { name: "Current/Max/Missed Health", value: `${player.Health_Points.toString()}/${player.MAX_HP.toString()}/${player.MISSED_HP.toString()}`, inline: true },
            { name: "Current/Max/Missed Action Points", value: `${player.Action_Points.toString()}/ ${player.MAX_AP.toString()}/${player.MISSED_AP.toString()}`, inline: true },
            { name: "Current/Max Damage", value: `${(player.Damage * (player.DMG_BUFF + 1)).toString()}/${player.MAX_DAMAGE.toString()}`},
            { name: "Current/Max Range", value: `${player.Range_.toString()}/${player.MAX_RANGE.toString()}` },
            { name: '\u200B', value: '\u200B' },
            { name: "Current Tile", value: playerTile.Tile_Type, inline: true },
            { name: "Kills", value: player.Kills.toString(), inline: true },
        )
        .setImage(`attachment://icon.png`)
        .setTimestamp()
        .setFooter({ text: "Game ID: " + player.Game_ID });
        if(playerClass.Class_Name != "Spy" && playerClass.Class_Name != "Twin") {
            responseEmbed.addFields(
                //{ name: '\u200B', value: '\u200B' },
                { name: "X Position", value: playerTile.X_Position.toString(), inline: true },
                { name: "Y Position", value: playerTile.Y_Position.toString(), inline: true },
                { name: "Layer", value: commonLayerID, inline: true },
            )
        }
        switch(playerClass.Class_Name){
            case "Twin":
                var playerTile2 = await models.Tiles.findByPk(player.Tile_ID2);
                const commonLayerID2 = `${await utils.dbLayerIDtoCommonLayerID(gameId, playerTile2.Layer_ID)}`
                responseEmbed.addFields(
                { name: '\u200B', value: '\u200B' },
                { name: "Second Body's Layer", value: commonLayerID2, inline: true },
                { name: "Second Body's X Position", value: playerTile2.X_Position.toString(), inline: true },
                { name: "Second Body's Y Position", value: playerTile2.Y_Position.toString(), inline: true },
            )
            break;
            case "Pharaoh":
                responseEmbed.addFields(
                    { name: "Pharaoh HP", value: player.Pharoh_HP.toString(), inline: true}
                )
            break;
            case "Chef":
                responseEmbed.addFields(
                    { name: "Meals", value: player.Meals.toString(), inline: true}
                )
                break;
            default:
                if(player.Pharoh_HP > 0){
                    responseEmbed.addFields(
                        { name: '\u200B', value: '\u200B' },
                        { name: "Pharaoh HP", value: player.Pharoh_HP}
                    )
                }
        }
        await interaction.editReply({ embeds: [responseEmbed], files: [localAttachmentIcon,localAttachmentThumbnail]});
    }
}