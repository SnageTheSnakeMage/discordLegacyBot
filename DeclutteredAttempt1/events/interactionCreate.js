const { Events, MessageFlags } = require('discord.js');
const pino = require('pino')
const path = require('path')
const fs = require('fs')
const logDir = path.join(__dirname, '..', 'Logs')
fs.mkdirSync(logDir, { recursive: true })
const commandExecutionLogger = pino({
		transport: {
		targets: [
			{ target: 'pino-pretty', options: { colorize: true }, level: 'trace' },
			{ target: 'pino/file', options: { destination: path.join(logDir, 'commands.log') }, level: 'trace' }
		]}
	}
)
//What the player is told when a command throws. The detail matters: every
//unhandled throw looks identical without it, so a missing texture and a null
//row are the same message to whoever reports it. Discord rejects a body over
//2000 characters, so a long one is cut rather than dropped.
const ERROR_PREFIX = 'There was an error while executing this command!';
const DISCORD_MESSAGE_LIMIT = 2000;

function errorReplyContent(error) {
	//a thrown string is its own message; utils throws several
	const detail = error instanceof Error ? error.message : (error == null ? '' : String(error));
	if (!detail) return ERROR_PREFIX;
	const body = `${ERROR_PREFIX}\n${detail}`;
	return body.length <= DISCORD_MESSAGE_LIMIT
		? body
		: body.slice(0, DISCORD_MESSAGE_LIMIT - 3) + '...';
}

module.exports = {
	name: Events.InteractionCreate,
	errorReplyContent,
	async execute(interaction) {
		if (!interaction.isChatInputCommand()) return;

		const command = interaction.client.commands.get(interaction.commandName);

		if (!command) {
			commandExecutionLogger.error({function: "execute"}, `No command matching ${interaction.commandName} was found. result: ${interaction.client.commands.get(interaction.commandName)}` );
			return;
		}

		try {
			globalThis.CommandExecutionLogger = commandExecutionLogger.child({interactionID: `${crypto.randomUUID()}`})
			await command.execute(interaction);
        }
        catch (error) {
			commandExecutionLogger.error({function: "execute"},error);
			const content = errorReplyContent(error);
			if (interaction.replied || interaction.deferred) {
				await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
			} else {
				await interaction.reply({ content, flags: MessageFlags.Ephemeral });
			}
		}
	},
};