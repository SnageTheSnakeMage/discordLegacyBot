/**
 * /shove - the Bully's ability. Plain data in, plain data out.
 *
 * "up" and "down" are LAYERS, per the sheet's ">shove @mention up/back/down";
 * "back" is the one that pushes across the board, away from the Bully.
 */
const logic = require('../../../commands/Class Commands/shove.logic.js');
const shove = require('../../../commands/Class Commands/shove.js');
const { GAMESTATES, REJECTIONS } = require('../../../enums.js');
const {
  createDeps, createFakeGame, createFakePlayer, createFakeTile, createFakeClass,
} = require('../../helpers/mockModels.js');

const BULLY = '111';
const VICTIM = '222';

/** bully at (2,2); victim at (3,2), i.e. one tile east */
function happyDeps(over = {}) {
  const game = 'game' in over ? over.game : createFakeGame({ Game_ID: 1, GAME_STATE: GAMESTATES.ACTIVE });
  const player = 'player' in over ? over.player : createFakePlayer({
    Player_ID: 1, Discord_ID: BULLY, Class_ID: 40, Action_Points: 5, Tile_ID: 10,
  });
  const target = 'target' in over ? over.target : createFakePlayer({
    Player_ID: 2, Discord_ID: VICTIM, Class_ID: 1, Tile_ID: 11,
  });
  const bullyTile = createFakeTile({ Tile_ID: 10, Layer_ID: 1, X_Position: 2, Y_Position: 2 });
  const victimTile = createFakeTile({ Tile_ID: 11, Layer_ID: 1, X_Position: 3, Y_Position: 2 });
  const behind = 'behind' in over ? over.behind
    : createFakeTile({ Tile_ID: 12, Layer_ID: 1, X_Position: 4, Y_Position: 2, Tile_Type: 'Blank1' });
  const classes = {
    40: createFakeClass({ Class_ID: 40, Class_Name: 'Bully' }),
    1: createFakeClass({ Class_ID: 1, Class_Name: over.targetClassName || 'Average' }),
  };

  const deps = createDeps({
    models: {
      Games: { findByPk: async () => game },
      Players: {
        findOne: async ({ where }) => (
          where.Discord_ID === BULLY ? player : where.Discord_ID === VICTIM ? target : null
        ),
      },
      Classes: { findByPk: async (id) => classes[id] || null },
      Tiles: {
        findByPk: async (id) => (id === 10 ? bullyTile : id === 11 ? victimTile : null),
        findOne: async ({ where }) => (
          'layers' in over ? over.layers(where)
            : (where.X_Position === 4 && where.Y_Position === 2 && where.Layer_ID === 1) ? behind : null
        ),
      },
      Layers: { findByPk: async () => ('layer' in over ? over.layer : { Layer_ID: 1, Layer_Above: 2, Layer_Below: null }) },
    },
    utils: { setPlayerToTile: jest.fn(async () => undefined) },
  });
  return { deps, player, target, behind };
}

const INPUT = {
  gameId: 1, targetDiscordId: VICTIM, targetUsername: 'victim', direction: 'back',
  discordId: BULLY, username: 'bully',
};

describe('shove.run success', () => {
  it('pushes the victim one further along the line and charges 1 AP', async () => {
    const { deps } = happyDeps();
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({ ok: true, kind: 'shoved', data: { x: 4, y: 2, layerId: 1 } });
    // both sides of the invariant, via the shared helper
    expect(deps.utils.setPlayerToTile).toHaveBeenCalledWith(2, 1, 4, 2);
    expect(deps.models.Players.update).toHaveBeenCalledWith(
      { Action_Points: 4 }, { where: { Player_ID: 1, Game_ID: 1 } },
    );
  });

  it('shoves a victim up a layer onto the same coordinates', async () => {
    const { deps } = happyDeps({
      layers: (where) => (where.Layer_ID === 2 && where.X_Position === 3 && where.Y_Position === 2
        ? createFakeTile({ Tile_ID: 20, Layer_ID: 2, X_Position: 3, Y_Position: 2 }) : null),
    });
    const result = await logic.run({ ...INPUT, direction: 'up' }, deps);
    expect(result).toMatchObject({ ok: true, data: { layerId: 2, x: 3, y: 2 } });
    expect(deps.utils.setPlayerToTile).toHaveBeenCalledWith(2, 2, 3, 2);
  });

  it('a Cloudborn can be shoved onto terrain nobody else can stand on', async () => {
    const { deps } = happyDeps({
      targetClassName: 'Cloudborn',
      behind: createFakeTile({ Tile_ID: 12, Layer_ID: 1, X_Position: 4, Y_Position: 2, Tile_Type: 'Wall' }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result.ok).toBe(true);
  });
});

describe('shove.run rejections', () => {
  const rejects = async (over, input = {}) => {
    const { deps } = happyDeps(over);
    const result = await logic.run({ ...INPUT, ...input }, deps);
    return { result, deps };
  };

  it('rejects a non-Bully', async () => {
    const { result, deps } = await rejects({
      player: createFakePlayer({ Player_ID: 1, Discord_ID: BULLY, Class_ID: 1, Action_Points: 5, Tile_ID: 10 }),
    });
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.WRONG_CLASS });
    expect(deps.utils.setPlayerToTile).not.toHaveBeenCalled();
  });

  it('rejects a dead Bully', async () => {
    const { result } = await rejects({
      player: createFakePlayer({ Player_ID: 1, Discord_ID: BULLY, Class_ID: 40, Action_Points: 5, Tile_ID: 10, Dead: true }),
    });
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.PLAYER_DEAD });
  });

  it('rejects shoving yourself', async () => {
    const { result } = await rejects({}, { targetDiscordId: BULLY });
    expect(result.ok).toBe(false);
  });

  it('rejects a victim who is not adjacent', async () => {
    const { result, deps } = await rejects({
      target: createFakePlayer({ Player_ID: 2, Discord_ID: VICTIM, Class_ID: 1, Tile_ID: 99 }),
    });
    expect(result.ok).toBe(false);
    expect(deps.utils.setPlayerToTile).not.toHaveBeenCalled();
  });

  it('rejects a Bully with no AP', async () => {
    const { result } = await rejects({
      player: createFakePlayer({ Player_ID: 1, Discord_ID: BULLY, Class_ID: 40, Action_Points: 0, Tile_ID: 10 }),
    });
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.NOT_ENOUGH_AP });
  });

  it('rejects a shove off the edge of the board', async () => {
    const { result, deps } = await rejects({ layers: () => null });
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.NO_SUCH_TILE });
    expect(deps.utils.setPlayerToTile).not.toHaveBeenCalled();
  });

  it('rejects a shove onto a wall', async () => {
    const { result, deps } = await rejects({
      behind: createFakeTile({ Tile_ID: 12, Layer_ID: 1, X_Position: 4, Y_Position: 2, Tile_Type: 'Wall' }),
    });
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.WRONG_TILE_TYPE });
    expect(deps.utils.setPlayerToTile).not.toHaveBeenCalled();
  });

  it('rejects shoving down when there is no layer below', async () => {
    const { result } = await rejects({}, { direction: 'down' });
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.NO_SUCH_LAYER });
  });

  it('is blocked by a timestop, but not for a Clockwatcher', async () => {
    const stopped = { game: createFakeGame({ Game_ID: 1, GAME_STATE: GAMESTATES.TIMESTOPPED }) };
    const { result } = await rejects(stopped);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.TIME_STOPPED });
  });
});

describe('shove command surface', () => {
  it('declares target, direction and an optional game', () => {
    const json = shove.data.toJSON();
    expect(json.name).toBe('shove');
    expect(json.options.map((o) => o.name)).toEqual(['target', 'direction', 'game']);
    const direction = json.options.find((o) => o.name === 'direction');
    expect(direction.choices.map((c) => c.value)).toEqual(['back', 'up', 'down']);
  });
});
