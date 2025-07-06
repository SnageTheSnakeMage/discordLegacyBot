const { SlashCommandBuilder } = require('discord.js');
const utils = require('../../utils');
var models = utils.models;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('gift')
        .setDescription('gives a player in range an amount of AP')
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('# of times you wish to upgrade the stat defaults to 1')
                .setRequired(true))
        .addUserOption(option =>
            option.setName('player')
                .setDescription('which player to give the AP to')
                .setRequired(true)        
        .addIntegerOption(option =>
            option.setName('game')
                .setDescription('which game, defaults to oldest active game')
                .setRequired(false))),
    
    async execute(interaction) {
        await deferredReply(interaction);

        try {
        //Verification of mentionable
        if (!models.Players.findOne({where: {playerId: interaction.options.getUser('player').id}})){
            return interaction.editReply({ content: "Player not found in game! Please mention another player in the game inputted." });
        }

        //Variables
        var amount = interaction.options.getInteger('amount');
        var gameId = interaction.options.getInteger('game');
        var recievingPlayerDiscordId = interaction.options.getUser('player').id;
        var remainder = 0;
        var playerDiscordID = interaction.user.id;

        //Get Game and Player
        var gameId = await models.Games.findByPk(gameId ?? await utils.getOldestActiveGameId());
        var recievingPlayer = await models.Players.findOne({where: {Game_ID: gameId.Game_ID, playerId: recievingPlayerDiscordId}});
        var player = await models.Players.findOne({where: {Game_ID: gameId.Game_ID, playerId: playerDiscordID}});

        if(player.Dead){
        await interaction.reply({ content: "Dead players can't use this command.", ephemeral: true });
        return
        }
      //Check Gamestate
      switch(game.GAMESTATES){
        case GAMESTATES.TIMESTOPPED:
          await interaction.reply({ content: "Time is stopped! only Clockwatchers can use commands at this time.", ephemeral: true });
          return
        case GAMESTATES.PAUSED:
          await interaction.reply({ content: "Game is paused! only the dev can use commands for this game at this time.", ephemeral: true });
          return
        case GAMESTATES.FINISHED:
          await interaction.reply({ content: "Game is over! only the dev can use commands for this game at this time.\n Please register on a new game.", ephemeral: true });
          return
        case GAMESTATES.REGISTRATION:
          await interaction.reply({ content: "Game is in registration phase! only the dev can use commands for this game at this time.\n Please wait for the game to start.", ephemeral: true });
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
        await models.Players.update({Action_Points: recievingPlayer.Action_Points + amount}, {where: {Game_ID: gameId.Game_ID, playerId: recievingPlayerDiscordId}});
        await models.Players.update({Action_Points: player.Action_Points - amount}, {where: {Game_ID: gameId.Game_ID, playerId: playerDiscordID}});
        if(remainder > 0) await models.Players.update({Action_Points: player.Missed_AP + remainder}, {where: {Game_ID: gameId.Game_ID, playerId: recievingPlayerDiscord}});

        return interaction.editReply({ content: "You have given " + amount + " AP to " + recievingPlayer.Discord_ID });
        }
        catch (error) {
            console.log(error);
            return interaction.editReply({ content: "Something went wrong! Please try again later. Error: " + error.message, ephemeral: true });
        }
    }
}