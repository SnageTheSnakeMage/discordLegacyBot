const { SlashCommandBuilder } = require('discord.js');
const { readOptions, readActor, toDiscord } = require('../_adapter.js');
const logic = require('./createGame.logic.js');

const OPTION_SPEC = {
    'ap-distribution-interval': 'integer',
    'chest-amount': 'integer',
    'current-chaos-council-event': 'string',
    'movement-cost': 'integer',
    'shoot-cost': 'integer',
    'fire-damage': 'integer',
    'mine-damage': 'integer',
    'class-blacklist': 'string',
    'chaos-council-boolean': 'integer',
    'class-dupe-limit': 'integer',
    'max-stat-increase': 'integer',
    'finale-player-threshold': 'integer',
    'ap-amount': 'integer',
    'immutable-doomsday': 'integer',
};

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
        // dev gate stays here and stays silent for non-devs, exactly as before
        if (interaction.user.id != process.env.DEV_ID) return;
        await interaction.deferReply();
        const input = logic.parse(
            { ...readOptions(interaction, OPTION_SPEC), isDev: true },
            readActor(interaction),
        );
        const result = await logic.run(input);
        await interaction.editReply(toDiscord(logic.present(result)));
    },
};
