/**
 * /reload-commands - dev-only: re-require every command module so code edits
 * take effect without restarting the bot.
 *
 * parse/run/present per TESTING.md Part 1. run() takes plain data and a deps
 * bundle and returns a CommandResult; it never sees an interaction. The
 * process.env.DEV_ID gate stays in the adapter and arrives here as
 * input.isDev (Part 1, order-of-work item 6).
 *
 * THE SPLIT (this command is almost pure plumbing, so the seam matters):
 * run() decides WHICH modules get reloaded - it walks the command folders,
 * busts each module's require cache and re-requires it - and returns the
 * fresh modules alongside their slash names. The adapter does the one thing
 * that is genuinely Discord: writing them into interaction.client.commands.
 * present() only ever reads names and error messages, never the modules.
 * Because the filesystem walk and the module loader arrive through deps
 * (deps.fs, deps.commandsRoot, deps.loadCommand, each defaulted to the real
 * one), the tests exercise the real decision logic without touching disk and
 * without ever loading discord.js.
 *
 * Ported from the old execute, which could not complete a single invocation.
 * Every one of these was a crash:
 * - the folder scan started at path.join(__dirname, 'commands'), i.e.
 *   commands/Developer Commands/commands, which does not exist, so the very
 *   first fs.readdirSync threw ENOENT before anything else ran. The scan now
 *   starts at the commands root, the same directory index.js walks.
 * - every entry in the commands root was readdirSync'd as if it were a
 *   folder, so _adapter.js / _deps.js / _messages.js would have thrown
 *   ENOTDIR. Non-directories are skipped, as in index.js.
 * - modules were re-required as `./${command.data.name}.js` relative to the
 *   Developer Commands folder - the SLASH name, not the file name, in the
 *   wrong directory - so require.resolve threw MODULE_NOT_FOUND, and it sat
 *   OUTSIDE the try/catch, so nothing caught it. Modules are now resolved by
 *   their real path.
 * - `.logic.js` siblings and `_`-prefixed shared files export no `data`, so
 *   reading command.data.name off them threw TypeError. They are filtered
 *   out, and any remaining module without data/execute is skipped rather
 *   than crashing the run - matching index.js.
 * - interaction.reply() was awaited once PER COMMAND FILE inside the loop,
 *   so even had the walk worked, everything after the first file threw
 *   InteractionAlreadyReplied. present() now renders one reply; the
 *   per-command wording is byte-identical, one line each.
 *
 * Preserved as-is: the walk covers every directory under commands/ with no
 * allow-list (Diagrams, decommissioned included), exactly as index.js does,
 * and a module that throws on require is reported rather than aborting the
 * rest of the reload.
 */
const path = require('path');
const fs = require('fs');
const { REJECTIONS } = require('../../enums.js');
const { messageFor } = require('../_messages.js');
const defaultDeps = require('../_deps.js');

/** the commands root - this file lives in commands/Developer Commands */
const COMMANDS_ROOT = path.join(__dirname, '..');

/**
 * Default module loader: bust the cache entry, then re-require. Tests inject
 * their own through deps.loadCommand and never reach this.
 */
function loadCommand(filePath) {
  const resolved = require.resolve(filePath);
  delete require.cache[resolved];
  return require(resolved);
}

/** the same filter index.js uses when it builds the command collection */
function isCommandFile(file) {
  return file.endsWith('.js') && !file.endsWith('.logic.js') && !file.startsWith('_');
}

function parse(raw, actor) {
  // the command declares no options; the dev flag is the whole input
  return {
    isDev: actor.isDev === true,
    discordId: actor.discordId,
  };
}

async function run(input, deps = defaultDeps) {
  if (!input.isDev) return { ok: false, reason: REJECTIONS.NOT_DEV };

  const fsDep = deps.fs || fs;
  const root = deps.commandsRoot || COMMANDS_ROOT;
  const load = deps.loadCommand || loadCommand;

  const reloaded = [];
  const failures = [];
  const skipped = [];

  const folders = fsDep.readdirSync(root)
    .filter((entry) => fsDep.statSync(path.join(root, entry)).isDirectory());

  for (const folder of folders) {
    const folderPath = path.join(root, folder);
    const files = fsDep.readdirSync(folderPath).filter(isCommandFile);

    for (const file of files) {
      const filePath = path.join(folderPath, file);
      try {
        const command = load(filePath);
        if (!command || !command.data || !command.data.name || typeof command.execute !== 'function') {
          skipped.push({ file, filePath });
          continue;
        }
        reloaded.push({ name: command.data.name, file, filePath, command });
      } catch (error) {
        // the file name is the only identifier available when the module
        // itself would not load
        failures.push({ name: file.replace(/\.js$/, ''), message: error.message });
      }
    }
  }

  return { ok: true, kind: 'reloaded', data: { reloaded, failures, skipped } };
}

function present(result) {
  if (!result.ok) return { content: messageFor(result.reason, result.data) };

  const lines = [];
  for (const entry of result.data.reloaded) {
    lines.push(`Command \`${entry.name}\` was reloaded!`);
  }
  for (const failure of result.data.failures) {
    lines.push(`There was an error while reloading a command \`${failure.name}\`:\n\`${failure.message}\``);
  }
  if (lines.length === 0) return { content: 'No commands were found to reload!' };
  return { content: lines.join('\n') };
}

module.exports = { parse, run, present };
