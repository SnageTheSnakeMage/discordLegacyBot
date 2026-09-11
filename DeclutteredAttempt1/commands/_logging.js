/**
 * Logging for command run() calls.
 *
 * Every command's run() was silent: when a player said "the bot did nothing"
 * there was no record that the command had even been dispatched, let alone
 * what it decided. That is the whole of gripe 3.
 *
 * The logging lives HERE rather than inside each of the 40 logic files, for
 * the same reason discord.js does: run() is meant to be plain data in, plain
 * data out. Forty hand-written log lines would drift apart, and a logic file
 * that logs is a logic file with a side effect to stub in every test.
 *
 * What a run produces, per invocation:
 *   - one debug line on entry: command, actor, and the parsed input
 *   - one line on exit: ok/rejected, the kind or reason, and how long it took
 *   - one error line if run() threw, before rethrowing to the central handler
 *
 * Inputs are redacted before they are written: a command's options are
 * player-supplied text and end up in a file on disk.
 */

/** option names whose values are never worth writing down */
const NOISY = new Set(['iconUrl', 'icon', 'attachment']);
const MAX_STRING = 120;

/**
 * Shrinks a parsed input to something safe and readable in a log line.
 * Long strings are truncated; known-noisy fields are dropped entirely.
 */
function summarise(input) {
  if (input == null || typeof input !== 'object') return input;
  const out = {};
  for (const [key, value] of Object.entries(input)) {
    if (NOISY.has(key)) { out[key] = '[omitted]'; continue; }
    if (typeof value === 'string' && value.length > MAX_STRING) {
      out[key] = `${value.slice(0, MAX_STRING)}...`;
      continue;
    }
    out[key] = value;
  }
  return out;
}

/** The outcome, flattened for a log line. */
function describe(result) {
  if (result == null) return { outcome: 'empty' };
  if (result.ok) return { outcome: 'ok', kind: result.kind };
  return { outcome: 'rejected', reason: result.reason };
}

/**
 * Runs a command's logic with logging around it. Returns exactly what run()
 * returned, and rethrows exactly what run() threw: this must be invisible to
 * the caller apart from the log lines.
 *
 * logger defaults to the global pino instance index.js installs, so command
 * files pass only the three arguments they have.
 */
async function runLogged(commandName, logic, input, logger = globalThis.topLogger) {
  const log = logger && logger.child
    ? logger.child({ file: 'commands', command: commandName })
    : null;
  const startedAt = Date.now();

  if (log) log.debug({ function: 'run', input: summarise(input) }, `${commandName}: running`);

  try {
    const result = await logic.run(input);
    if (log) {
      log.info(
        { function: 'run', ...describe(result), ms: Date.now() - startedAt },
        `${commandName}: ${describe(result).outcome}`,
      );
    }
    return result;
  } catch (error) {
    if (log) {
      log.error(
        { function: 'run', ms: Date.now() - startedAt, err: String(error && error.stack ? error.stack : error) },
        `${commandName}: threw`,
      );
    }
    // the central handler in events/interactionCreate.js still owns the reply
    throw error;
  }
}

module.exports = { runLogged, summarise, describe };
