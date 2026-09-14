const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { readOptions, readActor, toDiscord } = require('../_adapter.js');
const { runLogged } = require('../_logging.js');
const logic = require('./trace.logic.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('trace')
        .setDescription('preview the tiles a shot would pass through, without spending any AP')
        .addIntegerOption(option =>
            option.setName('x')
            .setDescription('X coordinate of the tile you want to shoot')
            .setRequired(true))
        .addIntegerOption(option =>
            option.setName('y')
            .setDescription('Y coordinate of the tile you want to shoot')
            .setRequired(true))
        .addIntegerOption(option =>
            option.setName('game')
                .setDescription('which game, defaults to oldest active game')
                .setRequired(false))
        .addIntegerOption(option =>
            option.setName('body')
            .setDescription('(FOR TWIN CLASS) Which body you are tracing from, defaults to 1')
            .setRequired(false)
            .addChoices(
                { name: "Body 1", value: 1 },
                { name: "Body 2", value: 2 }
            )),
    // ephemeral like /board: a trace is the player scouting a line, and
    // broadcasting it would tell the whole channel what they are lining up
    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const input = logic.parse(
            readOptions(interaction, { x: 'integer', y: 'integer', game: 'integer', body: 'integer' }),
            readActor(interaction),
        );
        const result = await runLogged('trace', logic, input);
        await interaction.editReply(toDiscord(logic.present(result)));
    },
};
