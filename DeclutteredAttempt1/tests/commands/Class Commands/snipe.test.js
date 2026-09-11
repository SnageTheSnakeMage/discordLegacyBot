/**
 * /snipe - logic tests. Plain data in, plain data out: no jest.mock, no
 * discord.js, no interaction. deps carries fake models; utils logic
 * (getTileCordinatesOfLine, checkGameState) is real, while the DB-touching
 * helpers playerDeathLogic and revertTileToBlank are injected fakes.
 */
const logic = require('../../../commands/Class Commands/snipe.logic.js');
const snipe = require('../../../commands/Class Commands/snipe.js');
const { GAMESTATES, REJECTIONS } = require('../../../enums.js');
const {
  createDeps, createFakeGame, createFakePlayer, createFakeClass, createFakeTile,
} = require('../../helpers/mockModels.js');

const SNIPER = '123';
const TARGET = '456';
const BYSTANDER = '789';

/**
 * Happy-path board: sniper (Player_ID 1) on (1,1), target (Player_ID 2) on
 * (3,1), same layer, straight east line, shootCost 2. Override per test.
 */
function happyDeps(over = {}) {
  const game = over.game || createFakeGame({ Game_ID: 1, GAME_STATE: GAMESTATES.ACTIVE, shootCost: 2 });
  const sniper = over.sniper || createFakePlayer({
    Player_ID: 1, Class_ID: 1, Discord_ID: SNIPER, Game_ID: 1,
    Action_Points: 6, Range_: 3, Damage: 1, DMG_BUFF: 0, Health_Points: 10, Tile_ID: 1,
  });
  const target = over.target || createFakePlayer({
    Player_ID: 2, Class_ID: 1, Discord_ID: TARGET, Game_ID: 1, Health_Points: 10, Tile_ID: 3,
  });
  const bystander = over.bystander || createFakePlayer({
    Player_ID: 3, Class_ID: 1, Discord_ID: BYSTANDER, Game_ID: 1, Health_Points: 8, Tile_ID: 2,
  });
  const tiles = over.tiles || [
    createFakeTile({
      Tile_ID: 1, Layer_ID: 1, X_Position: 1, Y_Position: 1,
      Tile_Type: over.shooterTileType || 'Blank1',
      Player1: over.shooterTileOccupant === undefined ? null : over.shooterTileOccupant,
    }),
    createFakeTile({
      Tile_ID: 2, Layer_ID: 1, X_Position: 2, Y_Position: 1,
      Tile_Type: over.midTileType || 'Blank2',
      Player1: over.midTileOccupant === undefined ? null : over.midTileOccupant,
    }),
    createFakeTile({
      Tile_ID: 3, Layer_ID: 1, X_Position: 3, Y_Position: 1,
      Tile_Type: over.targetTileType || 'Blank1', Player1: 2,
    }),
  ];
  const sniperClass = over.sniperClass === undefined ? createFakeClass({ Class_Name: 'Sniper' }) : over.sniperClass;
  const players = [sniper, target, bystander];
  const deps = createDeps({
    models: {
      Games: { findByPk: async () => game },
      Players: {
        findOne: async ({ where }) => {
          if (where.Discord_ID !== undefined) {
            return players.find((p) => p.Discord_ID === where.Discord_ID) || null;
          }
          return players.find((p) => p.Player_ID === where.Player_ID) || null;
        },
      },
      Classes: { findByPk: async () => sniperClass },
      Tiles: {
        findByPk: async (id) => tiles.find((t) => t.Tile_ID === id) || null,
        findOne: async ({ where }) => tiles.find(
          (t) => t.Layer_ID === where.Layer_ID && t.X_Position === where.X_Position && t.Y_Position === where.Y_Position,
        ) || null,
      },
    },
    utils: {
      playerDeathLogic: jest.fn(async () => {}),
      damagePlayer: jest.fn(async () => ({})),
      revertTileToBlank: jest.fn(async () => {}),
    },
  });
  return { deps, game, sniper, target, bystander, tiles };
}

const INPUT = {
  x: 3, y: 1, targetDiscordId: TARGET, targetUsername: 'victim', amount: 1, gameId: 1, discordId: SNIPER,
};

function expectNoWrites(deps) {
  expect(deps.models.Players.update).not.toHaveBeenCalled();
  expect(deps.models.Tiles.update).not.toHaveBeenCalled();
  expect(deps.utils.playerDeathLogic).not.toHaveBeenCalled();
  expect(deps.utils.revertTileToBlank).not.toHaveBeenCalled();
}

describe('snipe.parse', () => {
  it('maps raw options and applies defaults', () => {
    const input = logic.parse(
      { x: 3, y: 1, target: TARGET, targetUsername: 'victim', amount: null, game: null },
      { discordId: SNIPER, username: 'snage' },
    );
    expect(input).toEqual({
      x: 3, y: 1, targetDiscordId: TARGET, targetUsername: 'victim', amount: 1, gameId: null, discordId: SNIPER,
    });
  });

  it('keeps explicit amount and game, and nulls an absent target', () => {
    expect(logic.parse({ x: 1, y: 2, target: null, amount: 4, game: 7 }, { discordId: SNIPER })).toEqual({
      x: 1, y: 2, targetDiscordId: null, targetUsername: null, amount: 4, gameId: 7, discordId: SNIPER,
    });
  });
});

describe('snipe.run rejections', () => {
  it('rejects an unknown game and writes nothing (the old code crashed on game.GAME_STATE)', async () => {
    const { deps } = happyDeps();
    deps.models.Games.findByPk = jest.fn(async () => null);
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.NO_SUCH_GAME });
    expectNoWrites(deps);
  });

  it('rejects a sniper who is not in the game (the old code crashed on player.Tile_ID)', async () => {
    const { deps, target, bystander } = happyDeps();
    const others = [target, bystander];
    deps.models.Players.findOne = jest.fn(async ({ where }) => others.find((p) => p.Discord_ID === where.Discord_ID) || null);
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.NOT_IN_GAME });
    expectNoWrites(deps);
  });

  it('rejects a sniper whose tile row is missing (the old code crashed on shootersTile.Layer_ID)', async () => {
    const { deps } = happyDeps({
      sniper: createFakePlayer({ Player_ID: 1, Discord_ID: SNIPER, Game_ID: 1, Action_Points: 6, Range_: 3, Tile_ID: 99 }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.NOT_IN_GAME });
    expectNoWrites(deps);
  });

  it('rejects a target tile that is not on the board, with the legacy wording', async () => {
    const { deps } = happyDeps();
    const result = await logic.run({ ...INPUT, x: 9, y: 9 }, deps);
    expect(result).toMatchObject({
      ok: false,
      reason: REJECTIONS.NO_SUCH_TILE,
      data: { message: 'The tile provided is not in the game!' },
    });
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

  // quirk pin: the old call was checkGameStateAndReply(state, false, ...), so
  // unlike most commands even a Clockwatcher is frozen out by a timestop
  it('does not block a Clockwatcher during a timestop', async () => {
    const { deps } = happyDeps({
      game: createFakeGame({ Game_ID: 1, GAME_STATE: GAMESTATES.TIMESTOPPED, shootCost: 2 }),
      sniperClass: createFakeClass({ Class_Name: 'Clockwatcher' }),
    });
    const result = await logic.run(INPUT, deps);
    // the gate now consults the actor's class, so a timestop does not
    // stop a Clockwatcher
    expect(result.reason).not.toBe(REJECTIONS.TIME_STOPPED);
    expectNoWrites(deps);
  });

  it('rejects when AP is one short of shootCost * amount, with the legacy wording', async () => {
    // amount 3 at shootCost 2 needs 6 AP; the sniper has 5
    const { deps } = happyDeps({
      sniper: createFakePlayer({
        Player_ID: 1, Discord_ID: SNIPER, Game_ID: 1, Action_Points: 5, Range_: 3, Damage: 1, Tile_ID: 1,
      }),
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

  it('rejects a target with no player row in this game, with the legacy wording', async () => {
    const { deps, sniper } = happyDeps();
    deps.models.Players.findOne = jest.fn(async ({ where }) => (where.Discord_ID === SNIPER ? sniper : null));
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({
      ok: false,
      reason: REJECTIONS.TARGET_NOT_IN_GAME,
      data: { message: 'The tile provided is not in the game!' },
    });
    expectNoWrites(deps);
  });

  // quirk pin: unlike /shoot, snipe filters the target lookup by Game_ID too
  it('looks the target up with a Game_ID filter', async () => {
    const { deps } = happyDeps();
    await logic.run(INPUT, deps);
    expect(deps.models.Players.findOne).toHaveBeenCalledWith({ where: { Discord_ID: TARGET, Game_ID: 1 } });
  });

  it('rejects when the target is not standing on the given tile, with the legacy wording', async () => {
    const { deps } = happyDeps({
      target: createFakePlayer({ Player_ID: 2, Discord_ID: TARGET, Game_ID: 1, Health_Points: 10, Tile_ID: 2 }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({
      ok: false,
      reason: REJECTIONS.TARGET_NOT_ON_TILE,
      data: { message: 'Your target is not on the tile provided!' },
    });
    expectNoWrites(deps);
  });

  // quirk pin: only the target's Tile_ID is ever compared - a Twin's second
  // body (Tile_ID2) cannot be sniped
  // was: only Tile_ID was compared, so a Twin's second body could not be
  // sniped at all
  it("hits a Twin's second body when that is the one on the tile", async () => {
    const { deps } = happyDeps({
      target: createFakePlayer({
        Player_ID: 2, Discord_ID: TARGET, Game_ID: 1, Health_Points: 10, Health_Points2: 5, Tile_ID: 9, Tile_ID2: 3,
      }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result.ok).toBe(true);
    expect(deps.utils.damagePlayer).toHaveBeenCalledWith(
      expect.objectContaining({ Player_ID: 1 }),
      expect.objectContaining({ Player_ID: 2 }),
      1, 2,
    );
  });

  it('rejects one tile beyond range with the computed legacy wording', async () => {
    // path (1,1)->(3,1) is 3 tiles, so 2 tiles of range are needed; sniper has 1
    const { deps } = happyDeps({
      sniper: createFakePlayer({
        Player_ID: 1, Discord_ID: SNIPER, Game_ID: 1, Action_Points: 6, Range_: 1, Damage: 1, Tile_ID: 1,
      }),
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
      sniper: createFakePlayer({
        Player_ID: 1, Class_ID: 1, Discord_ID: SNIPER, Game_ID: 1, Action_Points: 6, Range_: 2, Damage: 1, Tile_ID: 1,
      }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result.ok).toBe(true);
  });

  // the legacy gate read player.Class, which is not a column on Players, so
  // it was always undefined and nobody could ever snipe. Now the class row is
  // read; the wording is unchanged.
  it('rejects a player whose class is not Sniper', async () => {
    const { deps } = happyDeps({ sniperClass: createFakeClass({ Class_Name: 'Average' }) });
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.WRONG_CLASS, data: { className: 'Sniper' } });
    expect(logic.present(result)).toEqual({ content: 'You are not a Sniper!' });
    expectNoWrites(deps);
  });

  it('rejects when the class row is missing entirely', async () => {
    const { deps } = happyDeps({ sniperClass: null });
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.WRONG_CLASS });
    expectNoWrites(deps);
  });
});

describe('snipe.run success', () => {
  it('hits the target with exact write payloads and the legacy death-check argument order', async () => {
    const { deps } = happyDeps();
    const result = await logic.run(INPUT, deps);
    expect(result).toEqual({
      ok: true,
      kind: 'sniped',
      data: {
        events: [
          { type: 'zipped', x: 1, y: 1 },
          { type: 'zipped', x: 2, y: 1 },
          { type: 'hitTarget', username: 'victim', damage: 1, x: 3, y: 1 },
        ],
      },
    });
    expect(deps.utils.damagePlayer).toHaveBeenCalledWith(
      expect.objectContaining({ Player_ID: 1 }),
      expect.objectContaining({ Player_ID: 2 }),
      1, 1,
    );
    expect(deps.models.Players.update).toHaveBeenCalledWith(
      { Action_Points: 4 }, // 6 - shootCost(2) * amount(1)
      { where: { Player_ID: 1, Game_ID: 1 } },
    );
    expect(deps.models.Players.update).toHaveBeenCalledTimes(1); // AP only; the HP write moved to damagePlayer
  });

  it('resolves the default game via getOldestGameId with the sniper id (the old code passed nothing and threw)', async () => {
    const { deps } = happyDeps();
    deps.utils = { ...deps.utils, getOldestGameId: jest.fn(async () => 1) };
    const result = await logic.run({ ...INPUT, gameId: null }, deps);
    expect(result.ok).toBe(true);
    expect(deps.utils.getOldestGameId).toHaveBeenCalledWith(SNIPER);
  });

  it('damages an intact wall at two shots or fewer and still reaches the target (snipe pierces)', async () => {
    const { deps } = happyDeps({ midTileType: 'Wall' });
    const result = await logic.run({ ...INPUT, amount: 2 }, deps);
    expect(result.data.events).toEqual([
      { type: 'zipped', x: 1, y: 1 },
      { type: 'hitWall', x: 2, y: 1 },
      // quirk pin: the tile-type half of the legacy "zipped by" condition is a
      // tautology, so an empty WALL tile reports both lines
      { type: 'zipped', x: 2, y: 1 },
      { type: 'hitTarget', username: 'victim', damage: 2, x: 3, y: 1 },
    ]);
    expect(deps.models.Tiles.update).toHaveBeenCalledWith(
      { Tile_Type: 'Wall_Damaged' },
      { where: { X_Position: 2, Y_Position: 1, Layer_ID: 1 } },
    );
    expect(deps.utils.revertTileToBlank).not.toHaveBeenCalled();
    expect(deps.utils.damagePlayer).toHaveBeenCalledWith(
      expect.objectContaining({ Player_ID: 1 }), expect.objectContaining({ Player_ID: 2 }), 2, 1,
    );
    expect(deps.models.Players.update).toHaveBeenCalledWith({ Action_Points: 2 }, { where: { Player_ID: 1, Game_ID: 1 } });
  });

  it('destroys an intact wall outright at more than two shots (boundary: 3 destroys, 2 only damages)', async () => {
    const { deps, tiles } = happyDeps({ midTileType: 'Wall' });
    const result = await logic.run({ ...INPUT, amount: 3 }, deps);
    expect(result.data.events).toEqual([
      { type: 'zipped', x: 1, y: 1 },
      { type: 'destroyedWall', x: 2, y: 1 },
      { type: 'zipped', x: 2, y: 1 },
      { type: 'hitTarget', username: 'victim', damage: 3, x: 3, y: 1 },
    ]);
    expect(deps.utils.revertTileToBlank).toHaveBeenCalledWith(tiles[1]);
    expect(deps.models.Tiles.update).not.toHaveBeenCalled();
  });

  it('destroys an already-damaged wall via revertTileToBlank whatever the shot count', async () => {
    const { deps, tiles } = happyDeps({ midTileType: 'Wall_Damaged' });
    const result = await logic.run(INPUT, deps);
    expect(result.data.events).toEqual([
      { type: 'zipped', x: 1, y: 1 },
      { type: 'destroyedWall', x: 2, y: 1 },
      { type: 'zipped', x: 2, y: 1 },
      { type: 'hitTarget', username: 'victim', damage: 1, x: 3, y: 1 },
    ]);
    expect(deps.utils.revertTileToBlank).toHaveBeenCalledWith(tiles[1]);
    expect(deps.utils.revertTileToBlank).toHaveBeenCalledTimes(1);
  });

  // quirk pin: collateral damage WRITTEN is one shot's worth, but the damage
  // ANNOUNCED is amount shots' worth - the two disagree
  it('damages a bystander in the path for one shot while announcing the full amount', async () => {
    const { deps } = happyDeps({ midTileOccupant: 3 });
    const result = await logic.run({ ...INPUT, amount: 3 }, deps);
    expect(result.data.events).toEqual([
      { type: 'zipped', x: 1, y: 1 },
      { type: 'hitCollateral', targetDiscordId: BYSTANDER, damage: 3, x: 2, y: 1 },
      { type: 'hitTarget', username: 'victim', damage: 3, x: 3, y: 1 },
    ]);
    expect(deps.utils.damagePlayer).toHaveBeenCalledWith(
      expect.objectContaining({ Player_ID: 1 }),
      expect.objectContaining({ Player_ID: 3 }),
      1,
    );
    // was (bystander, sniper): the arguments reversed, so the SNIPER was
    // checked for death and the victim never was. damagePlayer takes
    // (attacker, victim), so both the bystander and the target are checked.
    expect(deps.utils.damagePlayer).toHaveBeenCalledTimes(2);
    // the bystander's tile is occupied, so no "zipped by" line for it
    expect(result.data.events).not.toContainEqual({ type: 'zipped', x: 2, y: 1 });
  });

  // quirk pin: the sniper's own tile is the first tile of the path and is
  // never excluded, so a sniper occupying their tile shoots themselves
  it('treats the sniper standing on their own tile as collateral', async () => {
    const { deps } = happyDeps({ shooterTileOccupant: 1 });
    const result = await logic.run(INPUT, deps);
    expect(result.data.events[0]).toEqual({ type: 'hitCollateral', targetDiscordId: SNIPER, damage: 1, x: 1, y: 1 });
    expect(deps.utils.damagePlayer).toHaveBeenCalledWith(
      expect.objectContaining({ Player_ID: 1 }),
      expect.objectContaining({ Player_ID: 1 }),
      1,
    );
  });

  // quirk pin: the DMG_BUFF reset is the LAST statement of the loop body, so
  // it runs once per tile crossed and never on the tile the shot lands on
  it('resets a DMG buff once per crossed tile, after the damage is computed with it', async () => {
    const { deps } = happyDeps({
      sniper: createFakePlayer({
        Player_ID: 1, Class_ID: 1, Discord_ID: SNIPER, Game_ID: 1,
        Action_Points: 6, Range_: 3, Damage: 2, DMG_BUFF: 2, Tile_ID: 1,
      }),
    });
    const result = await logic.run(INPUT, deps);
    // damage = amount(1) * Damage(2) * (DMG_BUFF 2 + 1) = 6
    expect(result.data.events).toContainEqual({ type: 'hitTarget', username: 'victim', damage: 6, x: 3, y: 1 });
    expect(deps.models.Players.update).toHaveBeenCalledWith({ DMG_BUFF: 0 }, { where: { Player_ID: 1, Game_ID: 1 } });
    expect(deps.utils.damagePlayer).toHaveBeenCalledWith(
      expect.objectContaining({ Player_ID: 1 }), expect.objectContaining({ Player_ID: 2 }), 6, 1,
    );
    expect(deps.models.Players.update).toHaveBeenCalledWith({ Action_Points: 4 }, { where: { Player_ID: 1, Game_ID: 1 } });
    // two crossed tiles -> two buff resets, plus the AP; the damage write moved
    expect(deps.models.Players.update).toHaveBeenCalledTimes(3);
  });
});

describe('snipe.present', () => {
  it('renders a rejection through its carried legacy message', () => {
    const out = logic.present({
      ok: false,
      reason: REJECTIONS.NOT_ENOUGH_AP,
      data: { message: "You don't have enough AP to shoot that much!" },
    });
    expect(out).toEqual({ content: "You don't have enough AP to shoot that much!" });
  });

  it.each([
    [REJECTIONS.NO_SUCH_GAME],
    [REJECTIONS.NOT_IN_GAME],
    [REJECTIONS.WRONG_CLASS],
    [REJECTIONS.GAME_OVER],
    [REJECTIONS.GAME_PAUSED],
    [REJECTIONS.TIME_STOPPED],
  ])('renders %s as non-empty text', (reason) => {
    const out = logic.present({ ok: false, reason });
    expect(typeof out.content).toBe('string');
    expect(out.content.length).toBeGreaterThan(0);
  });

  // byte-identical legacy formatting: the newline BEFORE the "!" on the wall
  // and zip lines, the "$" after the damage number, the target named by
  // username while collateral is mentioned
  it('renders every event type byte-identically to the legacy strings', () => {
    const out = logic.present({
      ok: true,
      kind: 'sniped',
      data: {
        events: [
          { type: 'destroyedWall', x: 2, y: 1 },
          { type: 'hitWall', x: 2, y: 1 },
          { type: 'zipped', x: 2, y: 1 },
          { type: 'hitCollateral', targetDiscordId: BYSTANDER, damage: 3, x: 2, y: 1 },
          { type: 'hitTarget', username: 'victim', damage: 3, x: 3, y: 1 },
        ],
      },
    });
    expect(out).toEqual({
      content:
        'You destroyed a wall at 2,1\n!'
        + 'You hit a wall at 2,1\n!'
        + 'Your shot zipped by 2,1\n!'
        + `You hit <@${BYSTANDER}> for 3$ damage at 2,1!\n`
        + 'You hit victim for 3$ damage at 3,1!\n',
    });
  });

  it('renders an empty response when nothing happened', () => {
    expect(logic.present({ ok: true, kind: 'sniped', data: { events: [] } })).toEqual({ content: '' });
  });
});

describe('snipe adapter (smoke)', () => {
  it('exports the command contract', () => {
    expect(snipe.data.toJSON().name).toBe('snipe');
    expect(typeof snipe.execute).toBe('function');
  });
});
