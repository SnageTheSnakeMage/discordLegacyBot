/**
 * /listgames - logic tests. Read-only command: one findAll over Games,
 * no rejection paths, no writes. Plain data in, plain data out.
 */
const logic = require('../../../commands/Player Commands/listGames.logic.js');
const listGames = require('../../../commands/Player Commands/listGames.js');
const { GAMESTATES } = require('../../../enums.js');
const { createDeps, createFakeGame } = require('../../helpers/mockModels.js');

describe('listGames.parse', () => {
  it('takes no options and returns an empty input regardless of raw/actor', () => {
    expect(logic.parse({}, { discordId: '123', username: 'snage' })).toEqual({});
    expect(logic.parse({ game: 7 }, { discordId: '456' })).toEqual({});
  });
});

describe('listGames.run', () => {
  it('returns every game as plain data and writes nothing (read-only)', async () => {
    const deps = createDeps({ models: { Games: { findAll: async () => [
      createFakeGame({ Game_ID: 1, GAME_STATE: GAMESTATES.ACTIVE, CURR_CC_EVENT: 'BOOOORRRINNNG', winner: null }),
      createFakeGame({ Game_ID: 2, GAME_STATE: GAMESTATES.OVER, CURR_CC_EVENT: 'Blockade', winner: 'snage' }),
    ] } } });
    const result = await logic.run({}, deps);
    expect(result).toEqual({
      ok: true,
      kind: 'gameList',
      data: { games: [
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
    expect(await logic.run({}, deps)).toEqual({ ok: true, kind: 'gameList', data: { games: [] } });
  });

  // there is no gamestate gate: /listgames lists games in EVERY state rather
  // than blocking on any of them - this table pins that no state is filtered
  // out or rejected (the usual it.each over rejection reasons does not apply
  // because the command has no rejection paths at all)
  it.each(Object.values(GAMESTATES))('lists a game in state %s instead of blocking on it', async (state) => {
    const deps = createDeps({ models: { Games: { findAll: async () => [createFakeGame({ GAME_STATE: state })] } } });
    const result = await logic.run({}, deps);
    expect(result.ok).toBe(true);
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

  it('preserves the old quirk: zero games renders as an empty string', () => {
    expect(logic.present({ ok: true, kind: 'gameList', data: { games: [] } })).toEqual({ content: '' });
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
