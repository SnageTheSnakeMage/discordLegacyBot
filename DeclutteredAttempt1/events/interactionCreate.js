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
module.exports = {
	name: Events.InteractionCreate,
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
			if (interaction.replied || interaction.deferred) {
				await interaction.followUp({ content: 'There was an error while executing this command!', flags: MessageFlags.Ephemeral });
			} else {
				await interaction.reply({ content: 'There was an error while executing this command!', flags: MessageFlags.Ephemeral });
			}
		}
	},
};