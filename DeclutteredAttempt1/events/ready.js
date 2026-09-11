const { Events } = require('discord.js');
const fs = require('fs');
const path = require('path');
const utils = require('../utils');

const HEARTBEAT = process.env.LEGACY_HEARTBEAT_FILE
	|| path.join(__dirname, '..', 'Logs', 'heartbeat');
const HEARTBEAT_INTERVAL_MS = 30 * 1000;

/**
 * Touch the heartbeat file, but only while the gateway is actually
 * connected. scripts/healthcheck.js treats a stale file as unhealthy, so a
 * process that is alive with a dead Discord connection stops being
 * reported healthy - which is the whole point of the container
 * healthcheck. client.ws.status === 0 is READY in discord.js v14.
 */
function startHeartbeat(client) {
	const beat = () => {
		try {
			if (client.ws && client.ws.status === 0) {
				fs.mkdirSync(path.dirname(HEARTBEAT), { recursive: true });
				fs.writeFileSync(HEARTBEAT, String(Date.now()));
			}
		} catch (err) {
			topLogger.warn({ function: 'startHeartbeat', file: 'ready.js' }, `could not write heartbeat: ${err.message}`);
		}
	};
	beat();
	const timer = setInterval(beat, HEARTBEAT_INTERVAL_MS);
	// never hold the process open on the heartbeat alone
	if (timer.unref) timer.unref();
	return timer;
}

module.exports = {
	name: Events.ClientReady,
	once: true,
	startHeartbeat,
	async execute(client) {
		//let me know when the bot is online
		topLogger.debug({function: "execute", file: "ready.js"},`Ready! Logged in as ${client.user.tag}`);
		//keep the container healthcheck fed while the gateway is up
		startHeartbeat(client);
		//set up reocurrong timecheck
		await utils.timeCheck(client);
	},
};
