/**
 * Standalone slash-command registration, for the manual workflow_dispatch
 * deploy job. deploy-commands.js is a module that assumes index.js already
 * set the global logger, so it cannot be run directly with `node`; this
 * wrapper supplies the global and invokes it once.
 *
 * Requires DISCORD_TOKEN, CLIENT_ID and GUILD_ID in the env. GUILD_ID is not
 * optional: deploy-commands.js registers guild commands, so without it the
 * route is built with a literal "undefined" guild rather than falling back to
 * a global registration.
 * Discord rate-limits command registration - run this when a command's
 * definition changes, not on every deploy.
 */
const pino = require('pino');
globalThis.topLogger = pino({ level: 'info' });
require('../deploy-commands.js')()
  .then(() => { topLogger.info('slash commands registered'); process.exit(0); })
  .catch((err) => { topLogger.error(err); process.exit(1); });
