const { readOptions, readActor, toDiscord } = require('../_adapter.js');
const { buildData, optionSpec } = require('../_catalog.js');
const { runLogged } = require('../_logging.js');
const utils = require('../../utils.js');
const logic = require('./createGame.logic.js');


module.exports = {
    data: buildData('create-game'),
    async execute(interaction) {
        // dev gate stays here and stays silent for non-devs, exactly as before
        if (interaction.user.id != process.env.DEV_ID) return;
        await interaction.deferReply();
        const input = logic.parse(
            { ...readOptions(interaction, optionSpec('create-game')), isDev: true },
            readActor(interaction),
        );
        const result = await runLogged('createGame', logic, input);
        //pick the new game up without waiting for a restart, same reason as in
        //changeGamestate.js: run() has no client, the adapter does
        if (result.ok) await utils.timeCheck(interaction.client);
        await interaction.editReply(toDiscord(logic.present(result)));
    },
};
