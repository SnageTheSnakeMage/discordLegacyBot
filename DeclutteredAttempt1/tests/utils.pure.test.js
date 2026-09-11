/**
 * Pure utils functions - no mocks, no deps, no database. Replaces the old
 * tests/utils.test.js, which ran against the hand-maintained __mocks__ copy
 * of utils instead of utils itself.
 */
const utils = require('../utils.js');
const { GAMESTATES, REJECTIONS } = require('../enums.js');

describe('getTileCordinatesOfLine', () => {
  it.each([
    // orthogonal
    [[3, 3], [5, 3], [[3, 3], [4, 3], [5, 3]]],
    [[3, 3], [1, 3], [[3, 3], [2, 3], [1, 3]]],
    [[3, 3], [3, 5], [[3, 3], [3, 4], [3, 5]]],
    [[3, 3], [3, 1], [[3, 3], [3, 2], [3, 1]]],
  ])('orthogonal %j -> %j', (from, to, expected) => {
    expect(utils.getTileCordinatesOfLine(from, to)).toStrictEqual(expected);
  });

  it('starts every line with the origin tile', () => {
    for (const to of [[5, 3], [1, 3], [3, 5], [3, 1], [5, 5], [1, 1]]) {
      expect(utils.getTileCordinatesOfLine([3, 3], to)[0]).toStrictEqual([3, 3]);
    }
  });

  it('ends every line on the destination tile', () => {
    for (const to of [[5, 3], [1, 3], [3, 5], [3, 1], [5, 5], [1, 1], [5, 1], [1, 5]]) {
      const line = utils.getTileCordinatesOfLine([3, 3], to);
      expect(line[line.length - 1]).toStrictEqual(to);
    }
  });

  it('a zero-length line is just the origin', () => {
    expect(utils.getTileCordinatesOfLine([3, 3], [3, 3])).toStrictEqual([[3, 3]]);
  });

  it.each([
    [[3, 3], [5, 5]],
    [[3, 3], [1, 1]],
    [[3, 3], [5, 1]],
    [[3, 3], [1, 5]],
  ])('pure diagonals step both axes each move: %j -> %j', (from, to) => {
    const line = utils.getTileCordinatesOfLine(from, to);
    expect(line).toHaveLength(3);
    for (let i = 1; i < line.length; i++) {
      expect(Math.abs(line[i][0] - line[i - 1][0])).toBe(1);
      expect(Math.abs(line[i][1] - line[i - 1][1])).toBe(1);
    }
  });
});

describe('getDirection', () => {
  it.each([
    [[3, 3], [3, 1], 'north'],
    [[3, 3], [3, 5], 'south'],
    [[3, 3], [5, 3], 'east'],
    [[3, 3], [1, 3], 'west'],
    [[3, 3], [5, 1], 'northeast'],
    [[3, 3], [1, 1], 'northwest'],
    [[3, 3], [5, 5], 'southeast'],
    [[3, 3], [1, 5], 'southwest'],
  ])('%j -> %j is %s (south is +Y, issue #89)', (from, to, expected) => {
    expect(utils.getDirection(from, to)).toBe(expected);
  });
});

describe('checkGameState - the full gamestate table', () => {
  // every state in the enum has an explicit expected outcome; adding a
  // state without deciding its gate makes this test fail
  const expected = {
    [GAMESTATES.ACTIVE]: { blocked: false },
    [GAMESTATES.REGISTRATION]: { blocked: false },
    [GAMESTATES.INACTIVE]: { blocked: false },
    [GAMESTATES.SANDBOX]: { blocked: false },
    [GAMESTATES.FINALE]: { blocked: false },
    [GAMESTATES.OVER]: { blocked: true, reason: REJECTIONS.GAME_OVER },
    [GAMESTATES.DEV_PAUSED]: { blocked: true, reason: REJECTIONS.GAME_PAUSED },
    [GAMESTATES.TIMESTOPPED]: { blocked: true, reason: REJECTIONS.TIME_STOPPED },
  };

  it('covers every declared gamestate', () => {
    expect(Object.keys(expected).sort()).toEqual(Object.values(GAMESTATES).sort());
  });

  it.each(Object.entries(expected))('%s (non-clockwatcher)', (state, verdict) => {
    expect(utils.checkGameState(state, false)).toEqual(verdict);
  });

  it('a Clockwatcher passes through a timestop', () => {
    expect(utils.checkGameState(GAMESTATES.TIMESTOPPED, true)).toEqual({ blocked: false });
  });

  it('throws on a gamestate outside the enum', () => {
    expect(() => utils.checkGameState('NOT_A_STATE', false)).toThrow(/out of enum/);
  });
});

describe('randomness helpers', () => {
  it('getRandomInt(max) is inclusive of max and never negative', () => {
    const seen = new Set();
    for (let i = 0; i < 200; i++) {
      const n = utils.getRandomInt(2);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(2);
      seen.add(n);
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('getRandomItemInCollection always returns an element (was undefined ~1 in 6 calls)', () => {
    const items = ['a', 'b', 'c'];
    for (let i = 0; i < 200; i++) {
      expect(items).toContain(utils.getRandomItemInCollection(items));
    }
  });
});
