/**
 * Structural guard: every command routes its run() through runLogged.
 *
 * There are 42 of them and they are all one line, so a new command added
 * later would silently be the only one nobody can debug. Same style as the
 * Clockwatcher gate guard.
 */
const fs = require('fs');
const path = require('path');

const COMMANDS = path.join(__dirname, '..', 'commands');

function commandFiles() {
  const out = [];
  for (const dir of fs.readdirSync(COMMANDS)) {
    const full = path.join(COMMANDS, dir);
    if (!fs.statSync(full).isDirectory() || dir === 'decommissioned') continue;
    for (const f of fs.readdirSync(full)) {
      if (f.endsWith('.js') && !f.endsWith('.logic.js')) out.push(path.join(full, f));
    }
  }
  return out;
}

const commands = commandFiles().map((f) => [path.basename(f), fs.readFileSync(f, 'utf8')]);

describe('every command logs its run()', () => {
  it('finds the commands', () => {
    expect(commands.length).toBeGreaterThanOrEqual(42);
  });

  it.each(commands.map(([n]) => n))('%s calls runLogged, not logic.run directly', (name) => {
    const [, src] = commands.find(([n]) => n === name);
    expect(src).toMatch(/runLogged\(/);
    expect(src).not.toMatch(/await logic\.run\(/);
  });
});
