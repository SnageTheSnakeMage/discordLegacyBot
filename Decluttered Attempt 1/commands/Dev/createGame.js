 const { SlashCommandBuilder } = require('discord.js');
var models = require("../utils.js").models;
var GAMESTATES = require('G:/LegacyBotDiscord/Decluttered Attempt 1/enums.js').GAMESTATES;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('createGame')
        .setDescription('creates a new game')
        .addIntegerOption(option =>
            option.setName('AP Distribution Interval')
                .setDescription('how often players recieve ap in minutes, defaults to 720 (12 hours)')
                .setRequired(false))
        .addIntegerOption(option =>
            option.setName('Chest Amount')
                .setDescription('how many AP in the chest at the start of the game, defaults to 0')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('Current Chaos Council Event')
                .setDescription('a starting chaos council event, defaults to null')
                .setRequired(false))
        .addIntegerOption(option =>
            option.setName('Movement Cost')
            .setDescription('how many AP it costs to move one square, defaults to 1')
            .setRequired(false))
        .addIntegerOption(option =>
            option.setName('Shoot Cost')
            .setDescription('how many AP it costs to attack, defaults to 2')
            .setRequired(false))
        .addIntegerOption(option =>
            option.setName('Fire Damage')
            .setDescription('how much damage moving onto and off of a fire tile does, defaults to 1')
            .setRequired(false))
        .addIntegerOption(option =>
            option.setName('Mine Damage')
            .setDescription('how much damage moving onto a mine/trapped tile does, defaults to 1')
            .setRequired(false))
        .addStringOption(option =>
            option.setName('Class Blacklist')
            .setDescription('a comma separated list of classes that cannot be in this game, defaults to null')
            .setRequired(false))
        .addIntegerOption(option =>
            option.setName('Chaos Council Boolean')
            .setDescription('whether or not the game has chaos council events, defaults to true')
            .setRequired(false))
        .addIntegerOption(option =>
            option.setName('Class Dupe Limit')
            .setDescription('the maximum number of players allowed of a single class in the game, defaults to 2')
            .setRequired(false))
        .addIntegerOption(option =>
            option.setName('Max Stat Increase')
            .setDescription('the amount the max stats increase when a player gets a kill, defaults to 1')
            .setRequired(false))
        .addIntegerOption(option =>
            option.setName('Finale Player Threshold')
            .setDescription('the minimum number of players required to start the finale, defaults to 4')
            .setRequired(false)),
    async execute(interaction) {
        if(interaction.user.id != process.env.DEV_ID) return;
        await interaction.deferReply();
        //TODO update this
        //Variables
        var AP_Distribution_Interval = interaction.options.getInteger('AP Distribution Interval') ?? 720;
        var Chest_Amount = interaction.options.getInteger('Chest Amount') ?? 0;
        var Current_Chaos_Council_Event = interaction.options.getString('Current Chaos Council Event');
        var Movement_Cost = interaction.options.getInteger('Movement Cost') ?? 1;
        var Shoot_Cost = interaction.options.getInteger('Shoot Cost') ?? 2;
        var Fire_Damage = interaction.options.getInteger('Fire Damage') ?? 1;
        var Mine_Damage = interaction.options.getInteger('Mine Damage') ?? 1;
        var Class_Blacklist = interaction.options.getString('Class Blacklist');
        var Chaos_Council_Boolean = interaction.options.getInteger('Chaos Council Boolean') ?? true;
        var Class_Dupe_Limit = interaction.options.getInteger('Class Dupe Limit') ?? 2;
        var Finale_Player_Threshold = interaction.options.getInteger('Finale Player Threshold') ?? 4;
        var Max_Stat_Increase = interaction.options.getInteger('Max Stat Increase') ?? 1;

        //Create Game in Database
        await models.Game.create({ 
            GAME_STATE: GAMESTATES.REGISTRATION,
            AP_INTERVAL_MIN: AP_Distribution_Interval, 
            CHEST_AMOUNT: Chest_Amount, 
            LAST_CHEST_GIVER: null,
            CURR_CC_EVENT: Current_Chaos_Council_Event, 
            moveCost: Movement_Cost, 
            shootCost: Shoot_Cost, 
            fireDmg: Fire_Damage, 
            mineDmg: Mine_Damage, 
            classBlacklist: Class_Blacklist, 
            classDupelicateMax: Class_Dupe_Limit, 
            maxIncreaseOnKill: Max_Stat_Increase,
            chaosCouncilBool: Chaos_Council_Boolean, 
            winner: null,
            finaleThreshold: Finale_Player_Threshold, 
        });

        await interaction.editReply({ content: "Game created!" });
    }


}