const { SlashCommandBuilder, InteractionContextType, PermissionFlagsBits } = require('discord.js');
const { readOptions, readActor, toDiscord } = require('../_adapter.js');
const logic = require('./reloadCommands.logic.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('reload-commands')
		.setDescription('Reloads all commands.')
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
	    .setContexts(InteractionContextType.Guild),

	// The dev gate stays here and travels into run() as input.isDev (TESTING.md
	// Part 1, order-of-work item 6). It is still an early, silent return: the
	// old code returned before replying, so a non-dev got no reply at all.
	// Defer style is the command's own: it never deferred, it replied - so the
	// adapter replies directly too. It replies ONCE, where the old loop replied
	// per command file and threw InteractionAlreadyReplied on the second.
	//
	// Writing the fresh modules into the client collection is the one piece of
	// genuine Discord state here, so it lives in the adapter; reloadCommands.logic
	// decided which modules those are and already re-required them.
	async execute(interaction) {
		const isDev = interaction.user.id === process.env.DEV_ID;
		if (!isDev) return;

		const input = logic.parse(
			readOptions(interaction, {}),
			{ ...readActor(interaction), isDev },
		);
		const result = await logic.run(input);

		if (result.ok) {
			for (const entry of result.data.reloaded) {
				interaction.client.commands.set(entry.name, entry.command);
			}
		}

		await interaction.reply(toDiscord(logic.present(result)));
	},
};
