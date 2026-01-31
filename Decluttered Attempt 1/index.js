// Main bot file - index.js
const { Client, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const deployCommands = require('./deploy-commands');

// async function testConnection() {
//   try {
//     await sequelize.authenticate();
//     initModels(sequelize);
//   console.log('Connection has been established successfully.');
//   } catch (error) {
//     console.error('Unable to connect to the database:', error);
//   }
// }

// testConnection();

// Load environment variables
dotenv.config();

// Create a new client instance
const client = new Client({
  intents: [
    562950221957184
  ],
});

// Define layer types (global constant that can be used by command files)
global.LAYERS = {
  ENVIRONMENT: 'environment',
  MINES: 'mines',
  PLAYERS: 'players'
};

// Collection to store commands
client.commands = new Collection();

// Cache for tile textures (shared across commands)
global.tileCache = {};

// Read command files
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

// Register each command
for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  
  // Set a new item in the Collection with the key as the command name and the value as the exported module
  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
  } else {
    console.log(`[WARNING] The command at ${filePath} is missing required "data" or "execute" property.`);
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
deployCommands();

client.login(process.env.DISCORD_TOKEN);