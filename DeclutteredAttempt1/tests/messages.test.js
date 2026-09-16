/**
 * commands/_messages.js had no test at all. What stood in for one was a
 * "renders X as non-empty text" block repeated across 40-odd command suites,
 * 53 tests in total - and they could not detect a missing message, because
 * messageFor falls back to
 *
 *     Something went wrong! (unrecognised rejection: OUT_OF_RANGE)
 *
 * which is a non-empty string containing no "undefined". Deleting the whole
 * OUT_OF_RANGE entry from MESSAGES left 1817 of 1820 tests passing, and the
 * three that caught it were exact-wording tests, none of the 53.
 *
 * This file replaces them with the assertion they were reaching for, made
 * over the enum rather than over one command's subset: every code a command
 * can return has real player-facing text.
 */
const { REJECTIONS } = require('../enums.js');
const { messageFor, MESSAGES } = require('../commands/_messages.js');

const CODES = Object.values(REJECTIONS);

/** the shape of the fallback messageFor returns for a code it does not know */
const UNRECOGNISED = /unrecognised rejection/;

describe('every rejection code has player-facing text', () => {
  it('REJECTIONS is not empty (this suite would otherwise be vacuous)', () => {
    expect(CODES.length).toBeGreaterThan(30);
  });

  // One test per rule rather than one per code. Three it.each blocks over
  // ~37 codes reported 110-odd tests for three assertions, and a failure
  // named one code at a time; walking the list and collecting offenders
  // names every code that lost its text in a single message.
  it('every code has an entry in MESSAGES', () => {
    const offenders = CODES.filter((reason) => typeof MESSAGES[reason] !== 'function');
    expect(offenders).toEqual([]);
  });

  /** what is wrong with the text for `reason`, given `data`, if anything */
  function faults(reason, data) {
    const text = data === undefined ? messageFor(reason) : messageFor(reason, data);
    if (typeof text !== 'string') return `${reason}: not a string (${typeof text})`;
    if (text.length === 0) return `${reason}: empty`;
    if (UNRECOGNISED.test(text)) return `${reason}: fell through to the unrecognised fallback`;
    if (/undefined|\[object Object\]/.test(text)) return `${reason}: leaks a placeholder - "${text}"`;
    return null;
  }

  // data is absent here on purpose: a command may return a bare
  // { ok: false, reason }, and every formatter has to survive that rather
  // than interpolating "undefined" into the reply a player reads
  it('every code renders without data', () => {
    expect(CODES.map((r) => faults(r, undefined)).filter(Boolean)).toEqual([]);
  });

  it('every code renders with an empty data object', () => {
    expect(CODES.map((r) => faults(r, {})).filter(Boolean)).toEqual([]);
  });

  it('MESSAGES carries no key that is not a rejection code', () => {
    expect(Object.keys(MESSAGES).sort()).toEqual([...CODES].sort());
  });
});

describe('messageFor', () => {
  it('prefers a command-supplied data.message over the table', () => {
    expect(messageFor(REJECTIONS.OUT_OF_RANGE, { message: 'custom wording' }))
      .toBe('custom wording');
  });

  it('falls back loudly for a code with no entry', () => {
    // the fallback is deliberately recognisable - it is a bug when a player
    // sees it, and the it.each above is what keeps it unreachable
    expect(messageFor('NOT_A_REJECTION')).toMatch(UNRECOGNISED);
  });

  it('parameterises the codes that take data', () => {
    expect(messageFor(REJECTIONS.WRONG_CLASS, { className: 'Pyromainiac' }))
      .toBe('You are not a Pyromainiac!');
    expect(messageFor(REJECTIONS.NOT_ENOUGH_AP, { action: 'burn a tile' }))
      .toBe('You dont have enough AP to burn a tile!');
    expect(messageFor(REJECTIONS.NO_SUCH_GAME, { gameId: 7 }))
      .toBe('Could not find game #7!');
  });
});
