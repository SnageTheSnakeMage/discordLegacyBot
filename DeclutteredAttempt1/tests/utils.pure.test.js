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
    // a game that has not started is not playable: acting in one used to fall
    // through to whatever the command checked next, which is how /move
    // answered "not enough action points" for a registration game (#145)
    [GAMESTATES.REGISTRATION]: { blocked: true, reason: REJECTIONS.GAME_IN_REGISTRATION },
    [GAMESTATES.INACTIVE]: { blocked: true, reason: REJECTIONS.GAME_INACTIVE },
    [GAMESTATES.SANDBOX]: { blocked: false },
    [GAMESTATES.FINALE]: { blocked: false },
    [GAMESTATES.OVER]: { blocked: true, reason: REJECTIONS.GAME_OVER },
    [GAMESTATES.DEV_PAUSED]: { blocked: true, reason: REJECTIONS.GAME_PAUSED },
    [GAMESTATES.TIMESTOPPED]: { blocked: true, reason: REJECTIONS.TIME_STOPPED },
  };

  // readOnly is the /stats/board exemption: the two states that mean "there
  // is nothing to act on yet" are the two it opens, and no others. Listing
  // every state again rather than only the differences is what makes a new
  // state fail here too.
  const expectedReadOnly = {
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

  it('covers every declared gamestate for a read-only caller too', () => {
    expect(Object.keys(expectedReadOnly).sort()).toEqual(Object.values(GAMESTATES).sort());
  });

  it.each(Object.entries(expectedReadOnly))('%s (read-only)', (state, verdict) => {
    expect(utils.checkGameState(state, false, { readOnly: true })).toEqual(verdict);
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

describe('playerIconName', () => {
  it('is the one definition of the suffixed name the renderer reads', () => {
    expect(utils.playerIconName('123', 4)).toBe('123_4');
  });
});

describe('resolveTileTexturePath', () => {
  it('returns the texture when it is on disk', () => {
    expect(utils.resolveTileTexturePath('environment', 'Blank1'))
      .toBe('./tiles/environment/Blank1.png');
  });

  it('falls back to the layer default for a name that is not on disk', () => {
    expect(utils.resolveTileTexturePath('environment', 'NotARealTileType'))
      .toBe('./tiles/environment/default.png');
  });

  // Deliberately NOT loadTileTexture's transparent-for-null. An invisible
  // texture looks exactly like a correctly transparent one, so resolving null
  // to transparent.png would render a misspelt or missing name as nothing at
  // all and make it look intentional. default.png is visible, so the mistake
  // gets reported instead of shipped.
  it('falls back to the layer default for a null name, not to transparent', () => {
    const resolved = utils.resolveTileTexturePath('environment', null);
    expect(resolved).toBe('./tiles/environment/default.png');
    expect(resolved).not.toContain('transparent');
  });

  it('treats undefined the same as null', () => {
    expect(utils.resolveTileTexturePath('environment', undefined))
      .toBe('./tiles/environment/default.png');
  });

  it('returns null when even the layer default is missing', () => {
    // a layer directory that does not exist has no default.png either, which
    // is a broken checkout rather than a missing texture - the caller is
    // expected to say so rather than attach a path that cannot be uploaded
    expect(utils.resolveTileTexturePath('no-such-layer', 'Blank1')).toBeNull();
  });
});
