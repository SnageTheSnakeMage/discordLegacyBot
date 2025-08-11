const { SlashCommandBuilder } = require('discord.js');
const utils = require('../utils');
var models = utils.models;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('override')
        .setDescription('command for the Dead or Medium, overrides a Chaos Council Poll')
        .addIntegerOption(option =>
            option.setName('option')
                .setDescription('which option in the poll to choose to win, goes 1 from the top')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(3))
        .addIntegerOption(option =>
            option.setName('game')
                .setDescription('which game, defaults to oldest active game')
                .setRequired(false)),
    async execute(interaction) {
        await interaction.deferReply();

        //Variables
        let game = await utils.getGame(interaction.options.getInteger('game')) ?? await utils.getOldestActiveGame(interaction.user.id);
        const player = await models.Players.findOne({where: {Game_ID: game.Game_ID, Discord_ID: interaction.user.id}});
        const playerClass = await models.Classes.findByPk(player.Class_ID);
        const pollOption = interaction.options.getInteger('pollOption');
         const channel = await client.channels.fetch(game.deadChatChannelId);
        const poll = await channel.messages.fetch(game.currentChaosPollMsgId).poll;

        //Check if the player is a Dead or Medium
        if(!player.Dead || playerClass.Class_Name != "Medium") {
            await interaction.reply({ content: "Only Dead or Medium can override a chaos council poll!"});
            return;
        }

        //check if the player has an overide
        if(player.cCOverrides <= 0) {
            await interaction.reply({ content: "You don't have any overrides left!"});
            return;
        }

        //use the override
        await models.Players.update({cCOverrides: player.cCOverrides - 1}, {where: {Player_ID: player.Player_ID}});
        await models.Games.update({overrider: player.Discord_ID}, {where: {Game_ID: game.Game_ID}});
        
        //poll.answers.keyAt(pollOption)

    }
}