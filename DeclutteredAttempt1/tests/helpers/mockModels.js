/**
 * Test fixtures and the deps factory for command logic tests.
 *
 * Every fake-row factory mirrors the REAL columns declared in
 * database/Models/*.js - no model uses a Sequelize `field:` mapping, so the
 * attribute name IS the column name. A fixture with an invented column makes
 * a test pass against code that would fail on the real database (the #79 bug
 * class), so add fields here only after checking the model file.
 *
 * Tests never call jest.mock: they build a deps object with createDeps()
 * and pass it to run(input, deps). Only the pieces a test overrides are
 * fake; everything else is the real utils logic.
 */
const { GAMESTATES } = require('../../enums.js');

/** Mock Sequelize model: every accessor is a jest.fn you can program. */
function createMockModel() {
  return {
    findByPk: jest.fn(),
    findOne: jest.fn(),
    findAll: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    update: jest.fn().mockResolvedValue([1]),
    destroy: jest.fn(),
    count: jest.fn(),
  };
}

/** Full mock models object matching utils.models shape. */
function createMockModels(overrides = {}) {
  const models = {
    Games: createMockModel(),
    Players: createMockModel(),
    Tiles: createMockModel(),
    Classes: createMockModel(),
    Layers: createMockModel(),
  };
  for (const [name, methods] of Object.entries(overrides)) {
    Object.assign(models[name], methods);
  }
  return models;
}

/**
 * Complete deps object for run(input, deps): REAL utils logic over FAKE
 * models, with deterministic now/random. Override only what the test needs:
 *
 *   const deps = createDeps({ models: { Players: { findOne: async () => player } } });
 *
 * Model overrides may be plain async functions or jest.fn()s; they are
 * wrapped in jest.fn so call assertions always work.
 */
function createDeps(overrides = {}) {
  const models = createMockModels();
  if (overrides.models) {
    for (const [name, methods] of Object.entries(overrides.models)) {
      for (const [method, fn] of Object.entries(methods)) {
        models[name][method] = jest.isMockFunction(fn) ? fn : jest.fn(fn);
      }
    }
  }
  const utils = require('../../utils.js');
  const deps = {
    models,
    // real utils, but any DB call inside utils goes through the fake models
    // when the logic passes deps.models explicitly; utils' own module-level
    // models are only reached by legacy paths integration tests cover.
    utils,
    now: overrides.now || (() => 1700000000000),
    random: overrides.random || (() => 0),
  };
  if (overrides.utils) deps.utils = { ...utils, ...overrides.utils };
  return deps;
}

/** Games row - real columns only (see database/Models/Games.js). */
function createFakeGame(overrides = {}) {
  return {
    Game_ID: 1,
    GAME_STATE: GAMESTATES.ACTIVE,
    AP_INTERVAL_MIN: 720,
    CHEST_AMOUNT: 0,
    LAST_CHEST_GIVER: null,
    CURR_CC_EVENT: 'BOOOORRRINNNG',
    NEXT_CC_EVENT: null,
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
    timestopTurns: 0,
    lastAPDistributionTimestampInMS: 0,
    APAmount: 4,
    immutableDoomsday: 32,
    deadChatChannelId: null,
    currentChaosPollMsgId: null,
    overrider: null,
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

/** Players row - real columns only (see database/Models/Players.js). */
function createFakePlayer(overrides = {}) {
  return {
    Player_ID: 1,
    Class_ID: 1,
    Game_ID: 1,
    Action_Points: 5,
    MAX_AP: 10,
    MISSED_AP: 0,
    Health_Points: 10,
    MAX_HP: 10,
    MISSED_HP: 0,
    Damage: 1,
    MAX_DAMAGE: 3,
    Range_: 3,
    MAX_RANGE: 5,
    Tile_ID: 1,
    Discord_ID: '123',
    Kills: 0,
    HP_COST: 4,
    RANGE_COST: 4,
    DAMAGE_COST: 8,
    Dead: false,
    Tile_ID2: null,
    DMG_BUFF: 0,
    Free_Move: 0,
    Hitman_Target: null,
    Health_Points2: null,
    Free_Move2: 0,
    Pharoh_HP: 0,
    cCOverides: 1,
    Damage2: null,
    Range2: null,
    MarkedForDeath: false,
    Meals: 0,
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

/** Classes row - real columns only (see database/Models/Classes.js). */
function createFakeClass(overrides = {}) {
  return {
    Class_ID: 1,
    Class_Name: 'Average',
    Start_AP: 4,
    Start_MAX_AP: 10,
    Start_HP: 10,
    Start_MAX_HP: 10,
    Start_Range_: 3,
    Start_MAX_Range_: 5,
    Start_Damage: 1,
    Start_MAX_Damage: 3,
    Role_Color: 'ffffff',
    Description: 'Basic class',
    ...overrides,
  };
}

/** Tiles row - real columns only (see database/Models/Tiles.js). */
function createFakeTile(overrides = {}) {
  return {
    Tile_ID: 1,
    Layer_ID: 1,
    Tile_Type: 'Blank1',
    Player1: null,
    Player2: null,
    Player3: null,
    Player4: null,
    X_Position: 1,
    Y_Position: 1,
    trapped: false,
    trapper: null,
    save: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

/** Layers row - real columns only (see database/Models/Layers.js). */
function createFakeLayer(overrides = {}) {
  return {
    Layer_ID: 1,
    Game_ID: 1,
    Layer_Above: null,
    Layer_Below: null,
    X_Bound: 10,
    Y_Bound: 10,
    ...overrides,
  };
}

/**
 * Minimal fake ChatInputCommandInteraction, for ADAPTER tests only - logic
 * tests never need one. options is a plain object keyed by option name;
 * users are { id, username }.
 */
function createFakeInteraction({ options = {}, user = { id: '123', username: 'tester' } } = {}) {
  const pick = (name) => (options[name] === undefined ? null : options[name]);
  return {
    user,
    deferred: false,
    replied: false,
    options: {
      getInteger: jest.fn(pick),
      getNumber: jest.fn(pick),
      getString: jest.fn(pick),
      getBoolean: jest.fn(pick),
      getUser: jest.fn((name) => pick(name)),
    },
    deferReply: jest.fn(async function () { this.deferred = true; }),
    reply: jest.fn(async function () { this.replied = true; }),
    editReply: jest.fn().mockResolvedValue(undefined),
    followUp: jest.fn().mockResolvedValue(undefined),
  };
}

module.exports = {
  createMockModel,
  createMockModels,
  createDeps,
  createFakeGame,
  createFakePlayer,
  createFakeClass,
  createFakeTile,
  createFakeLayer,
  createFakeInteraction,
};
