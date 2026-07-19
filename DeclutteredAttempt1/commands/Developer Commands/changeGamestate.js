const { SlashCommandBuilder } = require('discord.js');
const { GAMESTATES } = require('../../utils.js');
var models = require("../../utils.js").models;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('change-gamestate')
        .setDescription('starts a game, and if it doesnt find one then creates one')
        .addIntegerOption(option =>
            option.setName('game')
            .setDescription('which game to change')
            .setRequired(true))
        .addStringOption(option =>
            option.setName('gamestate')
            .setDescription('which gamestate to change it to')
            .setRequired(true)
            .setChoices(
                { name: 'Registration', value: 'REGISTRATION' },
                { name: 'Active', value: 'ACTIVE' },
                { name: 'Over', value: 'OVER' },
                { name: 'TimeStopped', value: 'TIMESTOPPED' },
                { name: 'DevPaused', value: 'DEV_PAUSED' },
                { name: 'Finale', value: 'FINALE' },
                { name: 'Finished', value: 'Inactive' },
            )),
            

    async execute(interaction) {
        if(interaction.user.id != process.env.DEV_ID) {
            await interaction.reply('You must be a dev to use this command!'); 
            return;
        }
        var gamestateNonEnum = interaction.options.getString('gamestate')
        GAMESTATES.gamestateNonEnum
        await models.Games.update({GAME_STATE: GAMESTATES.gamestateNonEnum}, {where: {Game_ID: interaction.options.getInteger('game')}}).then((result) => {
            interaction.reply(`Game ${interaction.options.getInteger('game')} has been changed to ${interaction.options.getString('gamestate')}!`);
        });

    }
}