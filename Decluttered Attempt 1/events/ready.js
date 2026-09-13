const { Events } = require('discord.js');
const utils = require('../utils');

module.exports = {
	name: Events.ClientReady,
	once: true,
	async execute(client) {
		//let me know when the bot is online
		console.log(`Ready! Logged in as ${client.user.tag}`);
		//set up reocurrong timecheck
		await utils.timeCheck(client);
	},
};