const { SlashCommandBuilder } = require('discord.js');
const utils = require('../../utils.js');
var models = require("../../utils.js").models;

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
                .setDescription('# AP you wish to deliver')
                .setRequired(true)
                .setMinValue(1))
        .addIntegerOption(option =>
            option.setName('game')
                .setDescription('which game, defaults to oldest active game')
                .setRequired(false)),
    async execute(interaction) {
        await interaction.deferReply();
        //Variables
        const gameId = interaction.options.getInteger('game') ?? await utils.getOldestGameId();
        const player = await models.Players.findOne({where: {Discord_ID: interaction.user.id, Game_ID: gameId}});
        const receiver = await models.Players.findOne({where: {Discord_ID: interaction.options.getUser('receiver').id, Game_ID: gameId}});

        //Check Gamestate
        if(await utils.checkGameState(game.GAME_STATE, false, interaction)){
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
        await models.Players.update({Action_Points: receiver.Action_Points + interaction.options.getInteger('amount')}, {where: {Player_ID: receiver.Player_ID}}); 
        await models.Players.update({Action_Points: player.Action_Points - interaction.options.getInteger('amount')}, {where: {Player_ID: player.Player_ID}});

        return interaction.editReply({ content: "You have delivered " + interaction.options.getInteger('amount') + "AP to " + interaction.options.getUser('receiver').username + "!" });
    }
};