const { SlashCommandBuilder } = require('discord.js');
const { readOptions, readActor, toDiscord } = require('../_adapter.js');
const { runLogged } = require('../_logging.js');
const logic = require('./databaseCall.logic.js');

// The `model` option exactly as the old (commented-out) builder declared it -
// same name, same description, same five choices, same required flag. It hangs
// off each subcommand rather than off the command itself because Discord
// rejects a chat-input command that mixes subcommands with top-level options,
// and one rejected command fails the whole deploy. See databaseCall.logic.js.
const withModelOption = (subcommand) =>
    subcommand.addStringOption(option =>
        option.setName('model')
            .setDescription('which model')
            .addChoices(
                { name: 'Players', value: 'Players' },
                { name: 'Games', value: 'Games' },
                { name: 'Classes', value: 'Classes' },
                { name: 'Tiles', value: 'Tiles' },
                { name: 'Layers', value: 'Layers' },
            )
            .setRequired(true));

module.exports = {
    data: new SlashCommandBuilder()
        .setName('call-db')
        .setDescription('general database call command, usually only for dev or sandbox')
        .addSubcommand((subcommand) =>
            withModelOption(subcommand.setName('find-all')
                .setDescription('get all entries of the model')))
        .addSubcommand((subcommand) =>
            withModelOption(subcommand.setName('find-by-primary-key')
                .setDescription('get an entry by pk')))
        .addSubcommand((subcommand) =>
            withModelOption(subcommand.setName('update-player')
                .setDescription('update a player'))),

    // The old execute neither deferred nor replied, so every invocation would
    // have timed out with "the application did not respond" - it defers
    // publicly here, the style the other Developer Commands adapters use. The
    // dev gate lives here and travels into run() as input.isDev.
    async execute(interaction) {
        await interaction.deferReply();
        const input = logic.parse(
            {
                ...readOptions(interaction, { model: 'string' }),
                subcommand: interaction.options.getSubcommand(),
            },
            { ...readActor(interaction), isDev: interaction.user.id === process.env.DEV_ID },
        );
        const result = await runLogged('databaseCall', logic, input);
        await interaction.editReply(toDiscord(logic.present(result)));
    },
};
