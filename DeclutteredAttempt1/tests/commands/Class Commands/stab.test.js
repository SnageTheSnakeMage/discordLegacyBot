/**
 * /stab - logic tests. Plain data in, plain data out: no jest.mock, no
 * discord.js, no interaction. deps carries fake models; utils logic
 * (checkGameState) is real, while the DB-touching playerDeathLogic is an
 * injected fake.
 */
const logic = require('../../../commands/Class Commands/stab.logic.js');
const stab = require('../../../commands/Class Commands/stab.js');
const { GAMESTATES, REJECTIONS } = require('../../../enums.js');
const {
  createDeps, createFakeGame, createFakePlayer, createFakeClass, createFakeTile,
} = require('../../helpers/mockModels.js');

const STABBER = '123';
const TARGET = '456';

/** deps for the happy path; override per test */
function happyDeps(over = {}) {
  const stabber = over.stabber || createFakePlayer({
    Player_ID: 1, Discord_ID: STABBER, Class_ID: 7, Action_Points: 5,
    Damage: 1, MAX_DAMAGE: 3, DMG_BUFF: 0, Tile_ID: 1,
  });
  const target = over.target || createFakePlayer({
    Player_ID: 2, Discord_ID: TARGET, Class_ID: 1, Health_Points: 10, Tile_ID: 1,
  });
  const game = over.game || createFakeGame({ Game_ID: 1, GAME_STATE: GAMESTATES.ACTIVE });
  const stabberClass = over.stabberClass || createFakeClass({ Class_ID: 7, Class_Name: 'Fencer' });
  // both players stand on tile 1; the slots hold Player_IDs, per the model
  const tile = 'tile' in over ? over.tile : createFakeTile({
    Tile_ID: 1, Layer_ID: 1, Tile_Type: 'Blank1', Player1: 1, Player2: 2,
    X_Position: 4, Y_Position: 7,
  });

  const deps = createDeps({
    models: {
      Games: { findByPk: async () => game },
      Players: {
        findOne: async ({ where }) => {
          if (where.Discord_ID === STABBER) return stabber;
          if (where.Discord_ID === TARGET) return target;
          return null;
        },
      },
      Classes: { findOne: async () => stabberClass },
      Tiles: { findByPk: async () => tile },
    },
    random: over.random,
    utils: {
      playerDeathLogic: jest.fn(async () => {}),
      damagePlayer: jest.fn(async () => ({})),
    },
  });
  return { deps, stabber, target, game, tile };
}

const INPUT = { targetDiscordId: TARGET, amount: 1, gameId: 1, discordId: STABBER };

function expectNoWrites(deps) {
  expect(deps.models.Players.update).not.toHaveBeenCalled();
  expect(deps.models.Tiles.update).not.toHaveBeenCalled();
  expect(deps.utils.playerDeathLogic).not.toHaveBeenCalled();
}

describe('stab.parse', () => {
  it('applies defaults: amount 1, absent game null', () => {
    const input = logic.parse(
      { target: TARGET, amount: null, game: null },
      { discordId: STABBER, username: 'snage' },
    );
    expect(input).toEqual({ targetDiscordId: TARGET, amount: 1, gameId: null, discordId: STABBER });
  });

  it('passes explicit options through', () => {
    const input = logic.parse(
      { target: TARGET, amount: 3, game: 9 },
      { discordId: STABBER, username: 'snage' },
    );
    expect(input).toEqual({ targetDiscordId: TARGET, amount: 3, gameId: 9, discordId: STABBER });
  });
});

describe('stab.run rejections', () => {
  it('rejects an unknown game and writes nothing', async () => {
    const { deps } = happyDeps();
    deps.models.Games.findByPk = jest.fn(async () => null);
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.NO_SUCH_GAME });
    expectNoWrites(deps);
  });

  it('rejects a stabber who is not in the game', async () => {
    const { deps, target } = happyDeps();
    deps.models.Players.findOne = jest.fn(async ({ where }) => (where.Discord_ID === TARGET ? target : null));
    const result = await logic.run(INPUT, deps);
    expect(result.reason).toBe(REJECTIONS.NOT_IN_GAME);
    expectNoWrites(deps);
  });

  it('rejects a dead stabber', async () => {
    const { deps } = happyDeps({
      stabber: createFakePlayer({ Player_ID: 1, Discord_ID: STABBER, Class_ID: 7, Dead: true, Tile_ID: 1 }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result.reason).toBe(REJECTIONS.PLAYER_DEAD);
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
    const { deps } = happyDeps({ game: createFakeGame({ Game_ID: 1, GAME_STATE: state }) });
    const result = await logic.run(INPUT, deps);
    if (reason === null) {
      expect(result.ok).toBe(true);
    } else {
      expect(result).toMatchObject({ ok: false, reason });
      expectNoWrites(deps);
    }
  });

  // quirk pin: the gamestate gate is called with isClockwatcher=false, so a
  // Clockwatcher is blocked by a timestop here too
  it('blocks a Clockwatcher during a timestop', async () => {
    const { deps } = happyDeps({
      game: createFakeGame({ Game_ID: 1, GAME_STATE: GAMESTATES.TIMESTOPPED }),
      stabberClass: createFakeClass({ Class_ID: 7, Class_Name: 'Clockwatcher' }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result.reason).toBe(REJECTIONS.TIME_STOPPED);
    expectNoWrites(deps);
  });

  it('rejects a player who is not a Fencer', async () => {
    const { deps } = happyDeps({ stabberClass: createFakeClass({ Class_ID: 7, Class_Name: 'Average' }) });
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({
      ok: false,
      reason: REJECTIONS.WRONG_CLASS,
      data: { message: 'Only Fencers can use this command!' },
    });
    expectNoWrites(deps);
  });

  it('rejects when the class row is missing instead of crashing', async () => {
    const { deps } = happyDeps();
    deps.models.Classes.findOne = jest.fn(async () => null);
    const result = await logic.run(INPUT, deps);
    expect(result.reason).toBe(REJECTIONS.WRONG_CLASS);
    expectNoWrites(deps);
  });

  it('rejects when the stabber is one AP short (boundary: one short)', async () => {
    const { deps } = happyDeps({
      stabber: createFakePlayer({ Player_ID: 1, Discord_ID: STABBER, Class_ID: 7, Action_Points: 2, Tile_ID: 1 }),
    });
    const result = await logic.run({ ...INPUT, amount: 3 }, deps);
    expect(result).toMatchObject({
      ok: false,
      reason: REJECTIONS.NOT_ENOUGH_AP,
      data: { message: "You don't have enough AP to shoot that much!" },
    });
    expectNoWrites(deps);
  });

  it('accepts when the stabber has exactly the AP needed (boundary: exact)', async () => {
    const { deps } = happyDeps({
      stabber: createFakePlayer({
        Player_ID: 1, Discord_ID: STABBER, Class_ID: 7, Action_Points: 3,
        Damage: 1, MAX_DAMAGE: 3, Tile_ID: 1,
      }),
    });
    const result = await logic.run({ ...INPUT, amount: 3 }, deps);
    expect(result.ok).toBe(true);
    expect(deps.models.Players.update).toHaveBeenCalledWith(
      { Action_Points: 0 },
      { where: { Player_ID: 1, Game_ID: 1 } },
    );
  });

  it('rejects a stabber who is not on the board', async () => {
    const { deps } = happyDeps({ tile: null });
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({
      ok: false,
      reason: REJECTIONS.NOT_IN_GAME,
      data: { message: 'You are not on the board! Are you registered in that game?' },
    });
    expectNoWrites(deps);
  });

  it('rejects a target that is not a registered player', async () => {
    const { deps, stabber } = happyDeps();
    deps.models.Players.findOne = jest.fn(async ({ where }) => (where.Discord_ID === STABBER ? stabber : null));
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({
      ok: false,
      reason: REJECTIONS.TARGET_NOT_IN_GAME,
      data: { message: 'That mention does not correspond to a player registered in that game!' },
    });
    expectNoWrites(deps);
  });

  it('rejects when no target id was given', async () => {
    const { deps } = happyDeps();
    const result = await logic.run({ ...INPUT, targetDiscordId: null }, deps);
    expect(result.reason).toBe(REJECTIONS.TARGET_NOT_IN_GAME);
    expectNoWrites(deps);
  });

  it('rejects a target standing on another tile', async () => {
    const { deps } = happyDeps({
      tile: createFakeTile({ Tile_ID: 1, Layer_ID: 1, Player1: 1, X_Position: 4, Y_Position: 7 }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({
      ok: false,
      reason: REJECTIONS.TARGET_NOT_ON_TILE,
      data: { message: 'You are not on the same tile as the target!' },
    });
    expectNoWrites(deps);
  });

  // the tile's player slots hold Player_IDs (database/Models/Tiles.js): a slot
  // carrying a Discord_ID is not a match
  it('does not treat a Discord_ID in a player slot as the target', async () => {
    const { deps } = happyDeps({
      tile: createFakeTile({ Tile_ID: 1, Layer_ID: 1, Player1: 1, Player2: TARGET, X_Position: 4, Y_Position: 7 }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result.reason).toBe(REJECTIONS.TARGET_NOT_ON_TILE);
    expectNoWrites(deps);
  });
});

describe('stab.run success', () => {
  it('damages the target and charges the AP with exact write payloads', async () => {
    const { deps } = happyDeps();
    const result = await logic.run(INPUT, deps);
    expect(result).toEqual({
      ok: true,
      kind: 'stabbed',
      data: { missed: false, targetDiscordId: TARGET, damage: 1, x: 4, y: 7 },
    });
    expect(deps.utils.damagePlayer).toHaveBeenCalledWith(
      expect.objectContaining({ Player_ID: 1 }),
      expect.objectContaining({ Player_ID: 2 }),
      2,
    ); // 10 - min(1 * Damage(1) * (DMG_BUFF 0 + 1) * 2, MAX_DAMAGE 3) = 10 - 2
    expect(deps.models.Players.update).toHaveBeenCalledWith(
      { Action_Points: 4 }, // 5 - amount(1)
      { where: { Player_ID: 1, Game_ID: 1 } },
    );
    expect(deps.models.Players.update).toHaveBeenCalledTimes(1); // AP only; the HP write moved to damagePlayer
  });

  // quirk pin: the write doubles then caps, the message does neither
  it('caps the applied damage at MAX_DAMAGE while announcing the uncapped, undoubled number', async () => {
    const { deps } = happyDeps();
    const result = await logic.run({ ...INPUT, amount: 2 }, deps);
    expect(result.data.damage).toBe(2); // announced: 2 * 1 * 1
    expect(deps.utils.damagePlayer).toHaveBeenCalledWith(
      expect.objectContaining({ Player_ID: 1 }),
      expect.objectContaining({ Player_ID: 2 }),
      3,
    ); // applied: min(2 * 1 * 1 * 2 = 4, MAX_DAMAGE 3) = 3
    expect(deps.models.Players.update).toHaveBeenCalledWith(
      { Action_Points: 3 }, // 5 - amount(2)
      { where: { Player_ID: 1, Game_ID: 1 } },
    );
  });

  it('spends a DMG_BUFF and resets it', async () => {
    const { deps } = happyDeps({
      stabber: createFakePlayer({
        Player_ID: 1, Discord_ID: STABBER, Class_ID: 7, Action_Points: 5,
        Damage: 1, MAX_DAMAGE: 9, DMG_BUFF: 2, Tile_ID: 1,
      }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result.data.damage).toBe(3); // 1 * 1 * (2 + 1)
    expect(deps.utils.damagePlayer).toHaveBeenCalledWith(
      expect.objectContaining({ Player_ID: 1 }),
      expect.objectContaining({ Player_ID: 2 }),
      6,
    ); // 10 - min(1 * 1 * 3 * 2 = 6, MAX_DAMAGE 9)
    expect(deps.models.Players.update).toHaveBeenCalledWith(
      { DMG_BUFF: 0 },
      { where: { Player_ID: 1, Game_ID: 1 } },
    );
    expect(deps.models.Players.update).toHaveBeenCalledTimes(2); // DMG_BUFF reset + AP; the HP write moved to damagePlayer
  });

  // quirk pin: the bush swallows the stab but the AP was already committed
  it('misses in a bush, still writes a zero-damage hit and still charges the AP', async () => {
    const { deps } = happyDeps({
      tile: createFakeTile({
        Tile_ID: 1, Layer_ID: 1, Tile_Type: 'Bush', Player1: 1, Player2: 2,
        X_Position: 4, Y_Position: 7,
      }),
      random: () => 0,
    });
    const result = await logic.run(INPUT, deps);
    expect(result.data).toMatchObject({ missed: true, damage: 0 });
    expect(deps.utils.damagePlayer).toHaveBeenCalledWith(
      expect.objectContaining({ Player_ID: 1 }),
      expect.objectContaining({ Player_ID: 2 }),
      0,
    ); // 10 - min(0, MAX_DAMAGE)
    expect(deps.models.Players.update).toHaveBeenCalledWith(
      { Action_Points: 4 }, // paid for the stab that missed
      { where: { Player_ID: 1, Game_ID: 1 } },
    );
  });

  it('lands the stab in a bush on the other roll', async () => {
    const { deps } = happyDeps({
      tile: createFakeTile({
        Tile_ID: 1, Layer_ID: 1, Tile_Type: 'Bush', Player1: 1, Player2: 2,
        X_Position: 4, Y_Position: 7,
      }),
      random: () => 1,
    });
    const result = await logic.run(INPUT, deps);
    expect(result.data).toMatchObject({ missed: false, damage: 1 });
    expect(deps.utils.damagePlayer).toHaveBeenCalledWith(
      expect.objectContaining({ Player_ID: 1 }),
      expect.objectContaining({ Player_ID: 2 }),
      2,
    ); //
  });

  // quirk pin: amount is never validated
  it('heals the target and refunds AP on a negative amount', async () => {
    const { deps } = happyDeps();
    const result = await logic.run({ ...INPUT, amount: -1 }, deps);
    expect(result.ok).toBe(true);
    expect(deps.utils.damagePlayer).toHaveBeenCalledWith(
      expect.objectContaining({ Player_ID: 1 }),
      expect.objectContaining({ Player_ID: 2 }),
      -2,
    ); // 10 - min(-2, 3)
    expect(deps.models.Players.update).toHaveBeenCalledWith(
      { Action_Points: 6 }, // 5 - (-1)
      { where: { Player_ID: 1, Game_ID: 1 } },
    );
  });

  // quirk pin: the target row is fetched by Discord_ID alone - no Game_ID
  // was: looked up by Discord_ID alone, so a row from another game could
  // satisfy it
  it('scopes the target lookup to this game', async () => {
    const { deps } = happyDeps();
    await logic.run(INPUT, deps);
    expect(deps.models.Players.findOne).toHaveBeenCalledWith({
      where: { Discord_ID: TARGET, Game_ID: 1 },
    });
  });

  it('resolves the default game via getOldestActiveGameId when no game is given', async () => {
    const { deps } = happyDeps();
    deps.utils.getOldestActiveGameId = jest.fn(async () => 1);
    const result = await logic.run({ ...INPUT, gameId: null }, deps);
    expect(result.ok).toBe(true);
    expect(deps.utils.getOldestActiveGameId).toHaveBeenCalledWith(STABBER);
  });
});

describe('stab.present', () => {
  it.each([
    [REJECTIONS.WRONG_CLASS, { message: 'Only Fencers can use this command!' }, 'Only Fencers can use this command!'],
    [REJECTIONS.NOT_ENOUGH_AP, { message: "You don't have enough AP to shoot that much!" }, "You don't have enough AP to shoot that much!"],
    [REJECTIONS.NOT_IN_GAME, { message: 'You are not on the board! Are you registered in that game?' }, 'You are not on the board! Are you registered in that game?'],
    [REJECTIONS.TARGET_NOT_IN_GAME, { message: 'That mention does not correspond to a player registered in that game!' }, 'That mention does not correspond to a player registered in that game!'],
    [REJECTIONS.TARGET_NOT_ON_TILE, { message: 'You are not on the same tile as the target!' }, 'You are not on the same tile as the target!'],
    [REJECTIONS.PLAYER_DEAD, undefined, "Dead players can't use this command."],
  ])('renders %s as its legacy wording', (reason, data, expected) => {
    expect(logic.present({ ok: false, reason, data })).toEqual({ content: expected });
  });

  it('renders a hit', () => {
    const out = logic.present({
      ok: true, kind: 'stabbed',
      data: { missed: false, targetDiscordId: TARGET, damage: 2, x: 4, y: 7 },
    });
    expect(out).toEqual({ content: `You hit <@${TARGET}> for 2$ damage at 4,7!\n` });
  });

  it('prefixes a bush miss before the hit line', () => {
    const out = logic.present({
      ok: true, kind: 'stabbed',
      data: { missed: true, targetDiscordId: TARGET, damage: 0, x: 4, y: 7 },
    });
    expect(out).toEqual({
      content: `You missed the target in the bush!\nYou hit <@${TARGET}> for 0$ damage at 4,7!\n`,
    });
  });
});

describe('stab adapter (smoke)', () => {
  it('exports the command contract', () => {
    expect(stab.data.toJSON().name).toBe('stab');
    expect(typeof stab.execute).toBe('function');
  });
});
