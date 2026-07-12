const { SlashCommandBuilder } = require('discord.js');
const utils = require('../../utils');
var models = utils.models;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('gift')
        .setDescription('gives a player in range an amount of AP')
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('how much AP you wish to give, defaults to 1')
                .setMinValue(1)
                .setRequired(true))
        .addUserOption(option =>
            option.setName('player')
                .setDescription('which player to give the AP to')
                .setRequired(true))        
        .addIntegerOption(option =>
            option.setName('game')
                .setDescription('which game, defaults to oldest active game')
                .setRequired(false)),
    async execute(interaction) {
        await deferredReply(interaction);

        try {
        //Verification of mentionable
        if (!models.Players.findOne({where: {Player_ID: interaction.options.getUser('player').id}})){
            return interaction.editReply({ content: "Player not found in game! Please mention another player in the game inputted." });
        }

        //Variables
        var amount = interaction.options.getInteger('amount');
        var gameId = interaction.options.getInteger('game')  ?? await utils.getOldestActiveGameId(interaction.user.id);
        var recievingPlayerDiscordId = interaction.options.getUser('player').id;
        var remainder = 0;
        var playerDiscordID = interaction.user.id;

        //Get Game and Player
        var game = await models.Games.findByPk(gameId);
        var recievingPlayer = await models.Players.findOne({where: {Game_ID: gameId, Discord_ID: recievingPlayerDiscordId}});
        var player = await models.Players.findOne({where: {Game_ID: gameId, Discord_ID: playerDiscordID}});

        if(player.Dead){
            await interaction.editReply({ content: "Dead players can't use this command."});
            return
        }
        //Check Gamestate
        if(await utils.checkGameState(game.GAMESTATES, false, interaction)){
            return
        }

        //Check if player has enough AP
        if (player.Action_Points < amount) {
            return interaction.editReply({ content: "You dont have that much AP to give!" });
        }

        //Check is the reciever has enough room for the AP
        if (recievingPlayer.Action_Points + amount > recievingPlayer.MAX_AP) {
            remainder = recievingPlayer.MAX_AP - recievingPlayer.Action_Points;
            amount = amount - remainder;
        }

        //Give AP
        await models.Players.update({Action_Points: recievingPlayer.Action_Points + amount}, {where: {Game_ID: gameId, Discord_ID: recievingPlayerDiscordId}});
        //Take AP
        await models.Players.update({Action_Points: player.Action_Points - amount}, {where: {Game_ID: gameId, Discord_ID: playerDiscordID}});
        if(remainder > 0) await models.Players.update({Action_Points: player.Missed_AP + remainder}, {where: {Game_ID: gameId, Discord_ID: recievingPlayerDiscord}});
            return interaction.editReply({ content: interaction.user.username + " gave " + amount + " AP to " + recievingPlayer.Discord_ID });
        }
        catch (error) {
            console.log(error);
            return interaction.editReply({ content: "Something went wrong! Please try again later. Error: " + error.message, ephemeral: true });
        }
    }
}