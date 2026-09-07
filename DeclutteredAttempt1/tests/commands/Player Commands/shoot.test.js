/**
 * /shoot - logic tests. Plain data in, plain data out: no jest.mock, no
 * discord.js, no interaction. deps carries fake models; utils logic
 * (getTileCordinatesOfLine, checkGameState) is real, while the DB-touching
 * helpers playerDeathLogic and revertTileToBlank are injected fakes.
 */
const logic = require('../../../commands/Player Commands/shoot.logic.js');
const shoot = require('../../../commands/Player Commands/shoot.js');
const { GAMESTATES, REJECTIONS } = require('../../../enums.js');
const {
  createDeps, createFakeGame, createFakePlayer, createFakeClass, createFakeTile,
} = require('../../helpers/mockModels.js');

const SHOOTER = '123';
const TARGET = '456';

/** random() that returns the given values in order (cycling). */
function seededRandom(...vals) {
  let i = 0;
  return jest.fn(() => vals[i++ % vals.length]);
}

/**
 * Happy-path board: shooter on (1,1), target on (3,1), same layer, straight
 * east line, shootCost 2. Override per test.
 */
function happyDeps(over = {}) {
  const game = over.game || createFakeGame({ Game_ID: 1, GAME_STATE: GAMESTATES.ACTIVE, shootCost: 2 });
  const shooter = over.shooter || createFakePlayer({
    Player_ID: 1, Discord_ID: SHOOTER, Game_ID: 1, Action_Points: 6, Range_: 3, Damage: 1, DMG_BUFF: 0, Tile_ID: 1,
  });
  const target = over.target || createFakePlayer({
    Player_ID: 2, Discord_ID: TARGET, Game_ID: 1, Health_Points: 10, Tile_ID: 3,
  });
  const tiles = over.tiles || [
    createFakeTile({ Tile_ID: 1, Layer_ID: 1, X_Position: 1, Y_Position: 1, Tile_Type: over.shooterTileType || 'Blank1' }),
    createFakeTile({ Tile_ID: 2, Layer_ID: 1, X_Position: 2, Y_Position: 1, Tile_Type: over.midTileType || 'Blank2' }),
    createFakeTile({ Tile_ID: 3, Layer_ID: 1, X_Position: 3, Y_Position: 1, Tile_Type: over.targetTileType || 'Blank1' }),
  ];
  const shooterClass = over.shooterClass || createFakeClass({ Class_Name: 'Average' });
  const deps = createDeps({
    models: {
      Games: { findByPk: async () => game },
      Players: {
        findOne: async ({ where }) => {
          if (where.Discord_ID === SHOOTER) return shooter;
          if (where.Discord_ID === TARGET) return target;
          return null;
        },
      },
      Classes: { findOne: async () => shooterClass },
      Tiles: {
        findByPk: async (id) => tiles.find((t) => t.Tile_ID === id) || null,
        findOne: async ({ where }) => tiles.find(
          (t) => t.Layer_ID === where.Layer_ID && t.X_Position === where.X_Position && t.Y_Position === where.Y_Position,
        ) || null,
      },
    },
    random: over.random,
    utils: {
      playerDeathLogic: jest.fn(async () => {}),
      revertTileToBlank: jest.fn(async () => {}),
    },
  });
  return { deps, game, shooter, target, tiles };
}

const INPUT = { x: 3, y: 1, targetDiscordId: TARGET, amount: 1, gameId: 1, body: 1, discordId: SHOOTER };

function expectNoWrites(deps) {
  expect(deps.models.Players.update).not.toHaveBeenCalled();
  expect(deps.models.Tiles.update).not.toHaveBeenCalled();
  expect(deps.utils.playerDeathLogic).not.toHaveBeenCalled();
  expect(deps.utils.revertTileToBlank).not.toHaveBeenCalled();
}

describe('shoot.parse', () => {
  it('maps raw options and applies defaults', () => {
    const input = logic.parse(
      { x: 3, y: 1, target: TARGET, amount: null, game: null, body: null },
      { discordId: SHOOTER, username: 'snage' },
    );
    expect(input).toEqual({ x: 3, y: 1, targetDiscordId: TARGET, amount: 1, gameId: null, body: 1, discordId: SHOOTER });
  });

  it('coerces body to 1 unless it is exactly 2, and keeps explicit values', () => {
    expect(logic.parse({ x: 1, y: 1, target: TARGET, amount: 4, game: 2, body: 2 }, { discordId: SHOOTER }))
      .toEqual({ x: 1, y: 1, targetDiscordId: TARGET, amount: 4, gameId: 2, body: 2, discordId: SHOOTER });
    expect(logic.parse({ x: 1, y: 1, target: TARGET, amount: 4, game: 2, body: 3 }, { discordId: SHOOTER }).body).toBe(1);
  });
});

describe('shoot.run rejections', () => {
  it('rejects an unknown game and writes nothing (old code crashed on game.shootCost)', async () => {
    const { deps } = happyDeps();
    deps.models.Games.findByPk = jest.fn(async () => null);
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.NO_SUCH_GAME });
    expectNoWrites(deps);
  });

  it('rejects a shooter who is not in the game (old code crashed on player.Class_ID)', async () => {
    const { deps, target } = happyDeps();
    deps.models.Players.findOne = jest.fn(async ({ where }) => (where.Discord_ID === TARGET ? target : null));
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.NOT_IN_GAME });
    expectNoWrites(deps);
  });

  it('rejects a shooter whose tile does not exist, with the legacy off-board wording (old code crashed on shootersTile.Layer_ID)', async () => {
    const { deps } = happyDeps({
      shooter: createFakePlayer({ Player_ID: 1, Discord_ID: SHOOTER, Game_ID: 1, Action_Points: 6, Range_: 3, Tile_ID: 99 }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({
      ok: false,
      reason: REJECTIONS.NOT_IN_GAME,
      data: { message: 'You are not on the board! Are you registered in that game?' },
    });
    expectNoWrites(deps);
  });

  it('rejects a target tile that is not on the board (old code crashed on targetTile.X_Position)', async () => {
    const { deps } = happyDeps();
    const result = await logic.run({ ...INPUT, x: 9, y: 9 }, deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.NO_SUCH_TILE });
    expectNoWrites(deps);
  });

  // the gamestate table: every state has a defined outcome; adding a state
  // without deciding its gate breaks this test
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
    const { deps } = happyDeps({ game: createFakeGame({ Game_ID: 1, GAME_STATE: state, shootCost: 2 }) });
    const result = await logic.run(INPUT, deps);
    if (reason === null) {
      expect(result.ok).toBe(true);
    } else {
      expect(result).toMatchObject({ ok: false, reason });
      expectNoWrites(deps);
    }
  });

  // quirk pin: the old code hardcoded isClockwatcher=false, so unlike other
  // commands even a Clockwatcher cannot shoot during a timestop
  it('blocks a Clockwatcher during a timestop (legacy hardcoded false)', async () => {
    const { deps } = happyDeps({
      game: createFakeGame({ Game_ID: 1, GAME_STATE: GAMESTATES.TIMESTOPPED, shootCost: 2 }),
      shooterClass: createFakeClass({ Class_Name: 'Clockwatcher' }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.TIME_STOPPED });
    expectNoWrites(deps);
  });

  it('rejects when AP is one short of shootCost * amount, with the legacy wording', async () => {
    // amount 3 at shootCost 2 needs 6 AP; shooter has 5
    const { deps } = happyDeps({
      shooter: createFakePlayer({ Player_ID: 1, Discord_ID: SHOOTER, Game_ID: 1, Action_Points: 5, Range_: 3, Damage: 1, Tile_ID: 1 }),
    });
    const result = await logic.run({ ...INPUT, amount: 3 }, deps);
    expect(result).toMatchObject({
      ok: false,
      reason: REJECTIONS.NOT_ENOUGH_AP,
      data: { message: "You don't have enough AP to shoot that much!" },
    });
    expectNoWrites(deps);
  });

  it('accepts when AP exactly equals shootCost * amount (boundary)', async () => {
    // 6 AP, amount 3 at shootCost 2 = exactly 6
    const { deps } = happyDeps();
    const result = await logic.run({ ...INPUT, amount: 3 }, deps);
    expect(result.ok).toBe(true);
  });

  it('rejects a target user with no player row anywhere, with the legacy wording', async () => {
    const { deps, shooter } = happyDeps();
    deps.models.Players.findOne = jest.fn(async ({ where }) => (where.Discord_ID === SHOOTER ? shooter : null));
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({
      ok: false,
      reason: REJECTIONS.TARGET_NOT_IN_GAME,
      data: { message: 'That mention does not correspond to a player registered in that game!' },
    });
    expectNoWrites(deps);
  });

  it('rejects when the target is not standing on the given tile, with the legacy wording', async () => {
    const { deps } = happyDeps({
      target: createFakePlayer({ Player_ID: 2, Discord_ID: TARGET, Game_ID: 1, Health_Points: 10, Tile_ID: 2 }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({
      ok: false,
      reason: REJECTIONS.TARGET_NOT_ON_TILE,
      data: { message: "That player isnt on that tile!" },
    });
    expectNoWrites(deps);
  });

  // quirk pin: only the target's Tile_ID is ever compared - a Twin's second
  // body (Tile_ID2) cannot be shot at
  it("never checks the target's Tile_ID2, so a Twin's second body is unhittable", async () => {
    const { deps } = happyDeps({
      target: createFakePlayer({ Player_ID: 2, Discord_ID: TARGET, Game_ID: 1, Health_Points: 10, Tile_ID: 2, Tile_ID2: 3 }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.TARGET_NOT_ON_TILE });
    expectNoWrites(deps);
  });

  it('rejects one tile beyond range with the computed legacy wording', async () => {
    // path (1,1)->(3,1) has 3 tiles; range needed is 2, shooter has 1
    const { deps } = happyDeps({
      shooter: createFakePlayer({ Player_ID: 1, Discord_ID: SHOOTER, Game_ID: 1, Action_Points: 6, Range_: 1, Damage: 1, Tile_ID: 1 }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({
      ok: false,
      reason: REJECTIONS.OUT_OF_RANGE,
      data: { message: 'That tile is 1 tiles out of range!' },
    });
    expectNoWrites(deps);
  });

  it('accepts a target exactly at max range (boundary)', async () => {
    const { deps } = happyDeps({
      shooter: createFakePlayer({ Player_ID: 1, Discord_ID: SHOOTER, Game_ID: 1, Action_Points: 6, Range_: 2, Damage: 1, Tile_ID: 1 }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result.ok).toBe(true);
  });
});

describe('shoot.run success', () => {
  it('hits the target once with exact write payloads and death check', async () => {
    const { deps, shooter, target } = happyDeps();
    const result = await logic.run(INPUT, deps);
    expect(result).toEqual({
      ok: true,
      kind: 'shot',
      data: { events: [{ type: 'hitTarget', targetDiscordId: TARGET, damage: 1, x: 3, y: 1 }] },
    });
    expect(deps.models.Players.update).toHaveBeenCalledWith(
      { Health_Points: 9 }, // 10 - 1 * Damage(1) * (DMG_BUFF 0 + 1)
      { where: { Player_ID: 2, Game_ID: 1 } },
    );
    expect(deps.models.Players.update).toHaveBeenCalledWith(
      { Action_Points: 4 }, // 6 - shootCost(2) * amount(1)
      { where: { Player_ID: 1, Game_ID: 1 } },
    );
    expect(deps.models.Players.update).toHaveBeenCalledTimes(2); // no DMG_BUFF reset at 0
    expect(deps.utils.playerDeathLogic).toHaveBeenCalledWith(shooter, target);
  });

  // quirk pin: the target row is fetched by Discord_ID alone - no Game_ID
  // filter, so a row from another game can be found
  // was: looked up by Discord_ID alone, so a row from another game could
  // satisfy it and be shot from outside that game entirely
  it('scopes the target lookup to this game', async () => {
    const { deps } = happyDeps();
    await logic.run(INPUT, deps);
    expect(deps.models.Players.findOne).toHaveBeenCalledWith({
      where: { Discord_ID: TARGET, Game_ID: 1 },
    });
  });

  it('multiplies damage by shots and applies then resets a DMG buff', async () => {
    const { deps } = happyDeps({
      shooter: createFakePlayer({ Player_ID: 1, Discord_ID: SHOOTER, Game_ID: 1, Action_Points: 6, Range_: 3, Damage: 2, DMG_BUFF: 2, Tile_ID: 1 }),
    });
    const result = await logic.run(INPUT, deps);
    // damage = amount(1) * Damage(2) * (DMG_BUFF 2 + 1) = 6
    expect(result.data.events).toEqual([{ type: 'hitTarget', targetDiscordId: TARGET, damage: 6, x: 3, y: 1 }]);
    expect(deps.models.Players.update).toHaveBeenCalledWith({ Health_Points: 4 }, { where: { Player_ID: 2, Game_ID: 1 } });
    expect(deps.models.Players.update).toHaveBeenCalledWith({ DMG_BUFF: 0 }, { where: { Player_ID: 1, Game_ID: 1 } });
    expect(deps.models.Players.update).toHaveBeenCalledWith({ Action_Points: 4 }, { where: { Player_ID: 1, Game_ID: 1 } });
    expect(deps.models.Players.update).toHaveBeenCalledTimes(3);
  });

  it('damages an intact wall in the path and hits the target with the remaining shots', async () => {
    const { deps } = happyDeps({ midTileType: 'Wall' });
    const result = await logic.run({ ...INPUT, amount: 2 }, deps);
    expect(result.data.events).toEqual([
      { type: 'hitWall', x: 2, y: 1 },
      { type: 'hitTarget', targetDiscordId: TARGET, damage: 1, x: 3, y: 1 },
    ]);
    expect(deps.models.Tiles.update).toHaveBeenCalledWith(
      { Tile_Type: 'Wall_Damaged' },
      { where: { X_Position: 2, Y_Position: 1, Layer_ID: 1 } },
    );
    expect(deps.models.Players.update).toHaveBeenCalledWith({ Health_Points: 9 }, { where: { Player_ID: 2, Game_ID: 1 } });
  });

  it('destroys a damaged wall via revertTileToBlank and continues', async () => {
    const { deps, tiles } = happyDeps({ midTileType: 'Wall_Damaged' });
    const result = await logic.run({ ...INPUT, amount: 2 }, deps);
    expect(result.data.events).toEqual([
      { type: 'destroyedWall', x: 2, y: 1 },
      { type: 'hitTarget', targetDiscordId: TARGET, damage: 1, x: 3, y: 1 },
    ]);
    expect(deps.utils.revertTileToBlank).toHaveBeenCalledWith(tiles[1]);
  });

  // quirk pin: full shootCost * requested amount is deducted even when every
  // shot is spent on walls and the target is never reached
  it('charges the full AP cost when shots run out on walls before the target', async () => {
    const tiles = [
      createFakeTile({ Tile_ID: 1, Layer_ID: 1, X_Position: 1, Y_Position: 1, Tile_Type: 'Blank1' }),
      createFakeTile({ Tile_ID: 2, Layer_ID: 1, X_Position: 2, Y_Position: 1, Tile_Type: 'Wall' }),
      createFakeTile({ Tile_ID: 3, Layer_ID: 1, X_Position: 3, Y_Position: 1, Tile_Type: 'Wall' }),
      createFakeTile({ Tile_ID: 4, Layer_ID: 1, X_Position: 4, Y_Position: 1, Tile_Type: 'Blank2' }),
    ];
    const { deps } = happyDeps({
      tiles,
      target: createFakePlayer({ Player_ID: 2, Discord_ID: TARGET, Game_ID: 1, Health_Points: 10, Tile_ID: 4 }),
    });
    const result = await logic.run({ ...INPUT, x: 4, amount: 2 }, deps);
    expect(result.data.events).toEqual([
      { type: 'hitWall', x: 2, y: 1 },
      { type: 'hitWall', x: 3, y: 1 },
    ]);
    expect(deps.utils.playerDeathLogic).not.toHaveBeenCalled();
    // the target was never damaged, yet the full 2 * shootCost(2) is paid
    expect(deps.models.Players.update).toHaveBeenCalledTimes(1);
    expect(deps.models.Players.update).toHaveBeenCalledWith({ Action_Points: 2 }, { where: { Player_ID: 1, Game_ID: 1 } });
  });

  // quirk pin: a bush-miss on an INTACT wall reports "damaged wall" and the
  // wall is still damaged right after - the miss burns a shot, nothing else
  it('bush shooter can miss a wall (still damaging it) and then hit the target', async () => {
    const { deps } = happyDeps({
      shooterTileType: 'Bush',
      midTileType: 'Wall',
      random: seededRandom(0, 1), // miss the wall, then shoot true at the target
    });
    const result = await logic.run({ ...INPUT, amount: 3 }, deps);
    expect(result.data.events).toEqual([
      { type: 'missWall', x: 2, y: 1 },
      { type: 'hitWall', x: 2, y: 1 },
      { type: 'hitTarget', targetDiscordId: TARGET, damage: 1, x: 3, y: 1 },
    ]);
    expect(deps.models.Tiles.update).toHaveBeenCalledWith(
      { Tile_Type: 'Wall_Damaged' },
      { where: { X_Position: 2, Y_Position: 1, Layer_ID: 1 } },
    );
    expect(deps.models.Players.update).toHaveBeenCalledWith({ Health_Points: 9 }, { where: { Player_ID: 2, Game_ID: 1 } });
    expect(deps.models.Players.update).toHaveBeenCalledWith({ Action_Points: 0 }, { where: { Player_ID: 1, Game_ID: 1 } });
  });

  it('a Hunter never suffers the bush miss', async () => {
    const { deps } = happyDeps({
      shooterTileType: 'Bush',
      midTileType: 'Wall',
      shooterClass: createFakeClass({ Class_Name: 'Hunter' }),
      random: seededRandom(0), // would always miss for anyone else
    });
    const result = await logic.run({ ...INPUT, amount: 2 }, deps);
    expect(result.data.events).toEqual([
      { type: 'hitWall', x: 2, y: 1 },
      { type: 'hitTarget', targetDiscordId: TARGET, damage: 1, x: 3, y: 1 },
    ]);
  });

  // quirk pin: a miss on the target tile still damages the target with the
  // remaining shots - it falls through to the hit
  it('a target in a bush can be missed once, and the rest of the shots still land', async () => {
    const { deps } = happyDeps({
      targetTileType: 'Bush',
      random: seededRandom(0),
    });
    const result = await logic.run({ ...INPUT, amount: 2 }, deps);
    expect(result.data.events).toEqual([
      { type: 'missTarget' },
      { type: 'hitTarget', targetDiscordId: TARGET, damage: 1, x: 3, y: 1 },
    ]);
    expect(deps.models.Players.update).toHaveBeenCalledWith({ Health_Points: 9 }, { where: { Player_ID: 2, Game_ID: 1 } });
  });

  it("uses the shooter's second body tile when body is 2", async () => {
    const { deps } = happyDeps({
      shooter: createFakePlayer({
        Player_ID: 1, Discord_ID: SHOOTER, Game_ID: 1, Action_Points: 6, Range_: 3, Damage: 1, Tile_ID: 99, Tile_ID2: 1,
      }),
    });
    const result = await logic.run({ ...INPUT, body: 2 }, deps);
    expect(result.ok).toBe(true);
  });

  it('resolves the default game via getOldestGameId with the shooter id (old code passed nothing and threw)', async () => {
    const { deps } = happyDeps();
    deps.utils = { ...deps.utils, getOldestGameId: jest.fn(async () => 1) };
    const result = await logic.run({ ...INPUT, gameId: null }, deps);
    expect(result.ok).toBe(true);
    expect(deps.utils.getOldestGameId).toHaveBeenCalledWith(SHOOTER);
  });
});

describe('shoot.present', () => {
  it('renders a rejection through its carried legacy message', () => {
    const out = logic.present({
      ok: false,
      reason: REJECTIONS.NOT_ENOUGH_AP,
      data: { message: "You don't have enough AP to shoot that much!" },
    });
    expect(out).toEqual({ content: "You don't have enough AP to shoot that much!" });
  });

  it('renders the off-board target tile with the byte-identical default', () => {
    expect(logic.present({ ok: false, reason: REJECTIONS.NO_SUCH_TILE }))
      .toEqual({ content: 'That tile is not on the board!' });
  });

  it.each([
    [REJECTIONS.NO_SUCH_GAME],
    [REJECTIONS.NOT_IN_GAME],
    [REJECTIONS.GAME_OVER],
    [REJECTIONS.GAME_PAUSED],
    [REJECTIONS.TIME_STOPPED],
  ])('renders %s as non-empty text', (reason) => {
    const out = logic.present({ ok: false, reason });
    expect(typeof out.content).toBe('string');
    expect(out.content.length).toBeGreaterThan(0);
  });

  // byte-identical legacy formatting, including "damaged wall" on a miss
  // against an intact wall, the newline BEFORE the "!" on wall hits, and the
  // "$" after the damage number
  it('renders every event type byte-identically to the legacy strings', () => {
    const out = logic.present({
      ok: true,
      kind: 'shot',
      data: {
        events: [
          { type: 'missWall', x: 2, y: 1 },
          { type: 'hitWall', x: 2, y: 1 },
          { type: 'destroyedWall', x: 2, y: 1 },
          { type: 'missTarget' },
          { type: 'hitTarget', targetDiscordId: TARGET, damage: 3, x: 3, y: 1 },
        ],
      },
    });
    expect(out).toEqual({
      content:
        'You missed a damaged wall at 2,1!\n'
        + 'You hit a wall at 2,1\n!'
        + 'You destroyed a wall at 2,1\n!'
        + 'You missed the target tile!\n'
        + `You hit <@${TARGET}> for 3$ damage at 3,1!\n`,
    });
  });
});

describe('shoot adapter (smoke)', () => {
  it('exports the command contract', () => {
    expect(shoot.data.toJSON().name).toBe('shoot');
    expect(typeof shoot.execute).toBe('function');
  });
});
