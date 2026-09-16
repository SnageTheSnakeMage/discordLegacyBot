/**
 * List or delete the application's GLOBAL slash commands.
 *
 *   node scripts/global-commands.js                    # list
 *   node scripts/global-commands.js --delete old-name  # delete one
 *   node scripts/global-commands.js --delete-all       # delete every one
 *
 * The adapter: it owns @discordjs/rest, the environment and stdout, and hands
 * scripts/globalCommands.logic.js a three-method `api` so the decisions are
 * testable without a token or a network.
 *
 * GUILD_ID is deliberately NOT required. Global commands are not scoped to a
 * guild, and demanding it would make this unusable for exactly the mess it is
 * meant to clear up.
 */
const { REST, Routes } = require('discord.js');
const dotenv = require('dotenv');
const { parseArgs, run, present } = require('./globalCommands.logic.js');

dotenv.config();

// Same preflight as deploy-commands.js, and for the same reason: without it a
// missing token surfaces from inside @discordjs/rest naming nothing, and a
// missing CLIENT_ID builds a live-looking route with "undefined" in it.
const required = ['DISCORD_TOKEN', 'CLIENT_ID'];
const missing = required.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(`cannot manage global commands: ${missing.join(', ')} not set in the environment`);
  process.exit(1);
}

const rest = new REST().setToken(process.env.DISCORD_TOKEN);
const clientId = process.env.CLIENT_ID;

const api = {
  list: () => rest.get(Routes.applicationCommands(clientId)),
  remove: (id) => rest.delete(Routes.applicationCommand(clientId, id)),
  // PUT with an empty body is the documented way to clear the set, and is one
  // request rather than one per command
  removeAll: () => rest.put(Routes.applicationCommands(clientId), { body: [] }),
};

(async () => {
  const input = parseArgs(process.argv.slice(2));
  const result = await run(input, { api });
  console.log(present(result));
  // Discord caches globally-scoped changes: they can take up to an hour to
  // appear in a client, so "still in the picker" right after this is expected
  // and is not a failed delete.
  if (result.kind === 'deleted' || result.kind === 'deleted-all') {
    console.log('note: global command changes can take up to an hour to propagate to clients');
  }
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
