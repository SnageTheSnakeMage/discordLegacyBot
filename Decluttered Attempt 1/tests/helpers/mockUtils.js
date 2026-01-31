/**
 * Reusable mock factories for utils and Sequelize models in command tests.
 * Use with jest.mock('../../utils') and then assign these in beforeEach.
 */

/**
 * Creates mock Sequelize model methods (findByPk, findOne, findAll, update).
 * All return Jest mocks; call mockResolvedValue(...) in tests to control results.
 *
 * @returns {{ findByPk: jest.Mock, findOne: jest.Mock, findAll: jest.Mock, update: jest.Mock }}
 */
function createMockModel() {
  return {
    findByPk: jest.fn(),
    findOne: jest.fn(),
    findAll: jest.fn(),
    update: jest.fn().mockResolvedValue([1]),
  };
}

/**
 * Creates a full mock models object matching utils.models shape.
 * Override individual methods in tests: e.g. models.Games.findByPk.mockResolvedValue(game).
 *
 * @returns {{ Games: ReturnType<createMockModel>, Players: ReturnType<createMockModel>, Tiles: ReturnType<createMockModel>, Classes: ReturnType<createMockModel>, Layers: ReturnType<createMockModel> }}
 */
function createMockModels() {
  return {
    Games: createMockModel(),
    Players: createMockModel(),
    Tiles: createMockModel(),
    Classes: createMockModel(),
    Layers: createMockModel(),
  };
}

/**
 * Minimal game row for tests (active game).
 */
function createFakeGame(overrides = {}) {
  return {
    Game_ID: 1,
    GAME_STATE: 'ACTIVE',
    GAMESTATES: 'ACTIVE',
    shootCost: 1,
    moveCost: 1,
    AP_Amount: 5,
    AP_INTERVAL_MIN: 5,
    CURR_CC_EVENT: 'BOOOORRRINNNG',
    winner: null,
    ...overrides,
  };
}

/**
 * Minimal player row for tests.
 */
function createFakePlayer(overrides = {}) {
  return {
    Player_ID: 1,
    Game_ID: 1,
    Discord_ID: '123',
    Class_ID: 1,
    Tile_ID: 1,
    Tile_ID_2: null,
    Health_Points: 10,
    MAX_HP: 10,
    MISSED_HP: 0,
    Action_Points: 5,
    MAX_AP: 10,
    MISSED_AP: 0,
    Damage: 1,
    MAX_DMG: 1,
    Range_: 3,
    MAX_RANGE: 3,
    Dead: false,
    Free_Move: 0,
    DMG_BUFF: 0,
    Kills: 0,
    ...overrides,
  };
}

/**
 * Minimal class row for tests.
 */
function createFakeClass(overrides = {}) {
  return {
    Class_ID: 1,
    Class_Name: 'Soldier',
    Role_Color: 'ffffff',
    Description: 'Basic class',
    ...overrides,
  };
}

/**
 * Minimal tile row for tests.
 */
function createFakeTile(overrides = {}) {
  return {
    Tile_ID: 1,
    Layer_ID: 1,
    X_Position: 0,
    Y_Position: 0,
    Tile_Type: 'Blank1',
    ...overrides,
  };
}

/**
 * Minimal layer row for tests.
 */
function createFakeLayer(overrides = {}) {
  return {
    Layer_ID: 1,
    Game_ID: 1,
    X_Bound: 10,
    Y_Bound: 10,
    ...overrides,
  };
}

/**
 * Minimal utils mock for command tests. Provides models + common utils used by commands.
 * In tests, override: utils.getOldestActiveGameId.mockResolvedValue(1); utils.checkGameState.mockResolvedValue(false);
 */
function createUtilsMock() {
  const models = createMockModels();
  models.Player = models.Players;
  const gameObj = createFakeGame({ Game_ID: 1 });
  return {
    models,
    getOldestActiveGameId: jest.fn().mockResolvedValue(1),
    getOldestGamestateGameId: jest.fn().mockResolvedValue(1),
    getOldestActiveGame: jest.fn().mockResolvedValue(gameObj),
    getGame: jest.fn().mockResolvedValue(gameObj),
    checkGameState: jest.fn().mockResolvedValue(false),
    getTileCordinatesOfLine: jest.fn().mockReturnValue([[0, 0], [1, 1]]),
    getTileCordinatesOfPath: jest.fn().mockReturnValue([]),
    dbLayerIDtoCommonLayerID: jest.fn().mockReturnValue(1),
    commonLayerIDtoDbLayerID: jest.fn().mockResolvedValue(1),
    getUpgradePrice: jest.fn().mockResolvedValue(5),
    GAMESTATES: { ACTIVE: 'ACTIVE', REGISTRATION: 'REGISTRATION', OVER: 'OVER', DEV_PAUSED: 'DEV_PAUSED' },
  };
}

module.exports = {
  createMockModel,
  createMockModels,
  createFakeGame,
  createFakePlayer,
  createFakeClass,
  createFakeTile,
  createFakeLayer,
  createUtilsMock,
};
