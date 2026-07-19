const { SlashCommandBuilder } = require('discord.js');
const utils = require('../../utils.js');
var models = require("../../utils.js").models;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('timestop')
        .setDescription('command for Clockwatchers, be the only one who can do anything for 4AP distributions, costs 12AP')
        .addIntegerOption(option =>
            option.setName('game')
                .setDescription('which game, defaults to oldest active game')
                .setRequired(false)),
    async execute(interaction) {
        await interaction.deferReply(interaction);

        //Variables
        var game = await models.Games.findByPk(interaction.options.getInteger('game')) ?? await utils.getOldestActiveGame(interaction.user.id);
        const player = await models.Players.findOne({where: {Game_ID: game.Game_ID, Discord_ID: interaction.user.id}});
        const playerClass = await models.Classes.findByPk(player.Class_ID);

        //Check if the player is a Clockwatcher
        if(playerClass.Class_Name != "Clockwatcher") {
            await interaction.reply({ content: "Only clockwatchers can stop time!"});
            return;
        }

        //Check if the player has enough AP
        if(player.Action_Points < 12) {
            await interaction.reply({ content: "You don't have enough AP!"});
            return;
        }

        //Stop the game
        await models.Games.update({ GAMESTATES: GAMESTATES.TIMESTOPPED, timestopTurns: 4 }, { where: { Game_ID: game.Game_ID } });
        await interaction.editReply({ content: "Time has been stopped! You have " + game.AP_INTERVAL_MIN * 4 + " minutes all to yourself!\n and any other clockwatchers..." });
    },
};