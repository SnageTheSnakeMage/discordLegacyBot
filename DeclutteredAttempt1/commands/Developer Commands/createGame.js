 const { SlashCommandBuilder } = require('discord.js');
var models = require("../../utils.js").models;
var GAMESTATES = require('../../enums.js').GAMESTATES;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('create-game')
        .setDescription('creates a new game')
        .addIntegerOption(option =>
            option.setName('ap-distribution-interval')
                .setDescription('how often players recieve ap in minutes, defaults to 720 (12 hours)')
                .setRequired(false))
        .addIntegerOption(option =>
            option.setName('chest-amount')
                .setDescription('how many AP in the chest at the start of the game, defaults to 0')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('current-chaos-council-event')
                .setDescription('a starting chaos council event, defaults to null')
                .setRequired(false))
        .addIntegerOption(option =>
            option.setName('movement-cost')
            .setDescription('how many AP it costs to move one square, defaults to 1')
            .setRequired(false))
        .addIntegerOption(option =>
            option.setName('shoot-cost')
            .setDescription('how many AP it costs to attack, defaults to 2')
            .setRequired(false))
        .addIntegerOption(option =>
            option.setName('fire-damage')
            .setDescription('how much damage moving onto and off of a fire tile does, defaults to 1')
            .setRequired(false))
        .addIntegerOption(option =>
            option.setName('mine-damage')
            .setDescription('how much damage moving onto a mine/trapped tile does, defaults to 1')
            .setRequired(false))
        .addStringOption(option =>
            option.setName('class-blacklist')
            .setDescription('a comma separated list of classes that cannot be in this game, defaults to null')
            .setRequired(false))
        .addIntegerOption(option =>
            option.setName('chaos-council-boolean')
            .setDescription('whether or not the game has chaos council events, defaults to true')
            .setRequired(false))
        .addIntegerOption(option =>
            option.setName('class-dupe-limit')
            .setDescription('the maximum number of players allowed of a single class in the game, defaults to 2')
            .setRequired(false))
        .addIntegerOption(option =>
            option.setName('max-stat-increase')
            .setDescription('the amount the max stats increase when a player gets a kill, defaults to 1')
            .setRequired(false))
        .addIntegerOption(option =>
            option.setName('finale-player-threshold')
            .setDescription('the minimum number of players required to start the finale, defaults to 4')
            .setRequired(false))
        .addIntegerOption(option =>
            option.setName('ap-amount')
            .setDescription('how much AP is given each distribution, defaults to 2')
            .setRequired(false))
        .addIntegerOption(option =>
            option.setName('immutable-doomsday')
            .setDescription('how many AP distributions until immutables are killed, defaults to 32')
            .setRequired(false)),
    async execute(interaction) {
        if(interaction.user.id != process.env.DEV_ID) return;
        await interaction.deferReply();
        //TODO update this
        //Variables
        var AP_Distribution_Interval = interaction.options.getInteger('ap-distribution-interval') ?? 720;
        var Chest_Amount = interaction.options.getInteger('chest-amount') ?? 0;
        var Current_Chaos_Council_Event = interaction.options.getString('current-chaos-council-event') ?? "BOOOORRRINNNG";
        var Movement_Cost = interaction.options.getInteger('movement-cost') ?? 1;
        var Shoot_Cost = interaction.options.getInteger('shoot-cost') ?? 2;
        var Fire_Damage = interaction.options.getInteger('fire-damage') ?? 1;
        var Mine_Damage = interaction.options.getInteger('mine-damage') ?? 1;
        var Class_Blacklist = interaction.options.getString('class-blacklist') ?? "";
        var Chaos_Council_Boolean = interaction.options.getInteger('chaos-council-boolean') ?? true;
        var Class_Dupe_Limit = interaction.options.getInteger('class-dupe-limit') ?? 2;
        var Finale_Player_Threshold = interaction.options.getInteger('finale-player-threshold') ?? 4;
        var Max_Stat_Increase = interaction.options.getInteger('max-stat-increase') ?? 1;
        var APAmount = interaction.options.getInteger('ap-amount') ?? 2;
        var immutableDoomsday = interaction.options.getInteger('immutable-doomsday') ?? 32;
        //Create Game in Database
        await models.Games.create({ 
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
            APAmount: APAmount,
            immutableDoomsday: immutableDoomsday
        });

        await interaction.editReply({ content: "Game "+ await models.Games.count() + " created!" });
    }


}