/**
 * /punish - logic tests. Plain data in, plain data out: no jest.mock of
 * modules under test, no discord.js, no interaction. deps carries fake
 * models; utils logic is real.
 *
 * punish is an unfinished command (issue #84): the copied /shoot attack loop
 * could only throw on its undeclared `amount`, so the port rejects where the
 * loop stood and the command has NO success path. Every test below therefore
 * also asserts that punish writes nothing.
 */
const logic = require('../../../commands/Class Commands/punish.logic.js');
const punish = require('../../../commands/Class Commands/punish.js');
const { GAMESTATES, REJECTIONS } = require('../../../enums.js');
const {
  createDeps, createFakeGame, createFakePlayer, createFakeTile,
  createFakeClass
} = require('../../helpers/mockModels.js');

const ATTACKER = '123';
const TARGET = '456';

/**
 * deps for the "everything passes" path; override per test.
 * Attacker at (1,1) on layer 1 with Range_ 3 and 5 AP; target standing on
 * tile 42 at (3,1) on the same layer. Range semantics:
 * getTileCordinatesOfLine includes both endpoints, so (1,1)->(4,1) is length
 * 4 and costs 3 range (exactly at Range_ 3), and (1,1)->(5,1) is one beyond.
 */
function happyDeps(over = {}) {
  const game = 'game' in over ? over.game : createFakeGame({ Game_ID: 1, GAME_STATE: GAMESTATES.ACTIVE });
  const player = 'player' in over ? over.player : createFakePlayer({
    Player_ID: 1, Discord_ID: ATTACKER, Action_Points: 5, Range_: 3, Tile_ID: 1,
  });
  const targetPlayer = 'targetPlayer' in over ? over.targetPlayer : createFakePlayer({
    Player_ID: 2, Discord_ID: TARGET, Tile_ID: 42,
  });
  const attackersTile = 'attackersTile' in over ? over.attackersTile : createFakeTile({
    Tile_ID: 1, X_Position: 1, Y_Position: 1, Layer_ID: 1,
  });
  // by default the board has a tile wherever the player aims, id 42
  const findTile = 'targetTile' in over
    ? async () => over.targetTile
    : async ({ where }) => createFakeTile({
      Tile_ID: 42, X_Position: where.X_Position, Y_Position: where.Y_Position, Layer_ID: where.Layer_ID,
    });

  const deps = createDeps({
    models: {
      Games: { findByPk: async () => game },
      Players: {
        findOne: async ({ where }) => (where.Discord_ID === ATTACKER ? player : where.Discord_ID === TARGET ? targetPlayer : null),
      },
      Tiles: {
        findByPk: async () => attackersTile,
        findOne: findTile,
      },
    },
  });
  return { deps, game, player, targetPlayer, attackersTile };
}

const INPUT = { x: 3, y: 1, targetDiscordId: TARGET, gameId: 1, discordId: ATTACKER };

function expectNoWrites(deps) {
  expect(deps.models.Players.update).not.toHaveBeenCalled();
  expect(deps.models.Tiles.update).not.toHaveBeenCalled();
  expect(deps.models.Players.create).not.toHaveBeenCalled();
  expect(deps.models.Tiles.create).not.toHaveBeenCalled();
}

describe('punish.parse', () => {
  it('maps raw options and applies defaults', () => {
    const input = logic.parse(
      { x: 4, y: 2, target: TARGET, game: null },
      { discordId: ATTACKER, username: 'snage' },
    );
    expect(input).toEqual({ x: 4, y: 2, targetDiscordId: TARGET, gameId: null, discordId: ATTACKER });
  });

  it('keeps an explicit game id', () => {
    const input = logic.parse({ x: 1, y: 1, target: TARGET, game: 7 }, { discordId: ATTACKER, username: 'snage' });
    expect(input.gameId).toBe(7);
  });

  it('ignores a body option: this command never declared one', () => {
    const input = logic.parse({ x: 1, y: 1, target: TARGET, game: 1, body: 2 }, { discordId: ATTACKER, username: 'snage' });
    expect(input.body).toBeUndefined();
  });
});

describe('punish.run rejections', () => {
  it('rejects an unknown game and writes nothing', async () => {
    const { deps } = happyDeps({ game: null });
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.NO_SUCH_GAME });
    expectNoWrites(deps);
  });

  it('rejects an attacker who is not in the game', async () => {
    const { deps } = happyDeps({ player: null });
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.NOT_IN_GAME });
    expectNoWrites(deps);
  });

  it('rejects an attacker who is not on the board', async () => {
    const { deps } = happyDeps({ attackersTile: null });
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.NOT_IN_GAME });
    expect(logic.present(result)).toEqual({ content: 'You are not on the board! Are you registered in that game?' });
    expectNoWrites(deps);
  });

  it('rejects a target tile that is not on the board', async () => {
    const { deps } = happyDeps({ targetTile: null });
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.NO_SUCH_TILE });
    expect(logic.present(result)).toEqual({ content: 'That tile is not on the board!' });
    expectNoWrites(deps);
  });

  // the gamestate table: every state has a defined outcome; adding a state
  // without deciding its gate breaks this test. Passing the gate lands on the
  // unimplemented-class rejection, because punish has no success path.
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
    expect(result.ok).toBe(false);
    expect(result.reason).toBe(reason === null ? REJECTIONS.WRONG_CLASS : reason);
    expectNoWrites(deps);
  });

  it('does not block a Clockwatcher during a timestop', async () => {
    const { deps } = happyDeps({ game: createFakeGame({ Game_ID: 1, GAME_STATE: GAMESTATES.TIMESTOPPED }) });
    // the actor really is a Clockwatcher: this fixture had no Classes
    // mock, so the gate saw no class and blocked them
    deps.models.Classes.findByPk = jest.fn(async () => createFakeClass({ Class_Name: 'Clockwatcher' }));
    const result = await logic.run(INPUT, deps);
    // the gate now consults the actor's class, so a timestop does not
    // stop a Clockwatcher; whatever the command decides next is its own
    // business (often its own class gate)
    expect(result.reason).not.toBe(REJECTIONS.TIME_STOPPED);
    // the Classes lookup existed only for the Hunter check inside the
    // unported attack loop, so no class is fetched at all any more
    // the class IS consulted now - that is the whole fix
    expect(deps.models.Classes.findByPk).toHaveBeenCalled();
    expectNoWrites(deps);
  });

  it('rejects an attacker one AP short of the flat 4 AP cost (boundary: one short)', async () => {
    const { deps } = happyDeps({
      player: createFakePlayer({ Player_ID: 1, Discord_ID: ATTACKER, Action_Points: 3, Range_: 3, Tile_ID: 1 }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.NOT_ENOUGH_AP });
    // the legacy wording, kept byte-identical - punish still talks about shooting
    expect(logic.present(result)).toEqual({ content: "You don't have enough AP to shoot that much!" });
    expectNoWrites(deps);
  });

  it('passes the AP gate with exactly 4 AP (boundary: exact)', async () => {
    const { deps } = happyDeps({
      player: createFakePlayer({ Player_ID: 1, Discord_ID: ATTACKER, Action_Points: 4, Range_: 3, Tile_ID: 1 }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result.reason).not.toBe(REJECTIONS.NOT_ENOUGH_AP);
    expect(result.reason).toBe(REJECTIONS.WRONG_CLASS);
    expectNoWrites(deps);
  });

  it('rejects a mention that is not a registered player', async () => {
    const { deps } = happyDeps({ targetPlayer: null });
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.TARGET_NOT_IN_GAME });
    expect(logic.present(result)).toEqual({ content: 'That mention does not correspond to a player registered in that game!' });
    expectNoWrites(deps);
  });

  it('rejects a missing target id', async () => {
    const { deps } = happyDeps();
    const result = await logic.run({ ...INPUT, targetDiscordId: null }, deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.TARGET_NOT_IN_GAME });
    expectNoWrites(deps);
  });

  it('rejects a target who is not on the tile provided', async () => {
    const { deps } = happyDeps({
      targetPlayer: createFakePlayer({ Player_ID: 2, Discord_ID: TARGET, Tile_ID: 99 }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.TARGET_NOT_ON_TILE });
    expect(logic.present(result)).toEqual({ content: 'That player isnt on that tile!' });
    expectNoWrites(deps);
  });

  it('accepts a tile exactly at max range (boundary: exact)', async () => {
    const { deps } = happyDeps();
    const result = await logic.run({ ...INPUT, x: 4, y: 1 }, deps);
    expect(result.reason).not.toBe(REJECTIONS.OUT_OF_RANGE);
    expect(result.reason).toBe(REJECTIONS.WRONG_CLASS);
    expectNoWrites(deps);
  });

  it('rejects a tile one beyond max range with the legacy distance message (boundary: one beyond)', async () => {
    const { deps } = happyDeps();
    const result = await logic.run({ ...INPUT, x: 5, y: 1 }, deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.OUT_OF_RANGE });
    expect(logic.present(result)).toEqual({ content: 'That tile is 1 tiles out of range!' });
    expectNoWrites(deps);
  });

  it('rejects the punish itself: the class is unimplemented, and nothing is written or charged', async () => {
    const { deps } = happyDeps();
    const result = await logic.run(INPUT, deps);
    expect(result).toEqual({ ok: false, reason: REJECTIONS.WRONG_CLASS, data: { className: 'Punisher' } });
    // no AP is deducted: the legacy AP update sat after the loop that always threw
    expectNoWrites(deps);
  });
});

describe('punish.run preserved quirks', () => {
  // was: looked up by Discord_ID alone, so a player registered only in
  // another game could be named as the target
  it('scopes the target lookup to this game', async () => {
    const { deps } = happyDeps();
    await logic.run(INPUT, deps);
    expect(deps.models.Players.findOne).toHaveBeenCalledWith({
      where: { Discord_ID: TARGET, Game_ID: 1 },
    });
  });

  it('always reads the attacker Tile_ID, never Tile_ID2: the body option was never declared', async () => {
    const { deps } = happyDeps({
      player: createFakePlayer({ Player_ID: 1, Discord_ID: ATTACKER, Action_Points: 5, Range_: 3, Tile_ID: 1, Tile_ID2: 77 }),
    });
    await logic.run(INPUT, deps);
    expect(deps.models.Tiles.findByPk).toHaveBeenCalledWith(1);
    expect(deps.models.Tiles.findByPk).not.toHaveBeenCalledWith(77);
  });

  it('resolves the default game via getOldestGameId, passing the attacker discord id', async () => {
    const { deps } = happyDeps();
    deps.utils = { ...deps.utils, getOldestGameId: jest.fn(async () => 1) };
    const result = await logic.run({ ...INPUT, gameId: null }, deps);
    expect(deps.utils.getOldestGameId).toHaveBeenCalledWith(ATTACKER);
    expect(result.reason).toBe(REJECTIONS.WRONG_CLASS);
  });
});

describe('punish.present', () => {
  it.each([
    [REJECTIONS.WRONG_CLASS, { className: 'Punisher' }, 'You are not a Punisher!'],
    [REJECTIONS.NO_SUCH_TILE, undefined, 'That tile is not on the board!'],
    [REJECTIONS.NOT_IN_GAME, undefined, 'Player not found in game!, please register for the game you wish to play in.'],
    [REJECTIONS.GAME_OVER, undefined, "Game is over! only the dev can use commands for this game at this time.\n Please register on a new game."],
    [REJECTIONS.GAME_PAUSED, undefined, 'Game is paused! only the dev can use commands for this game at this time.'],
    [REJECTIONS.TIME_STOPPED, undefined, 'Time is stopped! only Clockwatchers can use commands at this time.'],
    [REJECTIONS.NO_SUCH_GAME, { gameId: 3 }, 'Could not find game #3!'],
  ])('renders %s as non-empty player-facing text', (reason, data, expected) => {
    const out = logic.present({ ok: false, reason, data });
    expect(out).toEqual({ content: expected });
    expect(out.content.length).toBeGreaterThan(0);
  });

  it('passes a carried legacy message straight through', () => {
    const out = logic.present({ ok: false, reason: REJECTIONS.OUT_OF_RANGE, data: { message: 'That tile is 2 tiles out of range!' } });
    expect(out).toEqual({ content: 'That tile is 2 tiles out of range!' });
  });
});

describe('punish adapter (smoke)', () => {
  it('exports the command contract', () => {
    expect(punish.data.toJSON().name).toBe('punish');
    expect(typeof punish.execute).toBe('function');
  });
});

describe('punish.run as an actual Punisher', () => {
  // The class exists now. Its ability comes straight from the command's own
  // description: damage equal to what the target has wasted.
  function punisherDeps(over = {}) {
    const { deps, ...rest } = happyDeps(over);
    deps.models.Classes.findByPk = jest.fn(async () => createFakeClass({ Class_Name: 'Punisher' }));
    deps.utils = { ...deps.utils, damagePlayer: jest.fn(async () => ({})) };
    return { deps, ...rest };
  }

  it('deals the target their missed AP plus missed HP, and charges 4 AP', async () => {
    const { deps } = punisherDeps({
      targetPlayer: createFakePlayer({
        Player_ID: 2, Discord_ID: TARGET, Tile_ID: 42, MISSED_AP: 4, MISSED_HP: 3,
      }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({ ok: true, kind: 'punished' });
    expect(result.data).toMatchObject({ damage: 7, missedAp: 4, missedHp: 3 });
    expect(deps.utils.damagePlayer).toHaveBeenCalledWith(
      expect.anything(), expect.objectContaining({ Player_ID: 2 }), 7, 1,
    );
    expect(deps.models.Players.update).toHaveBeenCalledWith(
      { Action_Points: expect.any(Number) },
      { where: { Player_ID: 1, Game_ID: 1 } },
    );
  });

  it('a target who has wasted nothing takes no damage, and no damage call is made', async () => {
    const { deps } = punisherDeps({
      targetPlayer: createFakePlayer({
        Player_ID: 2, Discord_ID: TARGET, Tile_ID: 42, MISSED_AP: 0, MISSED_HP: 0,
      }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result.ok).toBe(true);
    expect(result.data.damage).toBe(0);
    expect(deps.utils.damagePlayer).not.toHaveBeenCalled();
  });

  it('still rejects a player who is not a Punisher', async () => {
    const { deps } = happyDeps();
    deps.models.Classes.findByPk = jest.fn(async () => createFakeClass({ Class_Name: 'Sniper' }));
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.WRONG_CLASS });
  });

  it('renders the breakdown so the target can see why', () => {
    const out = logic.present({
      ok: true,
      kind: 'punished',
      data: { targetDiscordId: TARGET, damage: 7, missedAp: 4, missedHp: 3, x: 4, y: 7 },
    });
    expect(out.content).toBe(
      `You punished <@${TARGET}> at 4,7 for 7 damage (4 missed AP + 3 missed HP)!`,
    );
  });
});
