const { SlashCommandBuilder } = require('discord.js');
const utils = require('../utils.js');
var models = require("../utils.js").models;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('deliver')
        .setDescription('class command for Mailmen to give another player your AP & anyone wanting to give Mailmen AP')
        .addUserOption(option =>
            option.setName('receiver')
                .setDescription('which player you deliver the AP to')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('How AP you wish to deliver, defaults to 1')
                .setRequired(false))
        .addIntegerOption(option =>
            option.setName('game')
                .setDescription('which game, defaults to oldest active game')
                .setRequired(false)),
    async execute(interaction) {
        await interaction.deferReply();
        //Variables
        const gameId = interaction.options.getInteger('game') ?? await utils.getOldestActiveGameId(interaction.user.id);
        const player = await models.Players.findOne({where: {Discord_ID: interaction.user.id, Game_ID: gameId}});
        const playerClass = await models.Classes.findByPk(player.Class_ID);
        const receiver = await models.Players.findOne({where: {Discord_ID: interaction.options.getUser('receiver').id, Game_ID: gameId}});
        const receiverClass = await models.Classes.findByPk(receiver.Class_ID);

        if(player.Dead){
            await interaction.editReply({ content: "Dead players can't use this command."});
        return
        }

        //Check Gamestate
        if(await utils.checkGameState(game.GAMESTATES, false, interaction)){
            return
        }

        //Check if either the player or the receiver is a Mailman
        if (playerClass != "Mailman" && receiverClass != "Mailman") {
            return interaction.editReply({ content: "Niether you or the receiver are a Mailman!" });
        }

        //Check if the receiver is in the game
        if (!receiver) {
            return interaction.editReply({ content: "The receiver is not in the game!" });
        }

        //Check if the player has enough AP
        if (player.Action_Points < interaction.options.getInteger('amount')) {
            return interaction.editReply({ content: "You dont have enough AP to deliver that much!" });
        }

        //Give reciever the AP
        await models.Players.update({Action_Points: receiver.Action_Points + interaction.options.getInteger('amount')}, {where: {Player_ID: receiver.Player_ID}}); 

        //Take the player's AP
        await models.Players.update({Action_Points: player.Action_Points - interaction.options.getInteger('amount')}, {where: {Player_ID: player.Player_ID}});

        return interaction.editReply({ content: interaction.user.username + " delivered " + interaction.options.getInteger('amount') + "AP to " + interaction.options.getUser('receiver').username + "!" });
    }
};