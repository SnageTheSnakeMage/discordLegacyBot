const { SlashCommandBuilder } = require('discord.js');
const utils = require('../utils');
var models = utils.models;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('override')
        .setDescription('command for the Dead or Medium, overrides a Chaos Council Poll')
        .addIntegerOption(option =>
            option.setName('pollOption')
                .setDescription('which option to choose to win, goes 1 from the top')
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

        game.overidden = true;
        game.save();
        interaction.editReply({content: "The Chaos Council has been overriden, the option " + pollOption + "option has been chosen,\n please wait for snage to update it, apologies for the inconvience"});
        //poll.answers.keyAt(pollOption)

    }
}