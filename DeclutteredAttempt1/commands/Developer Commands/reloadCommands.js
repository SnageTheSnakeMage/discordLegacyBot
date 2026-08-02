const { SlashCommandBuilder } = require('discord.js');
const { InteractionContextType, PermissionFlagsBits } = require('discord.js');
const path = require(`path`);
const fs = require(`fs`)
const logger200 = commandExecutionLogger.child({file: 'reloadCommands.js'})

module.exports = {
	data: new SlashCommandBuilder()
		.setName('reload-commands')
		.setDescription('Reloads all commands.')
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
	    .setContexts(InteractionContextType.Guild),
	async execute(interaction) {
	    if(interaction.user.id != process.env.DEV_ID) return;
		
		// Read command files
		const foldersPath = path.join(__dirname, 'commands');
		const commandFolders = fs.readdirSync(foldersPath);

		// Register each command
		for (const folder of commandFolders) {
			const commandsPath = path.join(foldersPath, folder);
			const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));
  
			for (const file of commandFiles) {
				const filePath = path.join(commandsPath, file);
				const command = require(filePath);

        		delete require.cache[require.resolve(`./${command.data.name}.js`)];

        		try {
	        		const newCommand = require(`./${command.data.name}.js`);
	        		interaction.client.commands.set(newCommand.data.name, newCommand);
	        		await interaction.reply(`Command \`${newCommand.data.name}\` was reloaded!`);
        		} catch (error) {
	       			logger200.error({function: "execute"}, error);
	        		await interaction.reply(`There was an error while reloading a command \`${command.data.name}\`:\n\`${error.message}\``);
       			}
			}
		}
	},
};