// Main bot file - index.js
const { Client, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const deployCommands = require('./deploy-commands');
const pino = require('pino')
const prettyPino = require('pino-pretty')
var logger100 = pino(
  {
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true
    }
  }
 })

// Load environment variables
globalThis.topLogger = logger100
dotenv.config();
logger100.debug({file: 'index.js', function: 'null(Top Level)'}, "Loaded enviorment variables.")
// Create a new client instance
const client = new Client({
  intents: [
    562950221957184
  ],
});
logger100.debug({file: 'index.js', function: 'null(Top Level)'}, 'Created discord.js Client with Intents')//TODO add intents to this log

// Collection to store commands
client.commands = new Collection();
logger100.debug({file: 'index.js', function: 'null(Top Level)'}, "Created command collection object")

// Cache for tile textures (shared across commands)
global.tileCache = {};
logger100.debug({file: 'index.js', function: 'null(Top Level)'}, "Created tile image cache object")

// Read command files
const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

// Register each command
for (const folder of commandFolders) {
	const commandsPath = path.join(foldersPath, folder);
	const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js') && !file.endsWith('.logic.js') && !file.startsWith('_'));
  
	for (const file of commandFiles) {
		const filePath = path.join(commandsPath, file);
		const command = require(filePath);
		// Set a new item in the Collection with the key as the command name and the value as the exported module
		if ('data' in command && 'execute' in command) {
			client.commands.set(command.data.name, command);
		} else {
    logger100.warn({file: 'index.js', function: 'null(Top Level)'}, `A javascript file at ${filePath} is missing the required "data" or "execute" properties needed to be a command so it was skipped and not added to the command collection object`)
  }
}
}

const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
	const filePath = path.join(eventsPath, file);
	const event = require(filePath);
	if (event.once) {
		client.once(event.name, (...args) => event.execute(...args));
	} else {
		client.on(event.name, (...args) => event.execute(...args));
	}
}

// Login to Discord with your client's token
deployCommands()

client.login(process.env.DISCORD_TOKEN);

