const { Events } = require('discord.js');
const utils = require('../utils');
module.exports = {
	name: Events.ClientReady,
	once: true,
	execute(client) {
		//let me know when the bot is online
		topLogger.debug({function: "execute", file: "ready.js"},`Ready! Logged in as ${client.user.tag}`);
		//set up reocurrong timecheck
		utils.timeCheck(client);
	},
};