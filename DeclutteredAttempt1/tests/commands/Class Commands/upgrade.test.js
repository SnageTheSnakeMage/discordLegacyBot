/**
 * /upgrade - logic tests. Plain data in, plain data out: no jest.mock, no
 * discord.js, no interaction. deps carries fake models; the pricing maths is
 * the real utils.
 */
const logic = require('../../../commands/Class Commands/upgrade.logic.js');
const upgrade = require('../../../commands/Class Commands/upgrade.js');
const { GAMESTATES, REJECTIONS } = require('../../../enums.js');
const { createDeps, createFakeClass, createFakeGame, createFakePlayer } = require('../../helpers/mockModels.js');

const ACTOR = '123';

/** a player who can afford a first step on any of the three ladders */
function basePlayer(over = {}) {
  return createFakePlayer({
    Player_ID: 7,
    Discord_ID: ACTOR,
    Action_Points: 20,
    Health_Points: 5,
    MAX_HP: 10,
    Health_Points2: 4,
    Range_: 2,
    MAX_RANGE: 5,
    Range2: 1,
    Damage: 1,
    MAX_DAMAGE: 3,
    Damage2: 1,
    HP_COST: 4,
    RANGE_COST: 4,
    DAMAGE_COST: 12,
    ...over,
  });
}

/** deps for the happy path; override player/game per test */
function makeDeps({ player = basePlayer(), game = createFakeGame({ GAME_STATE: GAMESTATES.ACTIVE }) } = {}) {
  return createDeps({
    models: {
      Games: { findByPk: async () => game },
      Players: { findOne: async () => player },
    },
  });
}

const INPUT = { stat: 'Health_Points', amount: 1, gameId: 1, body: 1, discordId: ACTOR };

describe('upgrade.parse', () => {
  it('maps raw options and applies defaults', () => {
    const input = logic.parse({ stat: 'Damage', amount: null, game: null, body: null }, { discordId: ACTOR, username: 'snage' });
    expect(input).toEqual({ stat: 'Damage', amount: 1, gameId: null, body: 1, discordId: ACTOR });
  });

  it('keeps explicit amount, game and body 2', () => {
    const input = logic.parse({ stat: 'Range_', amount: 3, game: 4, body: 2 }, { discordId: ACTOR, username: 'snage' });
    expect(input).toEqual({ stat: 'Range_', amount: 3, gameId: 4, body: 2, discordId: ACTOR });
  });

  it('coerces any body that is not 2 to body 1', () => {
    expect(logic.parse({ stat: 'Damage', body: 1 }, { discordId: ACTOR }).body).toBe(1);
    expect(logic.parse({ stat: 'Damage', body: 7 }, { discordId: ACTOR }).body).toBe(1);
  });
});

describe('upgrade.run rejections', () => {
  it('rejects an unknown game and writes nothing', async () => {
    const deps = makeDeps();
    deps.models.Games.findByPk = jest.fn(async () => null);
    const result = await logic.run(INPUT, deps);
    expect(result).toEqual({ ok: false, reason: REJECTIONS.NO_SUCH_GAME, data: { gameId: 1 } });
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  it('rejects a player who is not in the game and writes nothing', async () => {
    const deps = makeDeps();
    deps.models.Players.findOne = jest.fn(async () => null);
    const result = await logic.run(INPUT, deps);
    expect(result.reason).toBe(REJECTIONS.NOT_IN_GAME);
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  it('rejects a dead player and writes nothing', async () => {
    const deps = makeDeps({ player: basePlayer({ Dead: true }) });
    const result = await logic.run(INPUT, deps);
    expect(result.reason).toBe(REJECTIONS.PLAYER_DEAD);
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  // the gamestate table: every state has a defined outcome; adding a state
  // without deciding its gate breaks this test
  const GAMESTATE_TABLE = [
    [GAMESTATES.ACTIVE, null],
    [GAMESTATES.REGISTRATION, null],
    [GAMESTATES.INACTIVE, null],
    [GAMESTATES.SANDBOX, null],
    [GAMESTATES.FINALE, null],
    [GAMESTATES.OVER, REJECTIONS.GAME_OVER],
    [GAMESTATES.DEV_PAUSED, REJECTIONS.GAME_PAUSED],
    [GAMESTATES.TIMESTOPPED, REJECTIONS.TIME_STOPPED],
  ];

  it('covers every gamestate in the enum', () => {
    expect(GAMESTATE_TABLE.map(([state]) => state).sort()).toEqual(Object.values(GAMESTATES).sort());
  });

  it.each(GAMESTATE_TABLE)('gamestate %s -> %s', async (state, reason) => {
    const deps = makeDeps({ game: createFakeGame({ GAME_STATE: state }) });
    const result = await logic.run(INPUT, deps);
    if (reason === null) {
      expect(result.ok).toBe(true);
    } else {
      expect(result).toMatchObject({ ok: false, reason });
      expect(deps.models.Players.update).not.toHaveBeenCalled();
    }
  });

  it('rejects one AP short of the price, and says how much is missing', async () => {
    // HP_COST 4 -> first step costs 4
    const deps = makeDeps({ player: basePlayer({ Action_Points: 3 }) });
    const result = await logic.run(INPUT, deps);
    expect(result.reason).toBe(REJECTIONS.NOT_ENOUGH_AP);
    expect(result.data.message).toBe("You don't have enough AP to upgrade that much!\n You need 1 more AP.");
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  it('accepts exactly enough AP for the price', async () => {
    const deps = makeDeps({ player: basePlayer({ Action_Points: 4 }) });
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({ ok: true, data: { price: 4 } });
    expect(deps.models.Players.update).toHaveBeenCalledWith(
      { Action_Points: 0 }, { where: { Player_ID: 7 } },
    );
  });

  it('accepts an upgrade that lands exactly on the cap', async () => {
    const deps = makeDeps({ player: basePlayer({ Health_Points: 9, MAX_HP: 10 }) });
    const result = await logic.run(INPUT, deps);
    expect(result.ok).toBe(true);
  });

  it('rejects an upgrade one step past the health cap and writes nothing', async () => {
    const deps = makeDeps({ player: basePlayer({ Health_Points: 9, MAX_HP: 10 }) });
    const result = await logic.run({ ...INPUT, amount: 2 }, deps);
    expect(result.reason).toBe(REJECTIONS.INVALID_AMOUNT);
    expect(result.data.message).toBe("You can't upgrade your health past 10! Unless you kill some people :)");
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  it('rejects past the range cap with the legacy (space-less) wording', async () => {
    const deps = makeDeps({ player: basePlayer({ Range_: 5, MAX_RANGE: 5 }) });
    const result = await logic.run({ ...INPUT, stat: 'Range_' }, deps);
    expect(result.reason).toBe(REJECTIONS.INVALID_AMOUNT);
    expect(result.data.message).toBe("You can't upgrade your range past5! Unless you kill some people :)");
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  it('rejects past the damage cap with the legacy (space-less) wording', async () => {
    const deps = makeDeps({ player: basePlayer({ Damage: 3, MAX_DAMAGE: 3 }) });
    const result = await logic.run({ ...INPUT, stat: 'Damage' }, deps);
    expect(result.reason).toBe(REJECTIONS.INVALID_AMOUNT);
    expect(result.data.message).toBe("You can't upgrade your damage past3! Unless you kill some people :)");
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });
});

describe('upgrade.run faults (thrown, not rejected)', () => {
  it('throws when the HP cost is off the ladder', async () => {
    const deps = makeDeps({ player: basePlayer({ HP_COST: 6 }) });
    await expect(logic.run(INPUT, deps)).rejects.toThrow('Incorrect initial range and/or health cost for player');
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  it('throws when the range cost is off the ladder', async () => {
    const deps = makeDeps({ player: basePlayer({ RANGE_COST: 0 }) });
    await expect(logic.run({ ...INPUT, stat: 'Range_' }, deps)).rejects.toThrow('Incorrect initial range and/or health cost for player');
  });

  it('throws when the damage cost is off the ladder', async () => {
    const deps = makeDeps({ player: basePlayer({ DAMAGE_COST: 8 }) });
    await expect(logic.run({ ...INPUT, stat: 'Damage' }, deps)).rejects.toThrow('Incorrect initial damage cost for player');
  });

  it('throws on a stat outside the three choices', async () => {
    const deps = makeDeps();
    await expect(logic.run({ ...INPUT, stat: 'Luck' }, deps)).rejects.toThrow('Unknown stat to upgrade: Luck');
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });
});

describe('upgrade.run success', () => {
  it('buys one health with exact write payloads', async () => {
    const deps = makeDeps();
    const result = await logic.run(INPUT, deps);
    expect(result).toEqual({
      ok: true,
      kind: 'upgraded',
      data: { stat: 'Health_Points', amount: 1, price: 4, body: 1, statColumn: 'Health_Points', newCost: 5, playerId: 7 },
    });
    expect(deps.models.Players.update).toHaveBeenCalledWith({ Action_Points: 16 }, { where: { Player_ID: 7 } });
    expect(deps.models.Players.update).toHaveBeenCalledWith({ Health_Points: 6 }, { where: { Player_ID: 7 } });
    expect(deps.models.Players.update).toHaveBeenCalledWith({ HP_COST: 5 }, { where: { Player_ID: 7 } });
    expect(deps.models.Players.update).toHaveBeenCalledTimes(3);
  });

  it('buys one range with exact write payloads', async () => {
    const deps = makeDeps();
    const result = await logic.run({ ...INPUT, stat: 'Range_' }, deps);
    expect(result).toMatchObject({ ok: true, data: { price: 4, statColumn: 'Range_', newCost: 5 } });
    expect(deps.models.Players.update).toHaveBeenCalledWith({ Action_Points: 16 }, { where: { Player_ID: 7 } });
    expect(deps.models.Players.update).toHaveBeenCalledWith({ Range_: 3 }, { where: { Player_ID: 7 } });
    expect(deps.models.Players.update).toHaveBeenCalledWith({ RANGE_COST: 5 }, { where: { Player_ID: 7 } });
  });

  it('buys one damage with exact write payloads', async () => {
    const deps = makeDeps();
    const result = await logic.run({ ...INPUT, stat: 'Damage' }, deps);
    expect(result).toMatchObject({ ok: true, data: { price: 12, statColumn: 'Damage', newCost: 14 } });
    expect(deps.models.Players.update).toHaveBeenCalledWith({ Action_Points: 8 }, { where: { Player_ID: 7 } });
    expect(deps.models.Players.update).toHaveBeenCalledWith({ Damage: 2 }, { where: { Player_ID: 7 } });
    expect(deps.models.Players.update).toHaveBeenCalledWith({ DAMAGE_COST: 14 }, { where: { Player_ID: 7 } });
  });

  it('prices damage at the second and third rungs (the old helper could not reach them)', async () => {
    const at14 = makeDeps({ player: basePlayer({ DAMAGE_COST: 14 }) });
    expect((await logic.run({ ...INPUT, stat: 'Damage' }, at14)).data).toMatchObject({ price: 14, newCost: 16 });

    const at16 = makeDeps({ player: basePlayer({ DAMAGE_COST: 16 }) });
    const result = await logic.run({ ...INPUT, stat: 'Damage' }, at16);
    expect(result.data).toMatchObject({ price: 16, newCost: 16 });
    expect(at16.models.Players.update).toHaveBeenCalledWith({ DAMAGE_COST: 16 }, { where: { Player_ID: 7 } });
  });

  it('writes the body-2 column when body is 2, paying from the shared AP', async () => {
    const deps = makeDeps();
    const result = await logic.run({ ...INPUT, body: 2 }, deps);
    expect(result.data).toMatchObject({ body: 2, statColumn: 'Health_Points2' });
    expect(deps.models.Players.update).toHaveBeenCalledWith({ Action_Points: 16 }, { where: { Player_ID: 7 } });
    expect(deps.models.Players.update).toHaveBeenCalledWith({ Health_Points2: 5 }, { where: { Player_ID: 7 } });
    expect(deps.models.Players.update).toHaveBeenCalledWith({ HP_COST: 5 }, { where: { Player_ID: 7 } });
  });

  it('resolves the default game via getOldestActiveGameId when no game is given', async () => {
    const deps = makeDeps();
    deps.utils = { ...deps.utils, getOldestActiveGameId: jest.fn(async () => 1) };
    const result = await logic.run({ ...INPUT, gameId: null }, deps);
    expect(result.ok).toBe(true);
    expect(deps.utils.getOldestActiveGameId).toHaveBeenCalledWith(ACTOR);
  });
});

describe('upgrade.run preserved quirks', () => {
  it('advances the cost ladder exactly one rung however many steps are bought', async () => {
    const deps = makeDeps();
    const result = await logic.run({ ...INPUT, amount: 3 }, deps);
    // three steps at once cost 4 + 5 + 7, but HP_COST moves 4 -> 5 only
    expect(result.data).toMatchObject({ price: 16, newCost: 5 });
    expect(deps.models.Players.update).toHaveBeenCalledWith({ Health_Points: 8 }, { where: { Player_ID: 7 } });
    expect(deps.models.Players.update).toHaveBeenCalledWith({ HP_COST: 5 }, { where: { Player_ID: 7 } });
  });

  it('keeps the cost at the top of the ladder, at utils\' own scaled price', async () => {
    // utils.getHPAndRangePriceScaled(4) is 4+5+7+(10*4-3) = 53, so the fourth
    // rung prices at 53 - 16 = 37 rather than 10; that maths lives in utils
    // and is preserved untouched
    const deps = makeDeps({ player: basePlayer({ HP_COST: 10, Action_Points: 40 }) });
    const result = await logic.run(INPUT, deps);
    expect(result.data).toMatchObject({ price: 37, newCost: 10 });
    expect(deps.models.Players.update).toHaveBeenCalledWith({ Action_Points: 3 }, { where: { Player_ID: 7 } });
    expect(deps.models.Players.update).toHaveBeenCalledWith({ HP_COST: 10 }, { where: { Player_ID: 7 } });
  });

  it('checks the body-1 stat against the cap even when buying for body 2', async () => {
    const deps = makeDeps({ player: basePlayer({ Health_Points: 10, MAX_HP: 10, Health_Points2: 1 }) });
    const result = await logic.run({ ...INPUT, body: 2 }, deps);
    expect(result.reason).toBe(REJECTIONS.INVALID_AMOUNT);
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  it('does not block a Clockwatcher during a timestop', async () => {
    const deps = makeDeps({ game: createFakeGame({ GAME_STATE: GAMESTATES.TIMESTOPPED }) });
    // the actor really is a Clockwatcher: this fixture had no Classes
    // mock, so the gate saw no class and blocked them
    deps.models.Classes.findByPk = jest.fn(async () => createFakeClass({ Class_Name: 'Clockwatcher' }));
    const result = await logic.run(INPUT, deps);
    // the gate now consults the actor's class, so a timestop does not
    // stop a Clockwatcher; whatever the command decides next is its own
    // business (often its own class gate)
    expect(result.reason).not.toBe(REJECTIONS.TIME_STOPPED);
    // the command never even loads the player's class
    // the class IS consulted now - that is the whole fix
    expect(deps.models.Classes.findByPk).toHaveBeenCalled();
  });
});

describe('upgrade.present', () => {
  it('renders success with stat, amount and price', () => {
    const out = logic.present({
      ok: true,
      kind: 'upgraded',
      data: { stat: 'Health_Points', amount: 2, price: 9, body: 1, statColumn: 'Health_Points', newCost: 5, playerId: 7 },
    });
    expect(out).toEqual({ content: 'Successfully upgraded Health_Points by 2 for 9 AP!' });
  });

  it('renders a rejection with no data from the shared message table', () => {
    expect(logic.present({ ok: false, reason: REJECTIONS.PLAYER_DEAD }))
      .toEqual({ content: "Dead players can't use this command." });
  });

  it.each([
    [REJECTIONS.NO_SUCH_GAME, { gameId: 3 }],
    [REJECTIONS.NOT_IN_GAME, undefined],
    [REJECTIONS.PLAYER_DEAD, undefined],
    [REJECTIONS.GAME_OVER, undefined],
    [REJECTIONS.GAME_PAUSED, undefined],
    [REJECTIONS.TIME_STOPPED, undefined],
    [REJECTIONS.NOT_ENOUGH_AP, { message: "You don't have enough AP to upgrade that much!\n You need 1 more AP." }],
    [REJECTIONS.INVALID_AMOUNT, { message: "You can't upgrade your health past 10! Unless you kill some people :)" }],
  ])('every rejection this command can return renders non-empty text (%s)', (reason, data) => {
    const out = logic.present({ ok: false, reason, data });
    expect(typeof out.content).toBe('string');
    expect(out.content.length).toBeGreaterThan(0);
    expect(out.content).not.toMatch(/undefined/);
  });
});

describe('upgrade adapter (smoke)', () => {
  it('exports the command contract', () => {
    expect(upgrade.data.toJSON().name).toBe('upgrade');
    expect(typeof upgrade.execute).toBe('function');
  });
});
