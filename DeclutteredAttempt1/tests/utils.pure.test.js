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
    // a game that has not started is not playable, so the gate refuses rather
    // than leaving it to whatever the command checks next
    [GAMESTATES.REGISTRATION]: { blocked: true, reason: REJECTIONS.GAME_IN_REGISTRATION },
    [GAMESTATES.OVER]: { blocked: true, reason: REJECTIONS.GAME_OVER },
    [GAMESTATES.DEV_PAUSED]: { blocked: true, reason: REJECTIONS.GAME_PAUSED },
  };

  // readOnly is the /stats and /board exemption: it opens the one state that
  // means "there is nothing to act on yet", and no others. Every state is
  // listed again rather than only the differences so a new one fails here too.
  const expectedReadOnly = {
    [GAMESTATES.ACTIVE]: { blocked: false },
    [GAMESTATES.REGISTRATION]: { blocked: false },
    [GAMESTATES.OVER]: { blocked: true, reason: REJECTIONS.GAME_OVER },
    [GAMESTATES.DEV_PAUSED]: { blocked: true, reason: REJECTIONS.GAME_PAUSED },
  };

  it('covers every declared gamestate', () => {
    expect(Object.keys(expected).sort()).toEqual(Object.values(GAMESTATES).sort());
  });

  it.each(Object.entries(expected))('%s (non-clockwatcher)', (state, verdict) => {
    expect(utils.checkGameState({ GAME_STATE: state }, false)).toEqual(verdict);
  });

  it('covers every declared gamestate for a read-only caller too', () => {
    expect(Object.keys(expectedReadOnly).sort()).toEqual(Object.values(GAMESTATES).sort());
  });

  it.each(Object.entries(expectedReadOnly))('%s (read-only)', (state, verdict) => {
    expect(utils.checkGameState({ GAME_STATE: state }, false, { readOnly: true })).toEqual(verdict);
  });

  it('throws on a gamestate outside the enum', () => {
    expect(() => utils.checkGameState({ GAME_STATE: 'NOT_A_STATE' }, false)).toThrow(/out of enum/);
  });

  // the flags: a timestop is the only one the gate has an opinion about, and it
  // is a condition on a game being played rather than one of its states
  describe('the flags', () => {
    const playing = (flags) => ({ GAME_STATE: GAMESTATES.ACTIVE, ...flags });

    it('a timestop blocks anyone who is not a Clockwatcher', () => {
      expect(utils.checkGameState(playing({ timeStopped: true }), false))
        .toEqual({ blocked: true, reason: REJECTIONS.TIME_STOPPED });
    });

    it('a Clockwatcher acts through a timestop', () => {
      expect(utils.checkGameState(playing({ timeStopped: true }), true)).toEqual({ blocked: false });
    });

    // a timestop withholds the answer on purpose, so readOnly is no exemption
    // from it - but the Clockwatcher's is, for reading as much as for acting
    it('a timestop blocks a read-only caller unless they are a Clockwatcher', () => {
      expect(utils.checkGameState(playing({ timeStopped: true }), false, { readOnly: true }))
        .toEqual({ blocked: true, reason: REJECTIONS.TIME_STOPPED });
      expect(utils.checkGameState(playing({ timeStopped: true }), true, { readOnly: true }))
        .toEqual({ blocked: false });
    });

    // the finale, sandbox mode and the clock are not the gate's business: they
    // change what the game does, not who may act in it
    it.each([{ finale: true }, { sandbox: true }, { gameActive: false }, { gameActive: true }])(
      '%o does not block', (flags) => {
        expect(utils.checkGameState(playing(flags), false)).toEqual({ blocked: false });
      },
    );

    // every combination of the three non-clock flags, with the timestop
    // deciding on its own each time
    it.each([true, false])('timeStopped %s decides regardless of the others', (timeStopped) => {
      for (const finale of [true, false]) {
        for (const sandbox of [true, false]) {
          const verdict = utils.checkGameState(playing({ timeStopped, finale, sandbox }), false);
          expect(verdict).toEqual(timeStopped
            ? { blocked: true, reason: REJECTIONS.TIME_STOPPED }
            : { blocked: false });
        }
      }
    });
  });
});

describe('setGameState', () => {
  // the invariant: a game that has not started or has finished cannot have a
  // running clock, whatever the caller asks for
  const fakeDb = (game) => {
    const updates = [];
    return {
      updates,
      db: {
        Games: {
          findByPk: async () => game,
          update: async (fields) => { updates.push(fields); return [1]; },
        },
      },
    };
  };

  it.each([
    [GAMESTATES.REGISTRATION, false],
    [GAMESTATES.OVER, false],
    [GAMESTATES.ACTIVE, true],
    [GAMESTATES.DEV_PAUSED, true],
  ])('%s: an asked-for running clock is granted = %s', async (state, granted) => {
    const { db, updates } = fakeDb({ Game_ID: 1, GAME_STATE: GAMESTATES.ACTIVE, gameActive: false });
    const changes = await utils.setGameState(1, state, { gameActive: true, db });
    expect(changes.GAME_STATE).toBe(state);
    expect(changes.gameActive).toBe(granted);
    expect(updates[0].gameActive).toBe(granted);
  });

  it('leaves the clock alone when gameActive is not passed', async () => {
    const { db } = fakeDb({ Game_ID: 1, GAME_STATE: GAMESTATES.ACTIVE, gameActive: true });
    const changes = await utils.setGameState(1, GAMESTATES.DEV_PAUSED, { db });
    expect(changes).toEqual({ GAME_STATE: GAMESTATES.DEV_PAUSED, gameActive: true });
  });

  it('keeps the state when only the clock is moving', async () => {
    const { db } = fakeDb({ Game_ID: 1, GAME_STATE: GAMESTATES.DEV_PAUSED, gameActive: false });
    const changes = await utils.setGameState(1, null, { gameActive: true, db });
    expect(changes.GAME_STATE).toBe(GAMESTATES.DEV_PAUSED);
    expect(changes.gameActive).toBe(true);
  });

  // apCheckTick measures catch-up from this timestamp, so a clock that starts
  // after an hour off would otherwise pay for the whole hour
  it('resets the AP timestamp when the clock starts', async () => {
    const { db } = fakeDb({ Game_ID: 1, GAME_STATE: GAMESTATES.DEV_PAUSED, gameActive: false });
    const changes = await utils.setGameState(1, GAMESTATES.ACTIVE, { gameActive: true, db });
    expect(changes.lastAPDistributionTimestampInMS).toEqual(expect.any(Number));
  });

  it('leaves the AP timestamp alone when the clock was already running', async () => {
    const { db } = fakeDb({ Game_ID: 1, GAME_STATE: GAMESTATES.ACTIVE, gameActive: true });
    const changes = await utils.setGameState(1, GAMESTATES.ACTIVE, { gameActive: true, db });
    expect(changes).not.toHaveProperty('lastAPDistributionTimestampInMS');
  });

  it('leaves the AP timestamp alone when the clock stops', async () => {
    const { db } = fakeDb({ Game_ID: 1, GAME_STATE: GAMESTATES.ACTIVE, gameActive: true });
    const changes = await utils.setGameState(1, GAMESTATES.DEV_PAUSED, { gameActive: false, db });
    expect(changes).not.toHaveProperty('lastAPDistributionTimestampInMS');
  });

  it('answers null for a game that is not there, and writes nothing', async () => {
    const { db, updates } = fakeDb(null);
    expect(await utils.setGameState(999, GAMESTATES.ACTIVE, { db })).toBeNull();
    expect(updates).toEqual([]);
  });

  it('throws on a gamestate outside the enum rather than writing it', async () => {
    const { db, updates } = fakeDb({ Game_ID: 1, GAME_STATE: GAMESTATES.ACTIVE, gameActive: true });
    await expect(utils.setGameState(1, 'Inactive', { db })).rejects.toContain('out of enum');
    expect(updates).toEqual([]);
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
