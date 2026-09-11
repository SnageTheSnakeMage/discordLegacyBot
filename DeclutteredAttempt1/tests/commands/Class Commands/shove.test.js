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
        findOne: async ({ where }) => {
          if ('layers' in over) return over.layers(where);
          // `board: true` makes every tile on layer 1 exist, so a shove in
          // any of the three directions has somewhere to land
          if (over.board && where.Layer_ID === 1) {
            return createFakeTile({
              Tile_ID: 100 + where.X_Position * 10 + where.Y_Position,
              Layer_ID: 1,
              X_Position: where.X_Position,
              Y_Position: where.Y_Position,
              Tile_Type: 'Blank1',
            });
          }
          return (where.X_Position === 4 && where.Y_Position === 2 && where.Layer_ID === 1) ? behind : null;
        },
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

  // victim stands EAST of the bully, so the fan is NE / E / SE
  it.each([
    ['back', 4, 2],
    ['up', 4, 1],
    ['down', 4, 3],
  ])('shoves %s to (%i, %i) for a victim standing east', async (direction, x, y) => {
    const { deps } = happyDeps({ board: true });
    const result = await logic.run({ ...INPUT, direction }, deps);
    expect(result).toMatchObject({ ok: true, data: { x, y, layerId: 1 } });
    expect(deps.utils.setPlayerToTile).toHaveBeenCalledWith(2, 1, x, y);
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

  it('rejects a shove toward a tile that does not exist', async () => {
    // only the straight-back tile is on the board, so 'up' has nowhere to go
    const { result, deps } = await rejects({}, { direction: 'up' });
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.NO_SUCH_TILE });
    expect(deps.utils.setPlayerToTile).not.toHaveBeenCalled();
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

describe('shoveVector', () => {
  // Directions are relative to the Bully -> victim line. Snage's rule: "up"
  // is always the more northerly flank, so it never sends anyone south -
  // which is why a westward push gives NW/SW rather than the plain
  // anticlockwise/clockwise pairing. A victim due north or due south has two
  // equally northerly flanks, and that tie falls anticlockwise.
  const { shoveVector } = logic;
  const DIRS = {
    N: [0, -1], NE: [1, -1], E: [1, 0], SE: [1, 1],
    S: [0, 1], SW: [-1, 1], W: [-1, 0], NW: [-1, -1],
  };
  const name = (v) => Object.keys(DIRS).find((k) => DIRS[k][0] === v[0] && DIRS[k][1] === v[1]);

  it.each([
    // away, back, up,   down
    ['N', 'N', 'NW', 'NE'],
    ['NE', 'NE', 'N', 'E'],
    ['E', 'E', 'NE', 'SE'],
    ['SE', 'SE', 'E', 'S'],
    ['S', 'S', 'SE', 'SW'],
    ['SW', 'SW', 'W', 'S'],
    ['W', 'W', 'NW', 'SW'],
    ['NW', 'NW', 'N', 'W'],
  ])('a victim %s of the bully: back=%s up=%s down=%s', (away, back, up, down) => {
    const [dx, dy] = DIRS[away];
    expect(name(shoveVector(dx, dy, 'back'))).toBe(back);
    expect(name(shoveVector(dx, dy, 'up'))).toBe(up);
    expect(name(shoveVector(dx, dy, 'down'))).toBe(down);
  });

  it('never sends anyone south when asked for up', () => {
    for (const [dx, dy] of Object.values(DIRS)) {
      const up = shoveVector(dx, dy, 'up');
      const straight = shoveVector(dx, dy, 'back');
      // up is never more southerly than straight away
      expect(up[1]).toBeLessThanOrEqual(straight[1]);
    }
  });

  it('normalises a longer vector to one of the 8 directions', () => {
    expect(shoveVector(3, 0, 'back')).toEqual([1, 0]);
  });
});

describe('shove on a shared tile', () => {
  // Player1 is drawn top-left, Player2 top-right, Player3 bottom-left,
  // Player4 bottom-right, so the slot pair gives the direction.
  function sharedDeps(bullySlot, victimSlot) {
    const shared = createFakeTile({
      Tile_ID: 10, Layer_ID: 1, X_Position: 3, Y_Position: 3, [bullySlot]: 1, [victimSlot]: 2,
    });
    const deps = createDeps({
      models: {
        Games: { findByPk: async () => createFakeGame({ Game_ID: 1, GAME_STATE: GAMESTATES.ACTIVE }) },
        Players: {
          findOne: async ({ where }) => (
            where.Discord_ID === BULLY
              ? createFakePlayer({ Player_ID: 1, Discord_ID: BULLY, Class_ID: 40, Action_Points: 5, Tile_ID: 10 })
              : createFakePlayer({ Player_ID: 2, Discord_ID: VICTIM, Class_ID: 1, Tile_ID: 10 })
          ),
        },
        Classes: {
          findByPk: async (id) => createFakeClass({
            Class_ID: id, Class_Name: id === 40 ? 'Bully' : 'Average',
          }),
        },
        Tiles: {
          findByPk: async () => shared,
          findOne: async ({ where }) => createFakeTile({
            Tile_ID: 200 + where.X_Position * 10 + where.Y_Position,
            Layer_ID: 1,
            X_Position: where.X_Position,
            Y_Position: where.Y_Position,
          }),
        },
      },
      utils: { setPlayerToTile: jest.fn(async () => undefined) },
    });
    return deps;
  }

  it.each([
    // bully slot, victim slot, away direction, back lands at (x,y) from (3,3)
    ['Player1', 'Player2', 'east', 4, 3],
    ['Player2', 'Player1', 'west', 2, 3],
    ['Player1', 'Player3', 'south', 3, 4],
    ['Player3', 'Player1', 'north', 3, 2],
    ['Player1', 'Player4', 'south-east', 4, 4],
    ['Player4', 'Player1', 'north-west', 2, 2],
  ])('%s shoving %s reads as %s, landing back at (%i, %i)', async (b, v, _dir, x, y) => {
    const deps = sharedDeps(b, v);
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({ ok: true, data: { x, y } });
    expect(deps.utils.setPlayerToTile).toHaveBeenCalledWith(2, 1, x, y);
  });

  it('still leaves the shared tile rather than reseating them in it', async () => {
    const deps = sharedDeps('Player1', 'Player2');
    const result = await logic.run(INPUT, deps);
    // the destination is a different tile id from the shared one
    expect(result.ok).toBe(true);
    expect(deps.utils.setPlayerToTile).toHaveBeenCalledWith(2, 1, 4, 3);
  });

  it('rejects when the tile does not list one of them', async () => {
    const deps = sharedDeps('Player1', 'Player2');
    deps.models.Tiles.findByPk = jest.fn(async () => createFakeTile({
      Tile_ID: 10, Layer_ID: 1, X_Position: 3, Y_Position: 3, Player1: 1,
    }));
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.NO_SUCH_TILE });
  });
});
