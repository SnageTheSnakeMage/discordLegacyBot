/**
 * The logic behind scripts/global-commands.js, with no discord.js in it.
 *
 * Global commands are a SEPARATE list from the guild commands deploy-commands.js
 * registers. That PUT is a full replace, so a stale GUILD command disappears the
 * next time commands are registered - but it never touches the global list, so a
 * command registered globally by an older version of the bot outlives every
 * deploy and keeps appearing in the picker with nothing behind it. That is what
 * this exists to find and remove; there was no way to even LOOK at the global
 * list before.
 *
 * Deleting is deliberately explicit, because a global delete cannot be undone
 * except by registering the command again, and Discord takes up to an hour to
 * propagate either direction.
 */

/** A Discord snowflake: all digits, and far longer than any command name. */
const SNOWFLAKE = /^\d{17,20}$/;

const USAGE = `usage: node scripts/global-commands.js [--delete <name|id>] [--delete-all]

  (no arguments)        list the application's global commands
  --delete <name|id>    delete one global command
  --delete-all          delete every global command

Guild commands are not listed here: deploy-commands.js replaces that whole set
on every registration, so a stale one is already gone. Global commands are the
list nothing else touches.`;

/**
 * argv WITHOUT node and the script path, so the caller passes
 * process.argv.slice(2) and this stays testable.
 */
function parseArgs(argv) {
  const args = [...argv];
  if (args.length === 0) return { mode: 'list' };
  if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) return { mode: 'help', usage: USAGE };

  if (args[0] === '--delete-all') {
    if (args.length > 1) throw new Error(`--delete-all takes no arguments (got ${args.slice(1).join(' ')})\n\n${USAGE}`);
    return { mode: 'delete-all' };
  }
  if (args[0] === '--delete') {
    // `--delete` with nothing after it must not silently become a list, or a
    // mistyped command name reads as "there is nothing to delete"
    if (args.length !== 2) throw new Error(`--delete needs exactly one name or id\n\n${USAGE}`);
    return { mode: 'delete', target: args[1] };
  }
  throw new Error(`unrecognised argument: ${args[0]}\n\n${USAGE}`);
}

/**
 * `api` is the seam over @discordjs/rest:
 *   list()       -> [{ id, name }, ...]
 *   remove(id)   -> deletes one global command
 *   removeAll()  -> replaces the global set with nothing
 *
 * Returns a plain result the caller prints. Nothing here writes to stdout, so
 * the tests assert on data rather than on captured output.
 */
async function run(input, { api }) {
  if (input.mode === 'help') return { kind: 'help', text: input.usage };

  const commands = await api.list();

  if (input.mode === 'list') return { kind: 'list', commands };

  if (input.mode === 'delete-all') {
    if (commands.length === 0) return { kind: 'noop', message: 'no global commands to delete' };
    await api.removeAll();
    return { kind: 'deleted-all', commands };
  }

  // --delete: a snowflake addresses a command directly, anything else is a
  // name. Both are checked against the live list first, so a typo is a clear
  // "no such command" naming what IS there rather than a 404 from Discord.
  const wanted = input.target;
  const match = SNOWFLAKE.test(wanted)
    ? commands.find((c) => c.id === wanted)
    : commands.find((c) => c.name === wanted.replace(/^\//, ''));

  if (!match) {
    const names = commands.length ? commands.map((c) => `/${c.name}`).join(', ') : '(none)';
    throw new Error(`no global command matches "${wanted}". Global commands are: ${names}`);
  }

  await api.remove(match.id);
  return { kind: 'deleted', command: match };
}

/** What the adapter prints, kept here so it is covered by the tests too. */
function present(result) {
  switch (result.kind) {
    case 'help':
      return result.text;
    case 'list':
      return result.commands.length
        ? result.commands.map((c) => `${c.id}  /${c.name}`).join('\n')
        : 'no global commands registered';
    case 'noop':
      return result.message;
    case 'deleted':
      return `deleted global command /${result.command.name} (${result.command.id})`;
    case 'deleted-all':
      return `deleted ${result.commands.length} global command(s): ${result.commands.map((c) => `/${c.name}`).join(', ')}`;
    default:
      return String(result.kind);
  }
}

module.exports = {
  parseArgs, run, present, USAGE, SNOWFLAKE,
};
