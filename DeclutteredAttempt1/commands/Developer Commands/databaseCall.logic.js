/**
 * /call-db - dev-only raw database access.
 *
 * parse/run/present per TESTING.md Part 1. run() takes plain data and a deps
 * bundle and returns a CommandResult; it never sees an interaction. The
 * process.env.DEV_ID gate stays in the adapter and arrives here as
 * input.isDev (Part 1, order-of-work item 6).
 *
 * READ THIS BEFORE REVIEWING THE DIFF. The whole of the old
 * `databaseCall.js` - `data`, `execute`, `module.exports`, every line - was
 * commented out, so the file exported `{}`, index.js and deploy-commands.js
 * skipped it with a "missing data or execute" warning, and `/call-db` was
 * never a registered command. There was therefore no runtime behaviour to
 * preserve; the commented block is the only specification of this command
 * that exists, and this conversion is built from it. Three things in that
 * block could not be carried across as written (all listed as behaviour
 * fixes in the conversion report):
 *  - `subcommand.setName("update-player")` had no `.setDescription()`, so the
 *    builder throws "Expected a string primitive" at require time. It now has
 *    one.
 *  - the builder mixed three subcommands with a top-level required string
 *    option. Discord rejects a chat-input command whose options are not all
 *    subcommands, and one bad command fails the whole `rest.put` refresh - so
 *    registering it verbatim would have taken every other command down with
 *    it. The `model` option (same name, description and five choices) now
 *    hangs off each subcommand instead.
 *  - `execute` switched on `interaction.options.getString('Model')` while the
 *    registered option is `'model'`, so the subject was always null and no
 *    case could ever match; every case body was empty in any event, and
 *    nothing ever replied. The comparison now uses the real option value.
 *
 * Scope of what run() actually does. `data` declares no primary-key option
 * and no field/value options, so `find-by-primary-key` and `update-player`
 * have no way to receive the inputs they need; adding options would be a
 * change to `data`, which this conversion does not make. Those two
 * subcommands are therefore explicit rejections, and `find-all` - which needs
 * nothing beyond `model` - is the one path that reaches the database. This
 * command writes nothing: there is no models.update or models.create call in
 * this file, by design.
 */
const { REJECTIONS } = require('../../enums.js');
const { messageFor } = require('../_messages.js');
const defaultDeps = require('../_deps.js');

/** the five values of the `model` option's choice list, verbatim */
const MODEL_CHOICES = Object.freeze(['Players', 'Games', 'Classes', 'Tiles', 'Layers']);

/** the three declared subcommand names, verbatim */
const SUBCOMMANDS = Object.freeze({
  FIND_ALL: 'find-all',
  FIND_BY_PRIMARY_KEY: 'find-by-primary-key',
  UPDATE_PLAYER: 'update-player',
});

/** Discord's hard limit on message content; present() stays under it. */
const MAX_CONTENT = 2000;

function parse(raw, actor) {
  return {
    subcommand: raw.subcommand ?? null,
    model: raw.model ?? null,
    isDev: actor.isDev === true,
    discordId: actor.discordId,
  };
}

/** Sequelize rows become plain objects so present() never touches the ORM. */
function toPlainRow(row) {
  if (row && typeof row.toJSON === 'function') return row.toJSON();
  return row;
}

async function run(input, deps = defaultDeps) {
  const { models } = deps;

  if (!input.isDev) return { ok: false, reason: REJECTIONS.NOT_DEV };

  if (!MODEL_CHOICES.includes(input.model)) {
    return {
      ok: false,
      reason: REJECTIONS.INVALID_AMOUNT,
      data: { message: `\`${input.model}\` is not one of the models this command can read.` },
    };
  }

  if (input.subcommand !== SUBCOMMANDS.FIND_ALL) {
    return {
      ok: false,
      reason: REJECTIONS.INVALID_AMOUNT,
      data: { message: `The \`${input.subcommand}\` subcommand is not implemented.` },
    };
  }

  const found = await models[input.model].findAll();
  const rows = (found || []).map(toPlainRow);

  return { ok: true, kind: 'rows', data: { model: input.model, rows, count: rows.length } };
}

function present(result) {
  if (!result.ok) return { content: messageFor(result.reason, result.data) };

  const { model, rows, count } = result.data;
  if (count === 0) return { content: `No entries found in ${model}.` };

  const header = `${count} entr${count === 1 ? 'y' : 'ies'} in ${model}:`;
  const open = '```json\n';
  const close = '\n```';
  const budget = MAX_CONTENT - header.length - 1 - open.length - close.length;

  let body = rows.map((row) => JSON.stringify(row)).join('\n');
  if (body.length > budget) body = `${body.slice(0, budget - 3)}...`;

  return { content: `${header}\n${open}${body}${close}` };
}

module.exports = { parse, run, present, MODEL_CHOICES, SUBCOMMANDS, MAX_CONTENT };
