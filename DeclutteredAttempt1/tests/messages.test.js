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

  it.each(CODES)('%s has an entry in MESSAGES', (reason) => {
    expect(typeof MESSAGES[reason]).toBe('function');
  });

  // data is absent here on purpose: a command may return a bare
  // { ok: false, reason }, and every formatter has to survive that rather
  // than interpolating "undefined" into the reply a player reads
  it.each(CODES)('%s renders without data', (reason) => {
    const text = messageFor(reason);
    expect(typeof text).toBe('string');
    expect(text.length).toBeGreaterThan(0);
    expect(text).not.toMatch(UNRECOGNISED);
    expect(text).not.toMatch(/undefined|\[object Object\]/);
  });

  it.each(CODES)('%s renders with an empty data object', (reason) => {
    const text = messageFor(reason, {});
    expect(text.length).toBeGreaterThan(0);
    expect(text).not.toMatch(UNRECOGNISED);
    expect(text).not.toMatch(/undefined|\[object Object\]/);
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
