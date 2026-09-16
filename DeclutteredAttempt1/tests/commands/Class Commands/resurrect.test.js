/**
 * /resurrect - logic tests. Plain data in, plain data out: no jest.mock, no
 * discord.js, no interaction. deps carries fake models; utils logic is real.
 */
const logic = require('../../../commands/Class Commands/resurrect.logic.js');
const resurrect = require('../../../commands/Class Commands/resurrect.js');
const { GAMESTATES, REJECTIONS } = require('../../../enums.js');
const {
  createActorDeps,
  createFakeGame,
  createFakePlayer,
  createFakeClass,
  createFakeTile,
  createFakeLayer,
  expectNoWrites,
} = require('../../helpers/mockModels.js');

const CASTER = '123';
const TARGET = '456';

const CASTER_TILE_ID = 1;
const TARGET_TILE_ID = 5;
const INPUTTED_TILE_ID = 7;
const CASTER_LAYER = 11;
const OTHER_LAYER = 22;

/** deps for the happy path; override per test */
function happyDeps(over = {}) {
  const caster = over.caster || createFakePlayer({
    Player_ID: 1, Class_ID: 1, Discord_ID: CASTER, Action_Points: 12, Tile_ID: CASTER_TILE_ID,
  });
  const target = over.target || createFakePlayer({
    Player_ID: 2, Class_ID: 1, Discord_ID: TARGET, Dead: 1, Tile_ID: TARGET_TILE_ID,
  });
  const game = over.game || createFakeGame({ Game_ID: 1, GAME_STATE: GAMESTATES.ACTIVE });
  const casterClass = over.casterClass || createFakeClass({ Class_Name: 'Necromancer' });
  const casterTile = 'casterTile' in over
    ? over.casterTile
    : createFakeTile({ Tile_ID: CASTER_TILE_ID, Layer_ID: CASTER_LAYER, X_Position: 1, Y_Position: 1 });
  const inputtedTile = 'inputtedTile' in over
    ? over.inputtedTile
    : createFakeTile({
      Tile_ID: INPUTTED_TILE_ID, Layer_ID: CASTER_LAYER, X_Position: 3, Y_Position: 4, Tile_Type: 'Blank1',
    });

  const deps = createActorDeps({
    game,
    playerClass: casterClass,
    tiles: {
      findOne: async ({ where }) => {
        // the caster's own tile is looked up by Tile_ID
        if (where.Tile_ID !== undefined) {
          return where.Tile_ID === CASTER_TILE_ID ? casterTile : null;
        }
        // the destination tile is looked up by layer + coordinates
        if (inputtedTile
          && where.Layer_ID === inputtedTile.Layer_ID
          && where.X_Position === inputtedTile.X_Position
          && where.Y_Position === inputtedTile.Y_Position) {
          return inputtedTile;
        }
        return null;
      },
    },
    models: {
      Players: {
        findOne: async ({ where }) => {
          if (where.Discord_ID === CASTER) return caster;
          if (where.Discord_ID === TARGET) return target;
          return null;
        },
      },
      Layers: {
        findAll: async () => [
          createFakeLayer({ Layer_ID: CASTER_LAYER }),
          createFakeLayer({ Layer_ID: OTHER_LAYER }),
        ],
      },
    },
  });
  return { deps, caster, target, game, casterTile, inputtedTile };
}

const INPUT = {
  targetDiscordId: TARGET,
  targetUsername: 'ghost',
  x: 3,
  y: 4,
  layer: null,
  gameId: 1,
  discordId: CASTER,
};


describe('resurrect.parse', () => {
  it('maps raw options and applies defaults', () => {
    const input = logic.parse(
      { player: TARGET, playerUsername: 'ghost', x: 3, y: 4, layer: null, game: null },
      { discordId: CASTER, username: 'snage' },
    );
    expect(input).toEqual({
      targetDiscordId: TARGET,
      targetUsername: 'ghost',
      x: 3,
      y: 4,
      layer: null,
      gameId: null,
      discordId: CASTER,
    });
  });

  it('keeps an explicit layer and game, and turns absent user fields into null', () => {
    const input = logic.parse({ x: 1, y: 2, layer: 2, game: 7 }, { discordId: CASTER, username: 'snage' });
    expect(input).toMatchObject({ layer: 2, gameId: 7, targetDiscordId: null, targetUsername: null });
  });
});

describe('resurrect.run rejections', () => {
  it('rejects an unknown game and writes nothing', async () => {
    const { deps } = happyDeps();
    deps.models.Games.findByPk = jest.fn(async () => null);
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.NO_SUCH_GAME });
    expectNoWrites(deps);
  });

  it('rejects a caster who is not in the game (the old code crashed here)', async () => {
    const { deps, target } = happyDeps();
    deps.models.Players.findOne = jest.fn(async ({ where }) => (where.Discord_ID === TARGET ? target : null));
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.NOT_IN_GAME });
    expectNoWrites(deps);
  });

  // The state -> verdict table belongs to utils.checkGameState, and
  // tests/utils.pure.test.js walks every state in the enum - including a
  // newly added one. What is this command's own is only that run() asks the
  // gate and returns its verdict without writing, so one state that passes,
  // one that blocks, and the timestop (whose answer depends on the
  // isClockwatcher argument this command passes) cover it here.
  it.each([
    [GAMESTATES.ACTIVE, null],
    [GAMESTATES.OVER, REJECTIONS.GAME_OVER],
    [GAMESTATES.TIMESTOPPED, REJECTIONS.TIME_STOPPED],
  ])('gamestate %s -> %s', async (state, reason) => {
    const { deps } = happyDeps({ game: createFakeGame({ Game_ID: 1, GAME_STATE: state }) });
    const result = await logic.run(INPUT, deps);
    if (reason === null) {
      expect(result.ok).toBe(true);
    } else {
      expect(result).toMatchObject({ ok: false, reason });
      expectNoWrites(deps);
    }
  });

  it('does not block a Clockwatcher during a timestop', async () => {
    const { deps } = happyDeps({
      game: createFakeGame({ Game_ID: 1, GAME_STATE: GAMESTATES.TIMESTOPPED }),
      casterClass: createFakeClass({ Class_Name: 'Clockwatcher' }),
    });
    const result = await logic.run(INPUT, deps);
    // the gate now consults the actor's class, so a timestop does not
    // stop a Clockwatcher
    expect(result.reason).not.toBe(REJECTIONS.TIME_STOPPED);
    expectNoWrites(deps);
  });

  it('rejects a caster who is not a Necromancer', async () => {
    const { deps } = happyDeps({ casterClass: createFakeClass({ Class_Name: 'Average' }) });
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.WRONG_CLASS });
    expect(logic.present(result).content).toBe('You are not a Necromancer!');
    expectNoWrites(deps);
  });

  it('rejects a tile that is not in the game', async () => {
    const { deps } = happyDeps();
    const result = await logic.run({ ...INPUT, x: 9, y: 9 }, deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.NO_SUCH_TILE });
    expect(logic.present(result).content).toBe('The tile provided is not in the game!');
    expectNoWrites(deps);
  });

  it('rejects when the caster has no tile row, so no layer can be resolved', async () => {
    const { deps } = happyDeps({ casterTile: null });
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.NO_SUCH_TILE });
    expectNoWrites(deps);
  });

  it('rejects a resurrectee who is not in the game', async () => {
    const { deps, caster } = happyDeps();
    deps.models.Players.findOne = jest.fn(async ({ where }) => (where.Discord_ID === CASTER ? caster : null));
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.TARGET_NOT_IN_GAME });
    expect(logic.present(result).content).toBe('The resurrectee is not in this game!');
    expectNoWrites(deps);
  });

  it('rejects a resurrectee who is alive (Dead === 0)', async () => {
    const { deps } = happyDeps({
      target: createFakePlayer({ Player_ID: 2, Discord_ID: TARGET, Dead: 0, Tile_ID: TARGET_TILE_ID }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.TARGET_NOT_DEAD });
    expect(logic.present(result).content).toBe('The resurrectee is not dead!');
    expectNoWrites(deps);
  });

  it('rejects one AP short of the 12 AP cost (boundary: one short)', async () => {
    const { deps } = happyDeps({
      caster: createFakePlayer({ Player_ID: 1, Discord_ID: CASTER, Action_Points: 11, Tile_ID: CASTER_TILE_ID }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.NOT_ENOUGH_AP });
    expect(logic.present(result).content).toBe('You dont have enough AP to resurrect!');
    expectNoWrites(deps);
  });

  it('accepts exactly 12 AP (boundary: exact)', async () => {
    const { deps } = happyDeps();
    const result = await logic.run(INPUT, deps);
    expect(result.ok).toBe(true);
    expect(deps.models.Players.update).toHaveBeenCalledWith(
      { Action_Points: 0 }, { where: { Player_ID: 1 } },
    );
  });

  it.each(['Void', 'Wall', 'Ice'])('rejects resurrecting onto a %s tile', async (tileType) => {
    const { deps } = happyDeps({
      inputtedTile: createFakeTile({
        Tile_ID: INPUTTED_TILE_ID, Layer_ID: CASTER_LAYER, X_Position: 3, Y_Position: 4, Tile_Type: tileType,
      }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.WRONG_TILE_TYPE });
    expect(logic.present(result).content).toBe('You cannot resurrect to that tile!');
    expectNoWrites(deps);
  });

  it.each(['Player1', 'Player2', 'Player3', 'Player4'])('rejects a tile occupied via %s', async (slot) => {
    const { deps } = happyDeps({
      inputtedTile: createFakeTile({
        Tile_ID: INPUTTED_TILE_ID, Layer_ID: CASTER_LAYER, X_Position: 3, Y_Position: 4, [slot]: 99,
      }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.TILE_OCCUPIED });
    expect(logic.present(result).content).toBe('You cannot resurrect to that tile!');
    expectNoWrites(deps);
  });
});

describe('resurrect.run success', () => {
  it('revives the target and charges the caster with exact write payloads', async () => {
    const { deps } = happyDeps();
    const result = await logic.run(INPUT, deps);

    expect(result).toMatchObject({
      ok: true,
      kind: 'resurrected',
      data: { targetUsername: 'ghost', targetPlayerId: 2, x: 3, y: 4, layerId: CASTER_LAYER },
    });
    // Dead and the position are written together - a player who is alive but
    // has no tile is the state this command used to leave behind
    expect(deps.models.Players.update).toHaveBeenCalledWith(
      { Tile_ID: INPUTTED_TILE_ID, Dead: 0 }, { where: { Player_ID: 2 } },
    );
    expect(deps.models.Players.update).toHaveBeenCalledWith(
      { Action_Points: 0 }, { where: { Player_ID: 1 } },
    );
    expect(deps.models.Players.update).toHaveBeenCalledTimes(2);
    expect(deps.models.Tiles.update).toHaveBeenCalledTimes(1);
  });

  // was: "preserved quirk: the tile write claims a slot on the RESURRECTEE'S
  // OLD tile ... so the body comes back exactly where it died". It did not.
  // A dead player's Tile_ID is null, so `where: { Tile_ID: null }` matched no
  // row and the resurrectee came back alive and off the board. The old test
  // only looked right because its fixture gave the dead target a non-null
  // Tile_ID, which is a state the game never produces.
  it('claims a slot on the tile the caster asked for, and points the row back at it', async () => {
    const { deps } = happyDeps();
    await logic.run(INPUT, deps);

    expect(deps.models.Tiles.update).toHaveBeenCalledWith(
      { Player1: 2 }, { where: { Tile_ID: INPUTTED_TILE_ID } },
    );
    expect(deps.models.Tiles.update).not.toHaveBeenCalledWith(
      expect.anything(), { where: { Tile_ID: TARGET_TILE_ID } },
    );
  });

  // the invariant, stated as one assertion: whatever a resurrect writes, it
  // never leaves the two columns disagreeing
  it('never writes Dead: 0 without also writing a tile', async () => {
    const { deps } = happyDeps({
      // a realistic corpse: playerDeathLogic nulls the tile when it sets Dead
      target: createFakePlayer({ Player_ID: 2, Discord_ID: TARGET, Dead: 1, Tile_ID: null }),
    });
    await logic.run(INPUT, deps);

    const offenders = deps.models.Players.update.mock.calls
      .filter(([payload]) => Object.prototype.hasOwnProperty.call(payload, 'Dead'))
      .filter(([payload]) => payload.Dead === 0 && payload.Tile_ID == null)
      .map(([payload]) => JSON.stringify(payload));
    expect(offenders).toEqual([]);
  });

  it('maps an explicit common layer number to the games Layer_ID (this path used to throw TypeError)', async () => {
    const { deps } = happyDeps({
      inputtedTile: createFakeTile({
        Tile_ID: INPUTTED_TILE_ID, Layer_ID: OTHER_LAYER, X_Position: 3, Y_Position: 4,
      }),
    });
    const result = await logic.run({ ...INPUT, layer: 2 }, deps);
    expect(result.ok).toBe(true);
    expect(result.data.layerId).toBe(OTHER_LAYER);
  });

  // preserved quirk: the old `?? playersTile.Layer_ID` meant an unknown layer
  // number silently resolved to the caster's own layer instead of rejecting
  it('falls back to the casters layer when the layer number is out of range', async () => {
    const { deps } = happyDeps();
    const result = await logic.run({ ...INPUT, layer: 3 }, deps);
    expect(result.ok).toBe(true);
    expect(result.data.layerId).toBe(CASTER_LAYER);
  });

  // preserved quirk: nothing checks the caster's own Dead flag
  it('lets a dead Necromancer resurrect', async () => {
    const { deps } = happyDeps({
      caster: createFakePlayer({
        Player_ID: 1, Discord_ID: CASTER, Action_Points: 12, Tile_ID: CASTER_TILE_ID, Dead: 1,
      }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result.ok).toBe(true);
  });

  it('resolves the default game via getOldestGameId when no game is given', async () => {
    const { deps } = happyDeps();
    deps.utils = { ...deps.utils, getOldestGameId: jest.fn(async () => 1) };
    const result = await logic.run({ ...INPUT, gameId: null }, deps);
    expect(result.ok).toBe(true);
    expect(deps.utils.getOldestGameId).toHaveBeenCalledWith(CASTER);
  });
});

describe('resurrect.present', () => {
  it('renders success with the resurrectees username', () => {
    const out = logic.present({ ok: true, kind: 'resurrected', data: { targetUsername: 'ghost' } });
    expect(out).toEqual({ content: 'You have resurrected ghost to the tile provided!' });
  });
});

describe('resurrect adapter (smoke)', () => {
  it('exports the command contract', () => {
    expect(resurrect.data.toJSON().name).toBe('resurrect');
    expect(typeof resurrect.execute).toBe('function');
  });
});
