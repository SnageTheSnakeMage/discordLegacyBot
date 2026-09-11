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
 * The exception is a logic file big enough that its internals are their own
 * story - see stepLogger at the bottom of this file.
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

/**
 * A step logger for the *inside* of a long logic file.
 *
 * runLogged above records that a command ran and what it decided. That is
 * enough for the small commands, where "rejected: NOT_ENOUGH_AP" is the whole
 * story. It is not enough for a logic file with a loop in it: when /move says
 * NO_SUCH_TILE on step 4 of a 7-tile walk, the entry/exit pair says only that
 * the command was rejected, not where the walk was or what it had already
 * done to the player. So logic files over the size threshold (see
 * tests/logicFileLogging.test.js) log their internal decisions too.
 *
 * The rules that keep this from becoming a side effect every test must stub:
 *
 *  - it is DEBUG only. A step log is for reconstructing one player's turn
 *    after the fact, never for normal operation.
 *  - with no logger anywhere it returns a no-op function, so a logic file
 *    called from a test that passes neither deps.logger nor a global logger
 *    behaves exactly as it did before.
 *  - details go through summarise(), because a step detail can carry
 *    player-supplied text (a /move path) straight into a file on disk.
 *  - it is built from deps, so a test that *wants* the steps injects
 *    deps.logger and reads them back.
 *
 * globalThis.topLogger is read lazily, on each call: index.js installs it
 * after these modules are required, so reading it at import time gets
 * undefined.
 */
function stepLogger(commandName, deps) {
  const logger = (deps && deps.logger) || globalThis.topLogger;
  const log = logger && logger.child
    ? logger.child({ file: 'commands', command: commandName })
    : null;
  if (!log) return () => {};

  return (step, detail) => {
    log.debug({ function: step, ...summarise(detail) }, `${commandName}: ${step}`);
  };
}

module.exports = { runLogged, stepLogger, summarise, describe };
