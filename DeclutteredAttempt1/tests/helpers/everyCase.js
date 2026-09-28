/**
 * Runs one check against every row of a table, and reports every row that
 * failed at once - rather than one test per row, which counts rows instead of
 * rules and stops at nothing.
 *
 *   expect(await everyCase('%s -> %s', ROWS, (input, output) => {
 *     expect(f(input)).toBe(output);
 *   })).toEqual([]);
 *
 * Rows follow jest's .each convention: an array row is spread into the
 * check's arguments, anything else is passed as the one argument. Each
 * failure is labelled with `title` formatted by that row, the way .each
 * names its tests, followed by what the failed expectation said.
 */
const { format, inspect } = require('util');

// every value is inspected here, so every placeholder is filled as a string;
// %# is the row's index, as in jest
function label(title, args, index) {
  const template = title.replace(/%[pojdif]/g, '%s').replace(/%#/g, String(index));
  return format(template, ...args.map((arg) => (typeof arg === 'string' ? arg : inspect(arg, { depth: 3, breakLength: Infinity }))));
}

function summarise(error) {
  const lines = String(error && error.message ? error.message : error)
    .replace(/\u001b\[[0-9;]*m/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('expect('));
  const text = lines.join(' | ');
  return text.length > 300 ? `${text.slice(0, 300)}...` : text;
}

async function everyCase(title, rows, check) {
  const failures = [];
  let index = 0;
  for (const row of rows) {
    const args = Array.isArray(row) ? row : [row];
    try {
      await check(...args);
    } catch (error) {
      failures.push(`${label(title, args, index)}: ${summarise(error)}`);
    }
    index++;
  }
  return failures;
}

module.exports = { everyCase };
