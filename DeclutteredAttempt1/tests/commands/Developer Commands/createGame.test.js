/**
 * /create-game - logic tests. Plain data in, plain data out: no jest.mock, no
 * discord.js, no interaction. deps carries fake models; utils logic is real.
 */
const logic = require('../../../commands/Developer Commands/createGame.logic.js');
const createGame = require('../../../commands/Developer Commands/createGame.js');
const { GAMESTATES, REJECTIONS } = require('../../../enums.js');
const { createDeps, createFakeGame } = require('../../helpers/mockModels.js');

const DEV = '123';

/** deps for the happy path; override per test */
function happyDeps(over = {}) {
  return createDeps({
    models: {
      Games: {
        create: async () => createFakeGame({ Game_ID: over.newGameId || 7 }),
        count: async () => (over.count === undefined ? 7 : over.count),
      },
    },
  });
}

/** every option omitted -> every legacy default */
const DEFAULT_INPUT = logic.parse({ isDev: true }, { discordId: DEV, username: 'snage' });

/** the Games row the defaults produce - column names from database/Models/Games.js */
const DEFAULT_ROW = {
  GAME_STATE: GAMESTATES.REGISTRATION,
  AP_INTERVAL_MIN: 720,
  CHEST_AMOUNT: 0,
  LAST_CHEST_GIVER: null,
  CURR_CC_EVENT: 'BOOOORRRINNNG',
  moveCost: 1,
  shootCost: 2,
  fireDmg: 1,
  mineDmg: 1,
  classBlacklist: '',
  classDupelicateMax: 2,
  maxIncreaseOnKill: 1,
  chaosCouncilBool: true,
  winner: null,
  finaleThreshold: 4,
  APAmount: 2,
  immutableDoomsday: 32,
};

describe('createGame.parse', () => {
  it('applies every legacy default when no option is supplied', () => {
    expect(logic.parse({}, { discordId: DEV, username: 'snage' })).toEqual({
      apDistributionInterval: 720,
      chestAmount: 0,
      currentChaosCouncilEvent: 'BOOOORRRINNNG',
      movementCost: 1,
      shootCost: 2,
      fireDamage: 1,
      mineDamage: 1,
      classBlacklist: '',
      chaosCouncilBoolean: true,
      classDupeLimit: 2,
      finalePlayerThreshold: 4,
      maxStatIncrease: 1,
      apAmount: 2,
      immutableDoomsday: 32,
      isDev: false,
      discordId: DEV,
    });
  });

  it('maps every supplied option onto its input field', () => {
    const raw = {
      'ap-distribution-interval': 60,
      'chest-amount': 12,
      'current-chaos-council-event': 'Blockade',
      'movement-cost': 3,
      'shoot-cost': 4,
      'fire-damage': 5,
      'mine-damage': 6,
      'class-blacklist': 'Twin,Oracle',
      'chaos-council-boolean': 0,
      'class-dupe-limit': 9,
      'max-stat-increase': 2,
      'finale-player-threshold': 8,
      'ap-amount': 11,
      'immutable-doomsday': 64,
      isDev: true,
    };
    expect(logic.parse(raw, { discordId: DEV, username: 'snage' })).toEqual({
      apDistributionInterval: 60,
      chestAmount: 12,
      currentChaosCouncilEvent: 'Blockade',
      movementCost: 3,
      shootCost: 4,
      fireDamage: 5,
      mineDamage: 6,
      classBlacklist: 'Twin,Oracle',
      chaosCouncilBoolean: 0,
      classDupeLimit: 9,
      finalePlayerThreshold: 8,
      maxStatIncrease: 2,
      apAmount: 11,
      immutableDoomsday: 64,
      isDev: true,
      discordId: DEV,
    });
  });

  it('absent options come back null from readOptions and still take the default', () => {
    const input = logic.parse({ 'ap-amount': null, 'chest-amount': null }, { discordId: DEV, username: 'snage' });
    expect(input.apAmount).toBe(2);
    expect(input.chestAmount).toBe(0);
  });

  // boundary: ?? not || - an explicit zero is kept, it does not fall back to
  // the default. This is the only numeric boundary this command has; there is
  // no AP spend and no range check to bound.
  it('keeps an explicit 0 rather than falling back to the default', () => {
    const input = logic.parse(
      { 'chest-amount': 0, 'movement-cost': 0, 'shoot-cost': 0, 'ap-amount': 0, 'immutable-doomsday': 0 },
      { discordId: DEV, username: 'snage' },
    );
    expect(input).toMatchObject({
      chestAmount: 0, movementCost: 0, shootCost: 0, apAmount: 0, immutableDoomsday: 0,
    });
  });

  // preserved quirk: the option is declared as an INTEGER but its default is
  // the boolean true, so omitting it writes true and supplying it writes a number
  it('defaults chaos-council-boolean to the boolean true and passes numbers through', () => {
    expect(logic.parse({}, { discordId: DEV }).chaosCouncilBoolean).toBe(true);
    expect(logic.parse({ 'chaos-council-boolean': 0 }, { discordId: DEV }).chaosCouncilBoolean).toBe(0);
  });

  // preserved quirk: the option description says "defaults to null"; the code
  // has always defaulted to the no-chaos event string
  it('defaults the chaos council event to BOOOORRRINNNG, not null', () => {
    expect(logic.parse({}, { discordId: DEV }).currentChaosCouncilEvent).toBe('BOOOORRRINNNG');
  });
});

describe('createGame.run rejections', () => {
  it('rejects a non-dev caller and writes nothing', async () => {
    const deps = happyDeps();
    const result = await logic.run({ ...DEFAULT_INPUT, isDev: false }, deps);
    expect(result).toEqual({ ok: false, reason: REJECTIONS.NOT_DEV });
    expect(deps.models.Games.create).not.toHaveBeenCalled();
    expect(deps.models.Games.update).not.toHaveBeenCalled();
  });

  it('treats a missing isDev flag as not-dev', async () => {
    const deps = happyDeps();
    const input = { ...DEFAULT_INPUT };
    delete input.isDev;
    const result = await logic.run(input, deps);
    expect(result.reason).toBe(REJECTIONS.NOT_DEV);
    expect(deps.models.Games.create).not.toHaveBeenCalled();
  });
});

describe('createGame.run gamestate', () => {
  // create-game has no gamestate gate: it is dev-only and its whole job is to
  // mint a new REGISTRATION game. The table below pins that - whatever state
  // any existing game is in, the command still creates a REGISTRATION game
  // and is never blocked. A new GAMESTATES value fails here if that changes.
  it.each(Object.values(GAMESTATES))('is not gated by an existing game in %s', async (state) => {
    const deps = happyDeps();
    deps.models.Games.findByPk = jest.fn(async () => createFakeGame({ GAME_STATE: state }));
    deps.models.Games.findAll = jest.fn(async () => [createFakeGame({ GAME_STATE: state })]);

    const result = await logic.run(DEFAULT_INPUT, deps);

    expect(result.ok).toBe(true);
    expect(deps.models.Games.create).toHaveBeenCalledTimes(1);
    expect(deps.models.Games.create.mock.calls[0][0].GAME_STATE).toBe(GAMESTATES.REGISTRATION);
  });
});

describe('createGame.run success', () => {
  it('creates the game with the exact default payload', async () => {
    const deps = happyDeps({ count: 7 });
    const result = await logic.run(DEFAULT_INPUT, deps);

    expect(result).toEqual({ ok: true, kind: 'gameCreated', data: { gameCount: 7 } });
    expect(deps.models.Games.create).toHaveBeenCalledWith(DEFAULT_ROW);
    expect(deps.models.Games.create).toHaveBeenCalledTimes(1);
  });

  it('creates the game with the exact supplied payload', async () => {
    const deps = happyDeps({ count: 3 });
    const input = logic.parse({
      'ap-distribution-interval': 60,
      'chest-amount': 12,
      'current-chaos-council-event': 'Blockade',
      'movement-cost': 3,
      'shoot-cost': 4,
      'fire-damage': 5,
      'mine-damage': 6,
      'class-blacklist': 'Twin,Oracle',
      'chaos-council-boolean': 0,
      'class-dupe-limit': 9,
      'max-stat-increase': 2,
      'finale-player-threshold': 8,
      'ap-amount': 11,
      'immutable-doomsday': 64,
      isDev: true,
    }, { discordId: DEV, username: 'snage' });

    const result = await logic.run(input, deps);

    expect(result.ok).toBe(true);
    expect(deps.models.Games.create).toHaveBeenCalledWith({
      GAME_STATE: GAMESTATES.REGISTRATION,
      AP_INTERVAL_MIN: 60,
      CHEST_AMOUNT: 12,
      LAST_CHEST_GIVER: null,
      CURR_CC_EVENT: 'Blockade',
      moveCost: 3,
      shootCost: 4,
      fireDmg: 5,
      mineDmg: 6,
      classBlacklist: 'Twin,Oracle',
      classDupelicateMax: 9,
      maxIncreaseOnKill: 2,
      chaosCouncilBool: 0,
      winner: null,
      finaleThreshold: 8,
      APAmount: 11,
      immutableDoomsday: 64,
    });
  });

  it('writes no column that does not exist on the Games model', async () => {
    const deps = happyDeps();
    await logic.run(DEFAULT_INPUT, deps);
    const written = Object.keys(deps.models.Games.create.mock.calls[0][0]).sort();
    expect(written).toEqual(Object.keys(DEFAULT_ROW).sort());
  });

  // preserved quirk: the number reported is Games.count() taken AFTER the
  // insert, i.e. how many games exist - not the new row's Game_ID
  it('reports the post-insert game count, not the new Game_ID', async () => {
    const deps = happyDeps({ newGameId: 99, count: 4 });
    const result = await logic.run(DEFAULT_INPUT, deps);
    expect(result.data.gameCount).toBe(4);
    expect(deps.models.Games.count).toHaveBeenCalled();
  });
});

describe('createGame.present', () => {
  it('renders success with the game count', () => {
    expect(logic.present({ ok: true, kind: 'gameCreated', data: { gameCount: 7 } }))
      .toEqual({ content: 'Game 7 created!' });
  });

  it('renders the non-dev rejection as its player-facing message', () => {
    expect(logic.present({ ok: false, reason: REJECTIONS.NOT_DEV }))
      .toEqual({ content: 'Only the dev can use this command.' });
  });

  it('every rejection this command can return renders non-empty text', () => {
    for (const reason of [REJECTIONS.NOT_DEV]) {
      const out = logic.present({ ok: false, reason });
      expect(typeof out.content).toBe('string');
      expect(out.content.length).toBeGreaterThan(0);
    }
  });
});

describe('createGame adapter (smoke)', () => {
  it('exports the command contract', () => {
    expect(createGame.data.toJSON().name).toBe('create-game');
    expect(typeof createGame.execute).toBe('function');
  });

  it('declares all fourteen options', () => {
    expect(createGame.data.toJSON().options.map((o) => o.name)).toEqual([
      'ap-distribution-interval',
      'chest-amount',
      'current-chaos-council-event',
      'movement-cost',
      'shoot-cost',
      'fire-damage',
      'mine-damage',
      'class-blacklist',
      'chaos-council-boolean',
      'class-dupe-limit',
      'max-stat-increase',
      'finale-player-threshold',
      'ap-amount',
      'immutable-doomsday',
    ]);
  });
});
