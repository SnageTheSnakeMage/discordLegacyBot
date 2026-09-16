/**
 * /sandbox - logic tests for the read-only subcommands.
 *
 * The gate is the part worth guarding hardest: these are debug powers, and
 * the only thing standing between them and a live game is the SANDBOX check.
 */
const fs = require('fs');
const logic = require('../../../commands/Player Commands/sandbox.logic.js');
const sandbox = require('../../../commands/Player Commands/sandbox.js');
const { GAMESTATES, REJECTIONS, ChaosEvents } = require('../../../enums.js');
const { createDeps, createFakeGame, createFakePlayer, createFakeTile, createFakeLayer } = require('../../helpers/mockModels.js');

const PLAYER = '123';

function happyDeps(over = {}) {
  const game = over.game || createFakeGame({ Game_ID: 7, GAME_STATE: GAMESTATES.SANDBOX, CURR_CC_EVENT: 'Blockade' });
  const layers = over.layers || [createFakeLayer({ Layer_ID: 11 }), createFakeLayer({ Layer_ID: 22 })];
  const tile = 'tile' in over ? over.tile : createFakeTile({ Tile_ID: 99, Layer_ID: 11, X_Position: 3, Y_Position: 4, Tile_Type: 'Blank1' });
  return createDeps({
    models: {
      Games: {
        findByPk: async () => game,
        findAll: async () => (game.GAME_STATE === GAMESTATES.SANDBOX ? [game] : []),
      },
      Players: { findAll: async () => (over.membership || [createFakePlayer({ Game_ID: 7, Discord_ID: PLAYER })]) },
      Layers: { findAll: async () => layers },
      Tiles: { findOne: async () => tile },
    },
  });
}

const input = (over = {}) => ({
  subcommand: 'get-tile-id', x: 3, y: 4, layer: 1, gameId: 7, discordId: PLAYER, ...over,
});

describe('sandbox.parse', () => {
  it('carries the subcommand and the options through', () => {
    expect(logic.parse({ subcommand: 'get-tile-id', x: 1, y: 2, layer: 3, game: 4 }, { discordId: PLAYER }))
      .toEqual({ subcommand: 'get-tile-id', x: 1, y: 2, layer: 3, gameId: 4, discordId: PLAYER });
  });

  it('nulls every absent option rather than leaving it undefined', () => {
    expect(logic.parse({ subcommand: 'view-chaos' }, { discordId: PLAYER }))
      .toEqual({ subcommand: 'view-chaos', x: null, y: null, layer: null, gameId: null, discordId: PLAYER });
  });
});

describe('the sandbox gate', () => {
  it('refuses a game that is not in SANDBOX, naming the state it is in', async () => {
    const deps = happyDeps({ game: createFakeGame({ Game_ID: 7, GAME_STATE: GAMESTATES.ACTIVE }) });
    const result = await logic.run(input(), deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.NOT_SANDBOX, data: { gamestate: GAMESTATES.ACTIVE } });
    expect(logic.present(result).content).toContain('ACTIVE');
  });

  it('refuses a game id that does not exist', async () => {
    const deps = happyDeps();
    deps.models.Games.findByPk = jest.fn(async () => null);
    expect((await logic.run(input(), deps)).reason).toBe(REJECTIONS.NO_SUCH_GAME);
  });

  it('tells a player with no sandbox game so, instead of throwing', async () => {
    // utils.getOldestGamestateGameId would throw on an empty list here, which
    // is exactly why the gate resolves the game itself
    const deps = happyDeps({ membership: [] });
    deps.models.Games.findAll = jest.fn(async () => []);
    const result = await logic.run(input({ gameId: null }), deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.NO_SUCH_GAME });
    expect(logic.present(result).content).toContain('not in a sandbox game');
  });

  it('defaults to the oldest sandbox game the player is in', async () => {
    const older = createFakeGame({ Game_ID: 2, GAME_STATE: GAMESTATES.SANDBOX });
    const newer = createFakeGame({ Game_ID: 9, GAME_STATE: GAMESTATES.SANDBOX });
    const deps = happyDeps();
    deps.models.Games.findAll = jest.fn(async () => [newer, older]);
    const result = await logic.run(input({ gameId: null, subcommand: 'view-chaos' }), deps);
    expect(result.data.gameId).toBe(2);
  });

  it('never reads a game the caller did not ask for when they gave an id', async () => {
    const deps = happyDeps();
    await logic.run(input(), deps);
    expect(deps.models.Games.findByPk).toHaveBeenCalledWith(7);
  });
});

describe('sandbox get-tile-id', () => {
  it('returns the Tile_ID and what is on it', async () => {
    const result = await logic.run(input(), happyDeps());
    expect(result).toMatchObject({ ok: true, kind: 'tileId', data: { tileId: 99, layerId: 11, tileType: 'Blank1' } });
    expect(logic.present(result).content).toContain('Tile_ID **99**');
  });

  it('maps the 1-based layer option onto the game\'s Layer_IDs', async () => {
    const deps = happyDeps();
    await logic.run(input({ layer: 2 }), deps);
    expect(deps.models.Tiles.findOne).toHaveBeenCalledWith({ where: { Layer_ID: 22, X_Position: 3, Y_Position: 4 } });
  });

  it('rejects a layer the game does not have, saying how many it has', async () => {
    const result = await logic.run(input({ layer: 5 }), happyDeps());
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.NO_SUCH_LAYER });
    expect(logic.present(result).content).toContain('2 layer(s)');
  });

  it('rejects a position with no tile', async () => {
    const result = await logic.run(input(), happyDeps({ tile: null }));
    expect(result.reason).toBe(REJECTIONS.NO_SUCH_TILE);
  });
});

describe('sandbox get-classes', () => {
  it('sends the csv that actually exists in the repo', async () => {
    const result = await logic.run(input({ subcommand: 'get-classes' }), happyDeps());
    expect(result).toMatchObject({ ok: true, kind: 'classes' });
    // a path that does not resolve would attach nothing and say nothing
    expect(fs.existsSync(result.data.filePath)).toBe(true);
    expect(fs.readFileSync(result.data.filePath, 'utf8').split('\n')[0]).toContain('id,class');
    expect(logic.present(result).files).toEqual([{ path: result.data.filePath, name: 'classes.csv' }]);
  });
});

describe('sandbox view-chaos', () => {
  it('lists every event set-chaos accepts, and the current one', async () => {
    const result = await logic.run(input({ subcommand: 'view-chaos' }), happyDeps());
    expect(result.data.events).toEqual(Object.keys(ChaosEvents));
    expect(result.data.current).toBe('Blockade');
    const { content } = logic.present(result);
    expect(content).toContain('- Blockade');
    expect(content).toContain('Currently set: **Blockade**');
  });

  it('stays inside Discord\'s 2000 character message limit', () => {
    // the descriptions together run well past it, which is why only the names
    // are listed
    const content = logic.present({
      ok: true,
      kind: 'chaosList',
      data: { events: Object.keys(ChaosEvents), current: null, gameId: 1 },
    }).content;
    expect(content.length).toBeLessThanOrEqual(2000);
    expect(content).toContain('Currently set: **none**');
  });
});

describe('sandbox writes nothing in this set', () => {
  it.each(['get-tile-id', 'get-classes', 'view-chaos'])('%s is read-only', async (subcommand) => {
    const deps = happyDeps();
    await logic.run(input({ subcommand }), deps);
    for (const model of ['Games', 'Players', 'Tiles', 'Layers']) {
      expect(deps.models[model].update).not.toHaveBeenCalled();
      expect(deps.models[model].create).not.toHaveBeenCalled();
      expect(deps.models[model].destroy).not.toHaveBeenCalled();
    }
  });
});

describe('sandbox adapter', () => {
  it('registers as /sandbox with the three subcommands', () => {
    const json = sandbox.data.toJSON();
    expect(json.name).toBe('sandbox');
    expect(json.options.map((o) => o.name)).toEqual(['get-tile-id', 'get-classes', 'view-chaos']);
    expect(json.options.every((o) => o.type === 1)).toBe(true);
    expect(typeof sandbox.execute).toBe('function');
  });
});
