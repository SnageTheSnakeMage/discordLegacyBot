/**
 * /trace - logic tests (#91). The path maths is real utils; only the model
 * rows are faked, so a change to getTileCordinatesOfLine shows up here.
 *
 * The property that matters most is that a trace is free: /shoot deducts AP,
 * damages walls and can kill, and /trace must do none of it however
 * interesting the line is. That is asserted explicitly rather than implied.
 */
const logic = require('../../../commands/Player Commands/trace.logic.js');
const trace = require('../../../commands/Player Commands/trace.js');
const { GAMESTATES, REJECTIONS } = require('../../../enums.js');
const {
  createDeps,
  createFakeGame,
  createFakePlayer,
  createFakeClass,
  createFakeTile,
} = require('../../helpers/mockModels.js');

const SHOOTER = { x: 1, y: 1 };

/**
 * A board where the shooter stands at 1,1 and every other tile is Blank1
 * unless `types` names it, keyed "x,y".
 */
function happyDeps(over = {}) {
  const types = over.types || {};
  const player = over.player || createFakePlayer({ Discord_ID: '123', Tile_ID: 1, Tile_ID2: null, Range_: 3 });
  const game = over.game || createFakeGame({ GAME_STATE: GAMESTATES.ACTIVE, shootCost: 2 });
  const playerClass = over.playerClass || createFakeClass({ Class_Name: 'Average' });
  const shooterType = over.shooterTileType || 'Blank1';

  const tileAt = (x, y) => {
    if (over.offBoard && over.offBoard.includes(`${x},${y}`)) return null;
    if (x === SHOOTER.x && y === SHOOTER.y) {
      return createFakeTile({ Tile_ID: 1, Layer_ID: 11, X_Position: x, Y_Position: y, Tile_Type: shooterType });
    }
    return createFakeTile({ Tile_ID: 100 + x, Layer_ID: 11, X_Position: x, Y_Position: y, Tile_Type: types[`${x},${y}`] || 'Blank1' });
  };

  return createDeps({
    models: {
      Games: { findByPk: async () => game },
      Players: { findOne: async () => player },
      Classes: { findByPk: async () => playerClass },
      Tiles: {
        findByPk: async (id) => (id === 1 ? tileAt(SHOOTER.x, SHOOTER.y) : null),
        findOne: async ({ where }) => tileAt(where.X_Position, where.Y_Position),
      },
    },
  });
}

const input = (over = {}) => ({ x: 4, y: 1, gameId: 1, body: 1, discordId: '123', ...over });

describe('trace.parse', () => {
  it('keeps the coordinates and defaults body to 1', () => {
    expect(logic.parse({ x: 3, y: 9, game: null, body: null }, { discordId: '1' }))
      .toEqual({ x: 3, y: 9, gameId: null, body: 1, discordId: '1' });
  });

  it('coerces only an exact 2 to body 2', () => {
    expect(logic.parse({ x: 1, y: 1, body: 2 }, { discordId: '1' }).body).toBe(2);
    expect(logic.parse({ x: 1, y: 1, body: 7 }, { discordId: '1' }).body).toBe(1);
  });
});

describe('trace.run rejections', () => {
  it('rejects an unknown game', async () => {
    const deps = createDeps({ models: { Games: { findByPk: async () => null } } });
    expect((await logic.run(input(), deps)).reason).toBe(REJECTIONS.NO_SUCH_GAME);
  });

  it('rejects a player who is not in the game', async () => {
    const deps = happyDeps();
    deps.models.Players.findOne = jest.fn(async () => null);
    expect((await logic.run(input(), deps)).reason).toBe(REJECTIONS.NOT_IN_GAME);
  });

  it('rejects a player who is not on the board', async () => {
    const deps = happyDeps();
    deps.models.Tiles.findByPk = jest.fn(async () => null);
    expect((await logic.run(input(), deps)).reason).toBe(REJECTIONS.NOT_IN_GAME);
  });

  it('rejects a target tile that does not exist', async () => {
    const deps = happyDeps();
    deps.models.Tiles.findOne = jest.fn(async () => null);
    expect((await logic.run(input(), deps)).reason).toBe(REJECTIONS.NO_SUCH_TILE);
  });

  it('is blocked by the gamestate gate like any other player command', async () => {
    const deps = happyDeps({ game: createFakeGame({ GAME_STATE: GAMESTATES.TIMESTOPPED }) });
    expect((await logic.run(input(), deps)).ok).toBe(false);
  });
});

describe('trace.run', () => {
  it('lists every tile between the shooter and the target, excluding the shooter', async () => {
    const result = await logic.run(input({ x: 4, y: 1 }), happyDeps());
    expect(result.ok).toBe(true);
    expect(result.data.steps.map((s) => [s.x, s.y])).toEqual([[2, 1], [3, 1], [4, 1]]);
    expect(result.data.distance).toBe(3);
  });

  it('flags walls as blocking and leaves other tiles alone', async () => {
    const deps = happyDeps({ types: { '3,1': 'Wall', '2,1': 'Bush' } });
    const result = await logic.run(input({ x: 4, y: 1 }), deps);
    expect(result.data.steps.map((s) => s.blocks)).toEqual([false, true, false]);
  });

  it('counts a damaged wall as blocking too', async () => {
    const deps = happyDeps({ types: { '2,1': 'Wall_Damaged' } });
    const result = await logic.run(input({ x: 4, y: 1 }), deps);
    expect(result.data.steps[0].blocks).toBe(true);
  });

  it('reports being out of range instead of rejecting it', async () => {
    // range 3, target 5 tiles away: the player still gets the path, which is
    // the question they asked
    const deps = happyDeps({ player: createFakePlayer({ Discord_ID: '123', Tile_ID: 1, Range_: 3 }) });
    const result = await logic.run(input({ x: 6, y: 1 }), deps);
    expect(result.ok).toBe(true);
    expect(result.data.inRange).toBe(false);
    expect(result.data.distance).toBe(5);
    expect(result.data.steps.map((s) => s.inRange)).toEqual([true, true, true, false, false]);
  });

  it('never writes anything - no AP spent, no tile changed', async () => {
    const deps = happyDeps({ types: { '2,1': 'Wall', '3,1': 'Wall_Damaged' } });
    await logic.run(input({ x: 4, y: 1 }), deps);
    expect(deps.models.Players.update).not.toHaveBeenCalled();
    expect(deps.models.Tiles.update).not.toHaveBeenCalled();
    expect(deps.models.Games.update).not.toHaveBeenCalled();
  });

  it('marks a coordinate with no tile row as off the board rather than dropping it', async () => {
    const deps = happyDeps({ offBoard: ['3,1'] });
    const result = await logic.run(input({ x: 4, y: 1 }), deps);
    expect(result.data.steps).toHaveLength(3);
    expect(result.data.steps[1]).toMatchObject({ x: 3, y: 1, tileType: null, blocks: false });
  });

  it('notes the bush coin flip, and that a Hunter is exempt', async () => {
    const fromBush = await logic.run(input(), happyDeps({ shooterTileType: 'Bush' }));
    expect(fromBush.data.fromBush).toBe(true);

    const hunter = await logic.run(input(), happyDeps({
      shooterTileType: 'Bush', playerClass: createFakeClass({ Class_Name: 'Hunter' }),
    }));
    expect(hunter.data.fromBush).toBe(false);
  });

  it('resolves the default game the way /shoot does, skipping finished games', async () => {
    // /shoot moved to getOldestActiveGameId in 8c3cd694; a preview of a shot
    // has to pick the same game the shot would
    const deps = happyDeps();
    deps.utils = { ...deps.utils, getOldestActiveGameId: jest.fn(async () => 1), getOldestGameId: jest.fn(async () => 99) };
    const result = await logic.run(input({ gameId: null }), deps);
    expect(result.ok).toBe(true);
    expect(deps.utils.getOldestActiveGameId).toHaveBeenCalledWith('123');
    expect(deps.utils.getOldestGameId).not.toHaveBeenCalled();
  });

  it('traces from the second body when asked', async () => {
    const player = createFakePlayer({ Discord_ID: '123', Tile_ID: 1, Tile_ID2: 2 });
    const deps = happyDeps({ player });
    deps.models.Tiles.findByPk = jest.fn(async (id) => (id === 2
      ? createFakeTile({ Tile_ID: 2, Layer_ID: 11, X_Position: 1, Y_Position: 1 })
      : null));
    const result = await logic.run(input({ body: 2 }), deps);
    expect(result.ok).toBe(true);
    expect(deps.models.Tiles.findByPk).toHaveBeenCalledWith(2);
  });
});

describe('trace.present', () => {
  it('renders the path, the first blocker and the AP cost', async () => {
    const deps = happyDeps({ types: { '3,1': 'Wall' } });
    const { content } = logic.present(await logic.run(input({ x: 4, y: 1 }), deps));
    expect(content).toContain('2,1: Blank1');
    expect(content).toContain('3,1: Wall (blocks the shot)');
    expect(content).toContain('The first shot would hit the Wall at 3,1');
    expect(content).toContain('2 AP a shot');
  });

  it('says how far out of range the tile is', async () => {
    const { content } = logic.present(await logic.run(input({ x: 6, y: 1 }), happyDeps()));
    expect(content).toContain('2 out of range');
  });

  it('says so plainly when the target is the tile you are on', async () => {
    const { content } = logic.present(await logic.run(input({ x: 1, y: 1 }), happyDeps()));
    expect(content).toBe('1,1 is the tile you are standing on.');
  });

  it('renders a rejection as its message', () => {
    expect(logic.present({ ok: false, reason: REJECTIONS.NO_SUCH_TILE }).content)
      .toBe('That tile is not on the board!');
  });
});

describe('trace registration', () => {
  it('registers as /trace with x and y required', () => {
    const json = trace.data.toJSON();
    expect(json.name).toBe('trace');
    const required = (json.options || []).filter((o) => o.required).map((o) => o.name);
    expect(required).toEqual(['x', 'y']);
  });
});
