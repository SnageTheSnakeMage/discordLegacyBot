const { readOptions, readActor, toDiscord } = require('../_adapter.js');
const { buildData, optionSpec } = require('../_catalog.js');
const { runLogged } = require('../_logging.js');
const utils = require('../../utils.js');
const logic = require('./changeGamestate.logic.js');

module.exports = {
    data: buildData('change-gamestate'),

    // this command never deferred: both of its old branches replied directly,
    // so the adapter replies directly too (TESTING.md Part 1: the defer style
    // is per-command and is preserved). The dev gate stays here and travels
    // into run() as input.isDev.
    async execute(interaction) {
        const input = logic.parse(
            readOptions(interaction, optionSpec('change-gamestate')),
            { ...readActor(interaction), isDev: interaction.user.id === process.env.DEV_ID },
        );
        const result = await runLogged('changeGamestate', logic, input);
        //the new GAME_STATE decides whether this game should be running an AP
        //check interval. run() never sees the client, so the reconcile happens
        //here in the adapter, where interaction.client is available.
        if (result.ok) await utils.timeCheck(interaction.client);
        await interaction.reply(toDiscord(logic.present(result)));
    },
};
