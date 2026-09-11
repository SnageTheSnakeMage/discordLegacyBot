/**
 * Standalone slash-command registration, for the manual workflow_dispatch
 * deploy job. deploy-commands.js is a module that assumes index.js already
 * set the global logger, so it cannot be run directly with `node`; this
 * wrapper supplies the global and invokes it once.
 *
 * Requires DISCORD_TOKEN, CLIENT_ID (and optionally GUILD_ID) in the env.
 * Discord rate-limits command registration - run this when a command's
 * definition changes, not on every deploy.
 */
const pino = require('pino');
globalThis.topLogger = pino({ level: 'info' });
require('../deploy-commands.js')()
  .then(() => { topLogger.info('slash commands registered'); process.exit(0); })
  .catch((err) => { topLogger.error(err); process.exit(1); });
