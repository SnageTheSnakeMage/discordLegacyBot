/**
 * /exorcise - logic tests. Plain data in, plain data out: no jest.mock, no
 * discord.js, no interaction. deps carries fake models; utils logic is real
 * except the two DB-writing helpers (revertTileToBlank, classRemoval),
 * which are injected as jest.fns through deps.utils.
 */
const logic = require('../../../commands/Class Commands/exorcise.logic.js');
const exorcise = require('../../../commands/Class Commands/exorcise.js');
const { GAMESTATES, REJECTIONS } = require('../../../enums.js');
const {
  createDeps, createFakeGame, createFakePlayer, createFakeClass, createFakeTile,
} = require('../../helpers/mockModels.js');

const EXORCIST = '123';
const TARGET = '456';

/**
 * deps for the happy path; override per test. The exorcist stands on (1,1)
 * with Range_ 3, and the default tile to change is a Fire tile at (2,1)
 * (line length 2 <= 3, in range).
 */
function happyDeps(over = {}) {
  const player = over.player || createFakePlayer({ Player_ID: 1, Discord_ID: EXORCIST, Action_Points: 5, Range_: 3, Tile_ID: 1 });
  const target = over.target || null;
  const game = over.game || createFakeGame({ Game_ID: 1, GAME_STATE: GAMESTATES.ACTIVE });
  const playerTile = over.playerTile || createFakeTile({ Tile_ID: 1, X_Position: 1, Y_Position: 1, Layer_ID: 1 });
  const tileToChange = 'tileToChange' in over
    ? over.tileToChange
    : createFakeTile({ Tile_ID: 5, X_Position: 2, Y_Position: 1, Layer_ID: 1, Tile_Type: 'Fire' });
  const deps = createDeps({
    models: {
      Games: { findByPk: async () => game },
      Players: {
        findOne: async ({ where }) => (where.Discord_ID === EXORCIST ? player : where.Discord_ID === TARGET ? target : null),
      },
      Classes: { findByPk: async () => over.playerClass || createFakeClass({ Class_Name: 'Exorcist' }) },
      Tiles: {
        findByPk: async () => playerTile,
        findOne: async () => tileToChange,
      },
    },
    utils: {
      revertTileToBlank: jest.fn(async () => {}),
      classRemoval: jest.fn(async () => {}),
    },
  });
  return { deps, player, target, game, tileToChange };
}

/** tile mode: no target */
const INPUT = { x: 2, y: 1, targetDiscordId: null, targetUsername: null, gameId: 1, discordId: EXORCIST };
/** class-removal mode: target provided */
const CLASS_INPUT = { ...INPUT, targetDiscordId: TARGET, targetUsername: 'victim' };

function classModeDeps(over = {}) {
  return happyDeps({
    player: createFakePlayer({ Player_ID: 1, Discord_ID: EXORCIST, Action_Points: 16, Range_: 3, Tile_ID: 1 }),
    target: createFakePlayer({ Player_ID: 2, Discord_ID: TARGET, Action_Points: 7, Tile_ID: 2 }),
    ...over,
  });
}

function expectNoWrites(deps) {
  expect(deps.models.Players.update).not.toHaveBeenCalled();
  expect(deps.models.Tiles.update).not.toHaveBeenCalled();
  expect(deps.utils.revertTileToBlank).not.toHaveBeenCalled();
  expect(deps.utils.classRemoval).not.toHaveBeenCalled();
}

describe('exorcise.parse', () => {
  it('maps raw options and turns an absent target into nulls', () => {
    const input = logic.parse({ x: 2, y: 1, player: null, playerUsername: null, game: null }, { discordId: EXORCIST, username: 'snage' });
    expect(input).toEqual({ x: 2, y: 1, targetDiscordId: null, targetUsername: null, gameId: null, discordId: EXORCIST });
  });

  it('carries the target id and username when given', () => {
    const input = logic.parse({ x: 4, y: 7, player: TARGET, playerUsername: 'victim', game: 3 }, { discordId: EXORCIST, username: 'snage' });
    expect(input).toEqual({ x: 4, y: 7, targetDiscordId: TARGET, targetUsername: 'victim', gameId: 3, discordId: EXORCIST });
  });
});

describe('exorcise.run rejections', () => {
  it('rejects an unknown game and writes nothing', async () => {
    const { deps } = happyDeps();
    deps.models.Games.findByPk = jest.fn(async () => null);
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.NO_SUCH_GAME });
    expectNoWrites(deps);
  });

  it('rejects an exorcist who is not in the game', async () => {
    const { deps } = happyDeps();
    deps.models.Players.findOne = jest.fn(async () => null);
    const result = await logic.run(INPUT, deps);
    expect(result.reason).toBe(REJECTIONS.NOT_IN_GAME);
    expectNoWrites(deps);
  });

  // the gamestate table: every state has a defined outcome; adding a state
  // without deciding its gate breaks this test. The old code hard-coded
  // isClockwatcher=false, so TIMESTOPPED blocks everyone.
  it.each([
    [GAMESTATES.ACTIVE, null],
    [GAMESTATES.REGISTRATION, null],
    [GAMESTATES.INACTIVE, null],
    [GAMESTATES.SANDBOX, null],
    [GAMESTATES.FINALE, null],
    [GAMESTATES.OVER, REJECTIONS.GAME_OVER],
    [GAMESTATES.DEV_PAUSED, REJECTIONS.GAME_PAUSED],
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

  it('rejects when no tile exists at the coordinates', async () => {
    const { deps } = happyDeps({ tileToChange: null });
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.NO_SUCH_TILE, data: { action: 'exorcise' } });
    expectNoWrites(deps);
  });

  it('rejects a non-Exorcist', async () => {
    const { deps } = happyDeps({ playerClass: createFakeClass({ Class_Name: 'Gravedigger' }) });
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.WRONG_CLASS, data: { className: 'Exorcist' } });
    expectNoWrites(deps);
  });

  it.each(['Gateway_Open', 'Gateway_Locked'])('rejects a %s tile in tile mode', async (tileType) => {
    const { deps } = happyDeps({
      tileToChange: createFakeTile({ Tile_ID: 5, X_Position: 2, Y_Position: 1, Layer_ID: 1, Tile_Type: tileType }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.WRONG_TILE_TYPE });
    expectNoWrites(deps);
  });

  // quirk: the gateway check requires !targetPlayer, so class removal works
  // even when the inputted coordinates hold a gateway tile
  it('skips the gateway check when a target player is resolved', async () => {
    const { deps } = classModeDeps({
      tileToChange: createFakeTile({ Tile_ID: 5, X_Position: 2, Y_Position: 1, Layer_ID: 1, Tile_Type: 'Gateway_Open' }),
    });
    const result = await logic.run(CLASS_INPUT, deps);
    expect(result).toMatchObject({ ok: true, kind: 'class_removed' });
  });

  it('rejects a tile one beyond max range (boundary: one over)', async () => {
    const { deps } = happyDeps({
      tileToChange: createFakeTile({ Tile_ID: 6, X_Position: 4, Y_Position: 1, Layer_ID: 1, Tile_Type: 'Fire' }),
    });
    const result = await logic.run({ ...INPUT, x: 4 }, deps);
    expect(result.reason).toBe(REJECTIONS.OUT_OF_RANGE);
    expectNoWrites(deps);
  });

  it('accepts a tile at exactly max range (boundary: exact)', async () => {
    const { deps } = happyDeps({
      tileToChange: createFakeTile({ Tile_ID: 6, X_Position: 3, Y_Position: 1, Layer_ID: 1, Tile_Type: 'Fire' }),
    });
    const result = await logic.run({ ...INPUT, x: 3 }, deps);
    expect(result.ok).toBe(true);
  });

  // quirk: range is always measured to the inputted tile coordinates, even
  // in class-removal mode - the target's own position never matters
  it('rejects class removal when the inputted tile is out of range, wherever the target stands', async () => {
    const { deps } = classModeDeps({
      tileToChange: createFakeTile({ Tile_ID: 6, X_Position: 4, Y_Position: 1, Layer_ID: 1, Tile_Type: 'Fire' }),
    });
    const result = await logic.run({ ...CLASS_INPUT, x: 4 }, deps);
    expect(result.reason).toBe(REJECTIONS.OUT_OF_RANGE);
    expectNoWrites(deps);
  });

  it('rejects tile mode below 3 AP (boundary: one short)', async () => {
    const { deps } = happyDeps({
      player: createFakePlayer({ Player_ID: 1, Discord_ID: EXORCIST, Action_Points: 2, Range_: 3, Tile_ID: 1 }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result.reason).toBe(REJECTIONS.NOT_ENOUGH_AP);
    expectNoWrites(deps);
  });

  // quirk: tile mode gates on 3 AP but deducts 4, so exactly 3 AP passes
  // the gate and leaves the exorcist on -1
  it('accepts tile mode at exactly 3 AP and deducts 4 (boundary: exact, pins the 3-gate/4-cost quirk)', async () => {
    const { deps } = happyDeps({
      player: createFakePlayer({ Player_ID: 1, Discord_ID: EXORCIST, Action_Points: 3, Range_: 3, Tile_ID: 1 }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result.ok).toBe(true);
    expect(deps.models.Players.update).toHaveBeenCalledWith(
      { Action_Points: -1 },
      { where: { Player_ID: 1 } },
    );
  });

  it('rejects class removal below 16 AP (boundary: one short)', async () => {
    const { deps } = classModeDeps({
      player: createFakePlayer({ Player_ID: 1, Discord_ID: EXORCIST, Action_Points: 15, Range_: 3, Tile_ID: 1 }),
    });
    const result = await logic.run(CLASS_INPUT, deps);
    expect(result.reason).toBe(REJECTIONS.NOT_ENOUGH_AP);
    expectNoWrites(deps);
  });

  it('accepts class removal at exactly 16 AP (boundary: exact)', async () => {
    const { deps } = classModeDeps();
    const result = await logic.run(CLASS_INPUT, deps);
    expect(result.ok).toBe(true);
  });
});

describe('exorcise.run success', () => {
  it('tile mode blanks the tile with exact write payloads and reports the pre-revert type', async () => {
    const { deps, tileToChange } = happyDeps();
    const result = await logic.run(INPUT, deps);
    expect(result).toEqual({
      ok: true,
      kind: 'tile_exorcised',
      data: { x: 2, y: 1, previousTileType: 'Fire', layerId: 1 },
    });
    expect(deps.models.Players.update).toHaveBeenCalledWith(
      { Action_Points: 1 }, // 5 - 4
      { where: { Player_ID: 1 } },
    );
    expect(deps.models.Players.update).toHaveBeenCalledTimes(1);
    expect(deps.utils.revertTileToBlank).toHaveBeenCalledWith(tileToChange);
    expect(deps.utils.classRemoval).not.toHaveBeenCalled();
  });

  // quirk: the 16 AP are deducted from the TARGET, not the exorcist
  it('class mode charges the TARGET 16 AP and removes their class', async () => {
    const { deps, player, target } = classModeDeps();
    const result = await logic.run(CLASS_INPUT, deps);
    expect(result).toEqual({ ok: true, kind: 'class_removed', data: { targetUsername: 'victim' } });
    expect(deps.models.Players.update).toHaveBeenCalledWith(
      { Action_Points: -9 }, // target: 7 - 16; the exorcist's 16 AP are untouched
      { where: { Player_ID: 2 } },
    );
    expect(deps.models.Players.update).toHaveBeenCalledTimes(1);
    expect(deps.utils.classRemoval).toHaveBeenCalledWith(target, player);
    expect(deps.utils.revertTileToBlank).not.toHaveBeenCalled();
  });

  // quirk: a targeted user who is not in the game resolves to no target
  // player, so the command silently runs tile mode instead
  it('falls back to tile mode when the targeted user is not in the game', async () => {
    const { deps } = happyDeps(); // no target row; target lookup returns null
    const result = await logic.run({ ...INPUT, targetDiscordId: '999', targetUsername: 'stranger' }, deps);
    expect(result).toMatchObject({ ok: true, kind: 'tile_exorcised' });
    expect(deps.models.Players.update).toHaveBeenCalledWith(
      { Action_Points: 1 },
      { where: { Player_ID: 1 } },
    );
    expect(deps.utils.revertTileToBlank).toHaveBeenCalled();
    expect(deps.utils.classRemoval).not.toHaveBeenCalled();
  });

  it('resolves the default game via getOldestGameId when no game is given', async () => {
    const { deps } = happyDeps();
    deps.utils = { ...deps.utils, getOldestGameId: jest.fn(async () => 1) };
    const result = await logic.run({ ...INPUT, gameId: null }, deps);
    expect(result.ok).toBe(true);
    expect(deps.utils.getOldestGameId).toHaveBeenCalledWith(EXORCIST);
  });
});

describe('exorcise.present', () => {
  // every rejection renders its exact legacy wording
  it.each([
    [REJECTIONS.NO_SUCH_TILE, { action: 'exorcise' }, 'Could not find tile to exorcise at the given coordinates.'],
    [REJECTIONS.WRONG_CLASS, { className: 'Exorcist' }, 'You are not a Exorcist!'],
    [REJECTIONS.WRONG_TILE_TYPE, { message: 'You cannot exorcise a gateway tile!' }, 'You cannot exorcise a gateway tile!'],
    [REJECTIONS.OUT_OF_RANGE, { message: 'You are not in range of the tile or player you want to exorcise!' }, 'You are not in range of the tile or player you want to exorcise!'],
    [REJECTIONS.NOT_ENOUGH_AP, { action: 'dig a tile' }, 'You dont have enough AP to dig a tile!'],
    [REJECTIONS.NOT_ENOUGH_AP, { action: 'remove a class' }, 'You dont have enough AP to remove a class!'],
    [REJECTIONS.TIME_STOPPED, undefined, 'Time is stopped! only Clockwatchers can use commands at this time.'],
  ])('renders %s as its player-facing message', (reason, data, expected) => {
    expect(logic.present({ ok: false, reason, data })).toEqual({ content: expected });
  });

  it('renders tile-mode success with the pre-revert tile type', () => {
    const out = logic.present({ ok: true, kind: 'tile_exorcised', data: { x: 2, y: 1, previousTileType: 'Fire', layerId: 1 } });
    expect(out).toEqual({ content: 'You have made a Fire tile on coordinates (2, 1) on layer 1!' });
  });

  it('renders class-removal success with the target username', () => {
    const out = logic.present({ ok: true, kind: 'class_removed', data: { targetUsername: 'victim' } });
    expect(out).toEqual({ content: 'You have exorcised victim and removed their class!' });
  });
});

describe('exorcise adapter (smoke)', () => {
  it('exports the command contract', () => {
    expect(exorcise.data.toJSON().name).toBe('exorcise');
    expect(typeof exorcise.execute).toBe('function');
  });
});
