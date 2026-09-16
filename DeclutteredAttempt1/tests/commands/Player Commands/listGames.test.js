/**
 * /listgames - logic tests. Read-only command: one findAll over Games,
 * no rejection paths, no writes. Plain data in, plain data out.
 */
const logic = require('../../../commands/Player Commands/listGames.logic.js');
const listGames = require('../../../commands/Player Commands/listGames.js');
const { GAMESTATES } = require('../../../enums.js');
const { noticeFor, NOTICES } = require('../../../commands/_messages.js');
const { createDeps, createFakeGame } = require('../../helpers/mockModels.js');

describe('listGames.parse', () => {
  it('defaults to REGISTRATION, the games you can still join', () => {
    expect(logic.parse({}, { discordId: '123', username: 'snage' }))
      .toEqual({ gamestate: GAMESTATES.REGISTRATION });
  });

  it('passes an explicit gamestate through', () => {
    expect(logic.parse({ gamestate: GAMESTATES.ACTIVE }, { discordId: '123' }))
      .toEqual({ gamestate: GAMESTATES.ACTIVE });
  });

  it('passes the ALL escape hatch through', () => {
    expect(logic.parse({ gamestate: 'ALL' }, { discordId: '123' })).toEqual({ gamestate: 'ALL' });
  });

  it('ignores the actor and any option it does not declare', () => {
    expect(logic.parse({ game: 7 }, { discordId: '456' })).toEqual({ gamestate: GAMESTATES.REGISTRATION });
  });
});

describe('listGames.run', () => {
  const ALL = { gamestate: 'ALL' };

  it('returns every game as plain data and writes nothing (read-only)', async () => {
    const deps = createDeps({ models: { Games: { findAll: async () => [
      createFakeGame({ Game_ID: 1, GAME_STATE: GAMESTATES.ACTIVE, CURR_CC_EVENT: 'BOOOORRRINNNG', winner: null }),
      createFakeGame({ Game_ID: 2, GAME_STATE: GAMESTATES.OVER, CURR_CC_EVENT: 'Blockade', winner: 'snage' }),
    ] } } });
    const result = await logic.run(ALL, deps);
    expect(result).toEqual({
      ok: true,
      kind: 'gameList',
      data: { gamestate: 'ALL', games: [
        { gameId: 1, gameState: GAMESTATES.ACTIVE, chaosEvent: 'BOOOORRRINNNG', winner: null },
        { gameId: 2, gameState: GAMESTATES.OVER, chaosEvent: 'Blockade', winner: 'snage' },
      ] },
    });
    expect(deps.models.Games.update).not.toHaveBeenCalled();
    expect(deps.models.Games.create).not.toHaveBeenCalled();
    expect(deps.models.Players.update).not.toHaveBeenCalled();
    expect(deps.models.Players.create).not.toHaveBeenCalled();
  });

  it('returns an empty list when there are no games', async () => {
    const deps = createDeps({ models: { Games: { findAll: async () => [] } } });
    expect(await logic.run(ALL, deps)).toEqual({
      ok: true, kind: 'gameList', data: { gamestate: 'ALL', games: [] },
    });
  });

  // The filter is the point of the option: the whole reason it exists is that
  // a server with a pile of finished games buries the joinable ones. Doing it
  // in the query rather than after it is what these pin - a findAll() with no
  // where would still look right in the returned data while reading every
  // finished game off disk.
  it('asks the database for one gamestate rather than filtering afterwards', async () => {
    const deps = createDeps({ models: { Games: { findAll: jest.fn(async () => []) } } });
    await logic.run({ gamestate: GAMESTATES.REGISTRATION }, deps);
    expect(deps.models.Games.findAll).toHaveBeenCalledWith({
      where: { GAME_STATE: GAMESTATES.REGISTRATION },
    });
  });

  it('asks for everything, with no where clause, when the gamestate is ALL', async () => {
    const deps = createDeps({ models: { Games: { findAll: jest.fn(async () => []) } } });
    await logic.run(ALL, deps);
    expect(deps.models.Games.findAll).toHaveBeenCalledWith();
  });

  // every state in the enum is a legal filter, including one added later
  it.each(Object.values(GAMESTATES))('filters on %s', async (state) => {
    const deps = createDeps({ models: { Games: { findAll: jest.fn(async () => [createFakeGame({ GAME_STATE: state })]) } } });
    const result = await logic.run({ gamestate: state }, deps);
    expect(result.ok).toBe(true);
    expect(deps.models.Games.findAll).toHaveBeenCalledWith({ where: { GAME_STATE: state } });
    expect(result.data.games[0].gameState).toBe(state);
  });

  // no AP/range boundary cases: the command has no inputs, costs nothing and
  // checks nothing - findAll is the whole behaviour
});

describe('listGames.present', () => {
  it('renders one game byte-identical to the legacy format', () => {
    const out = logic.present({ ok: true, kind: 'gameList', data: { games: [
      { gameId: 1, gameState: 'ACTIVE', chaosEvent: 'BOOOORRRINNNG', winner: null },
    ] } });
    expect(out).toEqual({
      content: 'Game ID:1 - Game State: ACTIVE\n Current Chaos Council Event: BOOOORRRINNNG - No chaos,\n Winner: null\n--------\n',
    });
  });

  it('concatenates multiple games in order', () => {
    const out = logic.present({ ok: true, kind: 'gameList', data: { games: [
      { gameId: 1, gameState: 'ACTIVE', chaosEvent: 'BOOOORRRINNNG', winner: null },
      { gameId: 2, gameState: 'OVER', chaosEvent: 'Blockade', winner: 'snage' },
    ] } });
    expect(out.content).toBe(
      'Game ID:1 - Game State: ACTIVE\n Current Chaos Council Event: BOOOORRRINNNG - No chaos,\n Winner: null\n--------\n'
      + "Game ID:2 - Game State: OVER\n Current Chaos Council Event: Blockade - Walls can not be damaged while this chaos event is in play, sniper's snipes go through walls still.,\n Winner: snage\n--------\n",
    );
  });

  // was: "preserves the old quirk: zero games renders as an empty string".
  // Discord refuses to send an empty message, so that quirk was not a
  // cosmetic oddity - it took the whole command down into the central
  // handler's "There was an error while executing this command!".
  it('renders the NO_GAMES notice when there are no games, never an empty message', () => {
    const out = logic.present({ ok: true, kind: 'gameList', data: { games: [] } });
    expect(out.content).toBe(noticeFor('NO_GAMES'));
    expect(out.content.length).toBeGreaterThan(0);
  });

  it('names the filter that produced an empty list, and points at the way out', () => {
    const out = logic.present({
      ok: true, kind: 'gameList', data: { gamestate: GAMESTATES.REGISTRATION, games: [] },
    });
    expect(out.content).toContain(GAMESTATES.REGISTRATION);
    // an empty REGISTRATION list is the common case for a server mid-game, so
    // the reply has to say how to see the games that do exist - and it has to
    // spell the option the way the picker does, or the hint is a dead end
    expect(out.content).toContain('gamestate:All');
  });

  it('falls back to the no-games-at-all wording when the filter is ALL', () => {
    const out = logic.present({ ok: true, kind: 'gameList', data: { gamestate: 'ALL', games: [] } });
    expect(out.content).not.toContain('gamestate:All');
    expect(out.content.length).toBeGreaterThan(0);
  });

  it('uses the wording configured in _messages.js rather than its own literal', () => {
    // a copy edit to NOTICES.NO_GAMES must reach the player with no code change
    const spy = jest.spyOn(NOTICES, 'NO_GAMES').mockReturnValue('nothing to see here');
    try {
      expect(logic.present({ ok: true, kind: 'gameList', data: { games: [] } }))
        .toEqual({ content: 'nothing to see here' });
    } finally {
      spy.mockRestore();
    }
  });

  it('preserves the old quirk: an unknown chaos event renders its description as "undefined"', () => {
    const out = logic.present({ ok: true, kind: 'gameList', data: { games: [
      { gameId: 3, gameState: 'ACTIVE', chaosEvent: 'Not A Real Event', winner: null },
    ] } });
    expect(out.content).toBe(
      'Game ID:3 - Game State: ACTIVE\n Current Chaos Council Event: Not A Real Event - undefined,\n Winner: null\n--------\n',
    );
  });

  // present() has no per-REJECTIONS table here: run() never rejects, so no
  // rejection code is ever rendered by this command
});

describe('listGames adapter (smoke)', () => {
  it('exports the command contract', () => {
    expect(listGames.data.toJSON().name).toBe('listgames');
    expect(typeof listGames.execute).toBe('function');
  });
});
