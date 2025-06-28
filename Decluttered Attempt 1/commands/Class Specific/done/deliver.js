const { SlashCommandBuilder } = require('discord.js');
const utils = require('../utils');
var models = require("../utils.js").models;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('deliver')
        .setDescription('class command for Mailmen, give another player your AP')
        .addUserOption(option =>
            option.setName('receiver')
                .setDescription('which player you deliver the AP to')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('# AP you wish to deliver'))
        .addIntegerOption(option =>
            option.setName('game')
                .setDescription('which game, defaults to oldest active game')
                .setRequired(false)),
    async execute(interaction) {
        await interaction.deferReply();
        //Variables
        const gameId = interaction.options.getInteger('game') ?? await utils.getOldestActiveGameId();
        const player = await models.Player.findOne({where: {discord_id: interaction.user.id, Game_ID: gameId}});
        const receiver = await models.Player.findOne({where: {discord_id: interaction.options.getUser('receiver').id, Game_ID: gameId}});

        //Check if the game is in timestop
        if(game.GAME_STATE == GAMESTATES.TIMESTOPPED && playerClass.Class_Name == "Clockwatcher")
        {
          await interaction.editReply("Time is stopped! only Clockwatchers can use commands at this time.");
          return
        }

        //Check if player is a Mailman
        if (player.Class != "Mailman") {
            return interaction.editReply({ content: "You are not a Mailman!" });
        }

        //Check if the receiver is in the game
        if (!receiver) {
            return interaction.editReply({ content: "The receiver is not in the game!" });
        }

        //Check if the player has enough AP
        if (player.Action_Points < interaction.options.getInteger('amount')) {
            return interaction.editReply({ content: "You dont have enough AP to deliver!" });
        }

        //Give reciever the AP
        await models.Player.update({Action_Points: receiver.Action_Points + interaction.options.getInteger('amount')}, {where: {playerId: receiver.playerId}}); 
        await models.Player.update({Action_Points: player.Action_Points - interaction.options.getInteger('amount')}, {where: {playerId: player.playerId}});

        return interaction.editReply({ content: "You have delivered " + interaction.options.getInteger('amount') + "AP to " + interaction.options.getUser('receiver').username + "!" });
    }
};