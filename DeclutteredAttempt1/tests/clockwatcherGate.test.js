/**
 * Structural guard for the Clockwatcher exemption.
 *
 * The gamestate gate's second argument decides whether a timestop applies.
 * A call site that passes a literal `false` takes away the Clockwatcher's
 * entire ability - acting while time is stopped - for that command.
 *
 * utils.isClockwatcher has its own tests. This one exists because those
 * cannot notice a single command quietly passing `false`: each command's
 * own suite mostly does not exercise a Clockwatcher, so the mistake would
 * pass unseen in most of the files. Checking the shape
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

  // One test per rule, not per file: the failure then names every command
  // that regressed in one go, and the suite counts rules rather than rows.
  it('no gated command hard-codes the exemption to false', () => {
    // `checkGameState(x, false)` on one line, or wrapped across several
    // with a trailing comma - both must fail this
    const offenders = gated
      .filter(([, src]) => /checkGameState\([^)]*,\s*false\s*,?\s*\)/s.test(src))
      .map(([name]) => name);
    expect(offenders).toEqual([]);
  });

  // board and move already resolved it inline, because they had the class
  // row in hand; the rest go through utils.isClockwatcher. Either is fine -
  // what matters is that the answer comes from the actor's class.
  it('every gated command decides the exemption from the actor class', () => {
    const offenders = gated
      .filter(([, src]) => !/isClockwatcher|Class_Name\s*===?\s*'Clockwatcher'/.test(src))
      .map(([name]) => name);
    expect(offenders).toEqual([]);
  });
});
