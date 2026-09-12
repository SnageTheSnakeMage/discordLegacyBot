const { SlashCommandBuilder } = require('discord.js');
const { readOptions, readActor, toDiscord } = require('../_adapter.js');
const { runLogged } = require('../_logging.js');
const logic = require('./createBoard.logic.js');

const OPTION_SPEC = {
    preset: 'string',
    game: 'integer',
    replace: 'boolean',
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('create-board')
        .setDescription('builds a game\'s layers and tiles from a board preset')
        .addStringOption(option =>
            option.setName('preset')
                .setDescription('which preset in database/boards/, leave empty to list them')
                .setRequired(false))
        .addIntegerOption(option =>
            option.setName('game')
                .setDescription('the game to build the board for')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('replace')
                .setDescription('replace an existing board for this game, defaults to false')
                .setRequired(false)),

    // The dev gate stays here and travels into run() as actor.isDev, and is
    // still a silent return for non-devs (createGame.js, timestop_dev.js).
    // Inserting several hundred tiles takes longer than Discord's 3 second
    // reply window, so this one defers - publicly, like the other dev
    // commands that reply at all.
    async execute(interaction) {
        if (interaction.user.id != process.env.DEV_ID) return;
        await interaction.deferReply();
        const input = logic.parse(
            readOptions(interaction, OPTION_SPEC),
            { ...readActor(interaction), isDev: true },
        );
        const result = await runLogged('createBoard', logic, input);
        await interaction.editReply(toDiscord(logic.present(result)));
    },
};
