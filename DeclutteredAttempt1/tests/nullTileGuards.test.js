/**
 * A null row read straight into a property access is the single most common
 * way a command ends in "There was an error while executing this command!".
 * The biggest source of null rows is death: playerDeathLogic writes
 * {Tile_ID: null, Dead: true}, so a dead player's Tile_ID is null and
 * Tiles.findByPk(null) resolves to null. Most class commands have no dead
 * gate, so without a guard every one of them is a TypeError for a corpse.
 *
 * This walks the logic files rather than testing one command, and asserts on
 * the collected list of offenders - so a new command with the same shape
 * fails here, named, instead of failing in production.
 */
const fs = require('fs');
const path = require('path');

const COMMANDS_DIR = path.join(__dirname, '..', 'commands');

/** every *.logic.js under commands/, recursively */
function logicFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) logicFiles(p, out);
    else if (entry.name.endsWith('.logic.js')) out.push(p);
  }
  return out;
}

const rel = (f) => path.relative(COMMANDS_DIR, f);

const isComment = (line) => {
  const t = line.trim();
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
};

/**
 * A row read is guarded when the variable is null-tested before anything reads
 * a property off it. Any of these count, because each one handles the null:
 * an `if (!row)` that returns or continues, a `row &&`, a ternary `row ? ...`,
 * or optional chaining. What does not count is going straight to `row.Column`.
 *
 * Returns true when the read is safe, false when the first thing that happens
 * to the row is a property access.
 */
function isGuarded(lines, from, variable) {
  const nullTest = new RegExp(
    `!${variable}\\b`
    + `|${variable}\\s*===?\\s*null`
    + `|${variable}\\s*!==?\\s*null`
    + `|${variable}\\s*&&`
    + `|${variable}\\s*\\?`,
  );
  const propertyRead = new RegExp(`${variable}\\.[A-Za-z_]`);

  for (let j = from; j < lines.length; j++) {
    if (isComment(lines[j])) continue;
    // a null test reached first means the row is handled
    if (nullTest.test(lines[j])) return true;
    // a property read reached first means it is not
    if (propertyRead.test(lines[j])) return false;
    // end of the function body
    if (/^}/.test(lines[j])) return true;
  }
  return true;
}

describe('null-row guards in logic files', () => {
  it('guards every Tiles read keyed on a Tile_ID column', () => {
    const offenders = [];
    for (const file of logicFiles(COMMANDS_DIR)) {
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (isComment(lines[i])) continue;
        const match = lines[i].match(/const\s+(\w+)\s*=\s*await\s+models\.Tiles\.(?:findByPk|findOne)\(/);
        if (!match) continue;
        const variable = match[1];
        // the statement may wrap over several lines; find where it ends
        let end = i;
        while (end < lines.length && !lines[end].includes(';')) end++;
        const statement = lines.slice(i, end + 1).join(' ');
        // only reads keyed on a tile id or coordinates can come back null here
        if (!/Tile_ID|X_Position/.test(statement)) continue;
        if (!isGuarded(lines, end + 1, variable)) {
          offenders.push(`${rel(file)}:${i + 1} - ${variable} is read with no null guard`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('guards every Players read, since a mention need not be a player in the game', () => {
    const offenders = [];
    for (const file of logicFiles(COMMANDS_DIR)) {
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (isComment(lines[i])) continue;
        const match = lines[i].match(/const\s+(\w+)\s*=\s*await\s+models\.Players\.findOne\(/);
        if (!match) continue;
        const variable = match[1];
        let end = i;
        while (end < lines.length && !lines[end].includes(';')) end++;
        if (!isGuarded(lines, end + 1, variable)) {
          offenders.push(`${rel(file)}:${i + 1} - ${variable} is read with no null guard`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
