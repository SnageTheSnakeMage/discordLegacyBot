const { readOptions, readActor, toDiscord } = require('../_adapter.js');
const { buildData, optionSpec } = require('../_catalog.js');
const { runLogged } = require('../_logging.js');
const logic = require('./createBoard.logic.js');


module.exports = {
    data: buildData('create-board'),

    // The dev gate stays here and travels into run() as actor.isDev, and is
    // still a silent return for non-devs (createGame.js, timestop_dev.js).
    // Inserting several hundred tiles takes longer than Discord's 3 second
    // reply window, so this one defers - publicly, like the other dev
    // commands that reply at all.
    async execute(interaction) {
        if (interaction.user.id != process.env.DEV_ID) return;
        await interaction.deferReply();
        const input = logic.parse(
            readOptions(interaction, optionSpec('create-board')),
            { ...readActor(interaction), isDev: true },
        );
        const result = await runLogged('createBoard', logic, input);
        await interaction.editReply(toDiscord(logic.present(result)));
    },
};
