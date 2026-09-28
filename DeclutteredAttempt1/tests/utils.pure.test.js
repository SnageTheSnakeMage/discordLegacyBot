/**
 * Pure utils functions - no mocks, no deps, no database. Replaces the old
 * tests/utils.test.js, which ran against the hand-maintained __mocks__ copy
 * of utils instead of utils itself.
 */
const utils = require('../utils.js');
const { GAMESTATES, REJECTIONS } = require('../enums.js');
const { everyCase } = require('./helpers/everyCase.js');

describe('getTileCordinatesOfLine', () => {
  it('orthogonal <from> -> <to>', async () => {
    expect(await everyCase('orthogonal %j -> %j', [
      // orthogonal
      [[3, 3], [5, 3], [[3, 3], [4, 3], [5, 3]]],
      [[3, 3], [1, 3], [[3, 3], [2, 3], [1, 3]]],
      [[3, 3], [3, 5], [[3, 3], [3, 4], [3, 5]]],
      [[3, 3], [3, 1], [[3, 3], [3, 2], [3, 1]]],
    ], (from, to, expected) => {
      expect(utils.getTileCordinatesOfLine(from, to)).toStrictEqual(expected);
    })).toEqual([]);
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

  it('pure diagonals step both axes each move: <from> -> <to>', async () => {
    expect(await everyCase('pure diagonals step both axes each move: %j -> %j', [
      [[3, 3], [5, 5]],
      [[3, 3], [1, 1]],
      [[3, 3], [5, 1]],
      [[3, 3], [1, 5]],
    ], (from, to) => {
      const line = utils.getTileCordinatesOfLine(from, to);
      expect(line).toHaveLength(3);
      for (let i = 1; i < line.length; i++) {
        expect(Math.abs(line[i][0] - line[i - 1][0])).toBe(1);
        expect(Math.abs(line[i][1] - line[i - 1][1])).toBe(1);
      }
    })).toEqual([]);
  });
});

describe('getDirection', () => {
  it('<from> -> <to> is <expected> (south is +Y, issue #89)', async () => {
    expect(await everyCase('%j -> %j is %s (south is +Y, issue #89)', [
      [[3, 3], [3, 1], 'north'],
      [[3, 3], [3, 5], 'south'],
      [[3, 3], [5, 3], 'east'],
      [[3, 3], [1, 3], 'west'],
      [[3, 3], [5, 1], 'northeast'],
      [[3, 3], [1, 1], 'northwest'],
      [[3, 3], [5, 5], 'southeast'],
      [[3, 3], [1, 5], 'southwest'],
    ], (from, to, expected) => {
      expect(utils.getDirection(from, to)).toBe(expected);
    })).toEqual([]);
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

  it('<state> (non-clockwatcher)', async () => {
    expect(await everyCase('%s (non-clockwatcher)', Object.entries(expected), (state, verdict) => {
      expect(utils.checkGameState({ GAME_STATE: state }, false)).toEqual(verdict);
    })).toEqual([]);
  });

  it('covers every declared gamestate for a read-only caller too', () => {
    expect(Object.keys(expectedReadOnly).sort()).toEqual(Object.values(GAMESTATES).sort());
  });

  it('<state> (read-only)', async () => {
    expect(await everyCase('%s (read-only)', Object.entries(expectedReadOnly), (state, verdict) => {
      expect(utils.checkGameState({ GAME_STATE: state }, false, { readOnly: true })).toEqual(verdict);
    })).toEqual([]);
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
    it('<flags> does not block', async () => {
      expect(await everyCase('%o does not block', [{ finale: true }, { sandbox: true }, { gameActive: false }, { gameActive: true }], (flags) => {
          expect(utils.checkGameState(playing(flags), false)).toEqual({ blocked: false });
        },)).toEqual([]);
    });

    // every combination of the three non-clock flags, with the timestop
    // deciding on its own each time
    it('timeStopped <timeStopped> decides regardless of the others', async () => {
      expect(await everyCase('timeStopped %s decides regardless of the others', [true, false], (timeStopped) => {
        for (const finale of [true, false]) {
          for (const sandbox of [true, false]) {
            const verdict = utils.checkGameState(playing({ timeStopped, finale, sandbox }), false);
            expect(verdict).toEqual(timeStopped
              ? { blocked: true, reason: REJECTIONS.TIME_STOPPED }
              : { blocked: false });
          }
        }
      })).toEqual([]);
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

  it('<state>: an asked-for running clock is granted = <granted>', async () => {
    expect(await everyCase('%s: an asked-for running clock is granted = %s', [
      [GAMESTATES.REGISTRATION, false],
      [GAMESTATES.OVER, false],
      [GAMESTATES.ACTIVE, true],
      [GAMESTATES.DEV_PAUSED, true],
    ], async (state, granted) => {
      const { db, updates } = fakeDb({ Game_ID: 1, GAME_STATE: GAMESTATES.ACTIVE, gameActive: false });
      const changes = await utils.setGameState(1, state, { gameActive: true, db });
      expect(changes.GAME_STATE).toBe(state);
      expect(changes.gameActive).toBe(granted);
      expect(updates[0].gameActive).toBe(granted);
    })).toEqual([]);
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

  // A stop keeps the game's place in its AP interval: a game 5 minutes from
  // being paid when it stops is 5 minutes from being paid when it starts,
  // however long it was stopped. apCheckTick measures from the timestamp, so
  // that is what has to land in the same place relative to `now`.
  describe('the AP interval across a stopped clock', () => {
    const MINUTE = 60 * 1000;
    const STOPPED_AT = 1700000000000;
    const STARTED_AT = STOPPED_AT + 9 * 60 * MINUTE;
    const running = (over = {}) => ({
      Game_ID: 1, GAME_STATE: GAMESTATES.ACTIVE, gameActive: true, AP_INTERVAL_MIN: 60,
      lastAPDistributionTimestampInMS: STOPPED_AT - 55 * MINUTE, apElapsedWhenStoppedInMS: null, ...over,
    });

    it('records how far into its interval the game was when the clock stops', async () => {
      const { db } = fakeDb(running());
      const changes = await utils.setGameState(1, null, { gameActive: false, db, now: STOPPED_AT });
      expect(changes.apElapsedWhenStoppedInMS).toBe(55 * MINUTE);
      expect(changes).not.toHaveProperty('lastAPDistributionTimestampInMS');
    });

    it('starts again exactly that far into it', async () => {
      const { db } = fakeDb(running({ gameActive: false, apElapsedWhenStoppedInMS: 55 * MINUTE }));
      const changes = await utils.setGameState(1, null, { gameActive: true, db, now: STARTED_AT });
      expect(STARTED_AT - changes.lastAPDistributionTimestampInMS).toBe(55 * MINUTE);
      expect(changes.apElapsedWhenStoppedInMS).toBeNull();
    });

    it('round-trips: 5 minutes to go before the stop, 5 minutes to go after it', async () => {
      const game = running();
      const { db } = fakeDb(game);
      Object.assign(game, await utils.setGameState(1, GAMESTATES.DEV_PAUSED, { gameActive: false, db, now: STOPPED_AT }));
      Object.assign(game, await utils.setGameState(1, GAMESTATES.ACTIVE, { gameActive: true, db, now: STARTED_AT }));
      const interval = game.AP_INTERVAL_MIN * MINUTE;
      expect(interval - (STARTED_AT - game.lastAPDistributionTimestampInMS)).toBe(5 * MINUTE);
    });

    // a game behind on its payments keeps that too: the gap is kept, not capped
    it('keeps a gap longer than one interval', async () => {
      const { db } = fakeDb(running({ lastAPDistributionTimestampInMS: STOPPED_AT - 130 * MINUTE }));
      const changes = await utils.setGameState(1, null, { gameActive: false, db, now: STOPPED_AT });
      expect(changes.apElapsedWhenStoppedInMS).toBe(130 * MINUTE);
    });

    it('starts a game that has never run on a fresh interval', async () => {
      const { db } = fakeDb(running({
        GAME_STATE: GAMESTATES.REGISTRATION, gameActive: false, lastAPDistributionTimestampInMS: null,
      }));
      const changes = await utils.setGameState(1, GAMESTATES.ACTIVE, { gameActive: true, db, now: STARTED_AT });
      expect(changes.lastAPDistributionTimestampInMS).toBe(STARTED_AT);
    });

    it('records no time elapsed for a game stopped before it ever ran', async () => {
      const { db } = fakeDb(running({ lastAPDistributionTimestampInMS: null }));
      const changes = await utils.setGameState(1, null, { gameActive: false, db, now: STOPPED_AT });
      expect(changes.apElapsedWhenStoppedInMS).toBe(0);
    });

    it('writes neither column when the clock does not move', async () => {
      const { db } = fakeDb(running());
      const changes = await utils.setGameState(1, GAMESTATES.ACTIVE, { gameActive: true, db, now: STARTED_AT });
      expect(changes).toEqual({ GAME_STATE: GAMESTATES.ACTIVE, gameActive: true });
    });
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
