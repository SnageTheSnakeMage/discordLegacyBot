// deploy-commands.js - Script to register slash commands

module.exports = async function deployCommands() { 
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const commands = [];
// Grab all the command folders from the commands directory you created earlier
const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath).filter((entry) => fs.statSync(path.join(foldersPath, entry)).isDirectory());
for (const folder of commandFolders) {
	// Grab all the command files from the commands directory you created earlier
	const commandsPath = path.join(foldersPath, folder);
	const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js') && !file.endsWith('.logic.js') && !file.startsWith('_'));
	// Grab the SlashCommandBuilder#toJSON() output of each command's data for deployment
	for (const file of commandFiles) {
		const filePath = path.join(commandsPath, file);
		const command = require(filePath);
		if ('data' in command && 'execute' in command) {
			commands.push(command.data.toJSON());
      topLogger.debug({file: 'deploy-commands.js', function: 'null(Top Level)'},`loaded command #${commands.length}: ${command.data.name}`);
		} else {
			topLogger.warn({file: 'deploy-commands.js', function: 'null(Top Level)'},`The command at ${filePath} is missing a required "data" or "execute" property.`);
		}
	}
}

// Construct and prepare an instance of the REST module
const rest = new REST().setToken(process.env.DISCORD_TOKEN);
// and deploy your commands!
// Returned, not fire-and-forget: the caller's promise must not resolve until the
// PUT has actually completed, or scripts/register-commands.js exits the process
// mid-request and reports a success that never reached Discord.
return (async () => {
	try {
		topLogger.debug({file: 'deploy-commands.js', function: 'null(Top Level)'},`Started refreshing ${commands.length} application (/) commands.`);
		// The put method is used to fully refresh all commands in the guild with the current set
		const data = await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body: commands });
		topLogger.debug({file: 'deploy-commands.js', function: 'null(Top Level)'},`Successfully reloaded ${data.length} application (/) commands.`);
	} catch (error) {
		// Log it, then rethrow: a swallowed failure here registers nothing and
		// still exits 0, so a green deploy job proves nothing about Discord's state.
		topLogger.error({file: 'deploy-commands.js', function: 'null(Top Level)'}, `${error}`);
		throw error;
	}
})()};

