/**
 * /create-board - logic tests. Plain data in, plain data out: no jest.mock,
 * no discord.js, no interaction, and no real board files - deps.boards is a
 * fake preset source so these tests never depend on database/boards/.
 */
const logic = require('../../../commands/Developer Commands/createBoard.logic.js');
const createBoard = require('../../../commands/Developer Commands/createBoard.js');
const { REJECTIONS } = require('../../../enums.js');
const { createDeps, createFakeGame, createFakePlayer } = require('../../helpers/mockModels.js');
const { parseBoard } = require('../../../database/boardPresets.js');

const DEV = '123';
const ACTOR = { discordId: DEV, username: 'snage', isDev: true };

/** a two-layer preset: 2x2 on top of 1x2 */
const PRESET = { name: 'test', ...parseBoard('layer Top\n#G\n.~\nvvv\nlayer Bottom\n..') };

function deps(over = {}) {
  const created = [];
  const base = createDeps({
    models: {
      Games: { findByPk: async (id) => (over.game === null ? null : createFakeGame({ Game_ID: id })) },
      Layers: {
        findAll: async () => over.existingLayers || [],
        create: async (row) => {
          const made = { ...row, Layer_ID: 100 + created.length };
          created.push(made);
          return made;
        },
      },
      Players: { findAll: async () => over.players || [] },
    },
    boards: {
      listPresets: () => ['test', 'other'],
      loadPreset: (name) => (name === 'test' ? PRESET : null),
    },
  });
  base.created = created;
  return base;
}

const input = (over = {}) => logic.parse({ preset: 'test', game: 3, ...over }, ACTOR);

describe('parse', () => {
  test('omitted options become null / false, and isDev comes from the actor', () => {
    expect(logic.parse({}, { discordId: DEV })).toEqual({
      preset: null, gameId: null, replace: false, isDev: false, discordId: DEV,
    });
  });

  test('replace is only true for a literal true', () => {
    expect(logic.parse({ replace: null }, ACTOR).replace).toBe(false);
    expect(logic.parse({ replace: true }, ACTOR).replace).toBe(true);
  });
});

describe('run', () => {
  test('a non-dev is rejected before anything is read', async () => {
    const d = deps();
    const result = await logic.run(logic.parse({ preset: 'test', game: 3 }, { discordId: '999' }), d);
    expect(result).toEqual({ ok: false, reason: REJECTIONS.NOT_DEV });
    expect(d.models.Games.findByPk).not.toHaveBeenCalled();
  });

  test('no preset named lists the presets instead of building anything', async () => {
    const d = deps();
    const result = await logic.run(input({ preset: null }), d);
    expect(result).toEqual({ ok: true, kind: 'presetList', data: { available: ['test', 'other'] } });
    expect(d.models.Layers.create).not.toHaveBeenCalled();
  });

  test('an unknown preset is rejected with the list of real ones', async () => {
    const result = await logic.run(input({ preset: 'nope' }), deps());
    expect(result.reason).toBe(REJECTIONS.NO_SUCH_PRESET);
    expect(result.data).toEqual({ preset: 'nope', available: ['test', 'other'] });
  });

  test('a game that does not exist is rejected', async () => {
    const result = await logic.run(input(), deps({ game: null }));
    expect(result.reason).toBe(REJECTIONS.NO_SUCH_GAME);
    expect(result.data).toEqual({ gameId: 3 });
  });

  test('creates one Layers row per layer, in file order, with the drawn bounds', async () => {
    const d = deps();
    await logic.run(input(), d);
    expect(d.models.Layers.create).toHaveBeenCalledTimes(2);
    expect(d.models.Layers.create.mock.calls[0][0]).toEqual({
      Layer_Above: null, Layer_Below: null, X_Bound: 2, Y_Bound: 2, Game_ID: 3,
    });
    expect(d.models.Layers.create.mock.calls[1][0]).toMatchObject({ X_Bound: 2, Y_Bound: 1 });
  });

  test('chains the stack: the first layer is the top, the last has nothing below', async () => {
    const d = deps();
    await logic.run(input(), d);
    const updates = d.models.Layers.update.mock.calls;
    expect(updates[0]).toEqual([{ Layer_Above: null, Layer_Below: 101 }, { where: { Layer_ID: 100 } }]);
    expect(updates[1]).toEqual([{ Layer_Above: 100, Layer_Below: null }, { where: { Layer_ID: 101 } }]);
  });

  test('inserts every tile against its own layer, coordinates intact', async () => {
    const d = deps();
    const result = await logic.run(input(), d);

    const [topTiles] = d.models.Tiles.bulkCreate.mock.calls[0];
    expect(topTiles).toHaveLength(4);
    expect(topTiles).toContainEqual({ Tile_Type: 'Wall', X_Position: 1, Y_Position: 1, Layer_ID: 100 });
    expect(topTiles).toContainEqual({ Tile_Type: 'Gateway_Open', X_Position: 2, Y_Position: 1, Layer_ID: 100 });
    expect(topTiles).toContainEqual({ Tile_Type: 'Ice', X_Position: 2, Y_Position: 2, Layer_ID: 100 });

    const [bottomTiles] = d.models.Tiles.bulkCreate.mock.calls[1];
    expect(bottomTiles.every((t) => t.Layer_ID === 101)).toBe(true);

    expect(result).toMatchObject({ ok: true, kind: 'boardCreated' });
    expect(result.data).toMatchObject({ preset: 'test', gameId: 3, tileCount: 6, removedLayers: 0 });
    expect(result.data.layers).toEqual([
      { name: 'Top', layerId: 100, width: 2, height: 2, tiles: 4 },
      { name: 'Bottom', layerId: 101, width: 2, height: 1, tiles: 2 },
    ]);
  });

  test('a game that already has a board is rejected unless replace is set', async () => {
    const d = deps({ existingLayers: [{ Layer_ID: 5 }, { Layer_ID: 6 }] });
    const result = await logic.run(input(), d);
    expect(result.reason).toBe(REJECTIONS.BOARD_EXISTS);
    expect(result.data).toEqual({ gameId: 3, layerCount: 2 });
    expect(d.models.Tiles.destroy).not.toHaveBeenCalled();
    expect(d.models.Layers.create).not.toHaveBeenCalled();
  });

  test('replace clears the old tiles and layers first', async () => {
    const d = deps({ existingLayers: [{ Layer_ID: 5 }, { Layer_ID: 6 }] });
    const result = await logic.run(input({ replace: true }), d);
    expect(d.models.Tiles.destroy.mock.calls).toEqual([
      [{ where: { Layer_ID: 5 } }],
      [{ where: { Layer_ID: 6 } }],
    ]);
    expect(d.models.Layers.destroy).toHaveBeenCalledWith({ where: { Game_ID: 3 } });
    expect(result.data.removedLayers).toBe(2);
  });

  test('replace refuses while players are standing on the board', async () => {
    const d = deps({
      existingLayers: [{ Layer_ID: 5 }],
      players: [createFakePlayer({ Tile_ID: 42 }), createFakePlayer({ Tile_ID: null, Tile_ID2: 7 })],
    });
    const result = await logic.run(input({ replace: true }), d);
    expect(result.reason).toBe(REJECTIONS.BOARD_IN_USE);
    expect(result.data).toEqual({ playerCount: 2 });
    expect(d.models.Tiles.destroy).not.toHaveBeenCalled();
    expect(d.models.Layers.destroy).not.toHaveBeenCalled();
  });

  test('players with no tile at all do not block a replace', async () => {
    const d = deps({
      existingLayers: [{ Layer_ID: 5 }],
      players: [createFakePlayer({ Tile_ID: null, Tile_ID2: null })],
    });
    const result = await logic.run(input({ replace: true }), d);
    expect(result.ok).toBe(true);
  });
});

describe('present', () => {
  test('names every layer it built', async () => {
    const result = await logic.run(input(), deps());
    const { content } = logic.present(result);
    expect(content).toContain('Built "test" for game 3: 2 layers, 6 tiles.');
    expect(content).toContain('1. Top - 2x2, 4 tiles (Layer_ID 100)');
    expect(content).not.toContain('Replaced');
  });

  test('says so when it replaced a board', async () => {
    const d = deps({ existingLayers: [{ Layer_ID: 5 }] });
    const { content } = logic.present(await logic.run(input({ replace: true }), d));
    expect(content).toContain('Replaced the previous board (1 layers).');
  });

  test('lists the presets when none was named', async () => {
    const { content } = logic.present(await logic.run(input({ preset: null }), deps()));
    expect(content).toContain('Board presets: test, other');
  });

  test('turns every rejection into text, never a blank reply', async () => {
    for (const reason of [REJECTIONS.NOT_DEV, REJECTIONS.NO_SUCH_GAME, REJECTIONS.NO_SUCH_PRESET,
      REJECTIONS.BOARD_EXISTS, REJECTIONS.BOARD_IN_USE]) {
      const { content } = logic.present({ ok: false, reason, data: {} });
      expect(typeof content).toBe('string');
      expect(content.length).toBeGreaterThan(0);
    }
  });
});

describe('the command module', () => {
  test('registers as /create-board with the options parse reads', () => {
    const json = createBoard.data.toJSON();
    expect(json.name).toBe('create-board');
    expect(json.options.map((o) => o.name).sort()).toEqual(['game', 'preset', 'replace']);
    expect(json.options.every((o) => o.required !== true)).toBe(true);
  });
});
