/**
 * Structural guard for the Clockwatcher exemption.
 *
 * The gamestate gate's second argument decides whether a timestop applies.
 * Every one of the 27 call sites used to pass a literal `false`, so the
 * Clockwatcher's entire ability - acting while time is stopped - did
 * nothing for anyone.
 *
 * utils.isClockwatcher has its own tests. This one exists because those
 * cannot notice a single command quietly going back to `false`: each
 * command's own suite mostly does not exercise a Clockwatcher, so the
 * regression would pass unseen in 14 of the 27 files. Checking the shape
 * of the call covers all of them at once, the same way the no-discord.js
 * boundary is enforced.
 */
const fs = require('fs');
const path = require('path');

const COMMANDS = path.join(__dirname, '..', 'commands');

function logicFiles() {
  const out = [];
  for (const dir of fs.readdirSync(COMMANDS)) {
    const full = path.join(COMMANDS, dir);
    if (!fs.statSync(full).isDirectory() || dir === 'decommissioned') continue;
    for (const f of fs.readdirSync(full)) {
      if (f.endsWith('.logic.js')) out.push(path.join(full, f));
    }
  }
  return out;
}

const gated = logicFiles()
  .map((f) => [path.basename(f), fs.readFileSync(f, 'utf8')])
  .filter(([, src]) => src.includes('checkGameState('));

describe('the gamestate gate is never told the actor is not a Clockwatcher', () => {
  it('finds the gated commands', () => {
    expect(gated.length).toBeGreaterThanOrEqual(27);
  });

  it.each(gated.map(([name]) => name))('%s does not hard-code the exemption to false', (name) => {
    const [, src] = gated.find(([n]) => n === name);
    // `checkGameState(x, false)` on one line, or wrapped across several
    // with a trailing comma - both must fail this
    expect(src).not.toMatch(/checkGameState\([^)]*,\s*false\s*,?\s*\)/s);
  });

  // board and move already resolved it inline, because they had the class
  // row in hand; the rest go through utils.isClockwatcher. Either is fine -
  // what matters is that the answer comes from the actor's class.
  it.each(gated.map(([name]) => name))('%s decides the exemption from the actor class', (name) => {
    const [, src] = gated.find(([n]) => n === name);
    expect(src).toMatch(/isClockwatcher|Class_Name\s*===?\s*'Clockwatcher'/);
  });
});
