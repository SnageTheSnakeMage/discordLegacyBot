/**
 * Structural guard for the Clockwatcher exemption.
 *
 * The gamestate gate's second argument decides whether a timestop applies
 * to the actor. The rule has two halves:
 *
 * - a class command (one that refuses the wrong class with WRONG_CLASS)
 *   passes `false`: a player has one class, and a Clockwatcher never has
 *   the class that command needs, so a timestop always blocks it;
 * - every other command decides it from the actor's class, so a
 *   Clockwatcher acts through a timestop - that is the class's ability.
 *
 * utils.isClockwatcher has its own tests. This one exists because those
 * cannot notice a single command drifting to the wrong half: each
 * command's own suite exercises only its own gate. Checking the shape of
 * the call covers all of them at once, the same way the no-discord.js
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

const isClassCommand = (src) => src.includes('REJECTIONS.WRONG_CLASS');
// `checkGameState(x, false)` on one line, or wrapped across several with a
// trailing comma
const passesFalse = (src) => /checkGameState\([^)]*,\s*false\s*,?\s*\)/s.test(src);
// board and move resolve it inline, because they have the class row in
// hand; the rest go through utils.isClockwatcher
const asksTheClass = (src) => /isClockwatcher|Class_Name\s*===?\s*'Clockwatcher'/.test(src);

describe('the gamestate gate is told whether a timestop applies to the actor', () => {
  it('finds the gated commands, of both kinds', () => {
    expect(gated.length).toBeGreaterThanOrEqual(27);
    expect(gated.filter(([, src]) => isClassCommand(src)).length).toBeGreaterThanOrEqual(20);
    expect(gated.filter(([, src]) => !isClassCommand(src)).length).toBeGreaterThanOrEqual(5);
  });

  it('every class command is blocked by a timestop', () => {
    const offenders = gated
      .filter(([, src]) => isClassCommand(src) && !passesFalse(src))
      .map(([name]) => name);
    expect(offenders).toEqual([]);
  });

  it('every other command lets a Clockwatcher act through a timestop', () => {
    const offenders = gated
      .filter(([, src]) => !isClassCommand(src) && (passesFalse(src) || !asksTheClass(src)))
      .map(([name]) => name);
    expect(offenders).toEqual([]);
  });
});
