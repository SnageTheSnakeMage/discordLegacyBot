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
    create: jest.fn(),
    count: jest.fn(),
    destroy: jest.fn(),
  };
}

/**
 * Creates a full mock models object matching utils.models shape.
 * Override individual methods in tests: e.g. await models.Games.findByPk.mockResolvedValue(game).
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
    Tile_ID2: null,
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
    X_Position: 1,
    Y_Position: 1,
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
function createFakeEmptyPlaystate() {
  return {
    game: createFakeGame(),
    layers: [createFakeLayer(), createFakeLayer({Layer_ID: 2})],
    tiles: createFakeTiles(11,2),
  };
}
function createFakeTiles(squareSize, layerSize) {
  var tiles = [];
  for(let l = 1; l < layerSize; l++){
  for (let x = 1; x < squareSize; x++) {
  for (let y = 1; y < squareSize; y++) {
    if( x % squareSize === 0 ) {
      tiles.push(createFakeTile({
        Tile_ID: tiles.length + 1, Tile_Type: 'Gateway_Open',
         X_Position: squareSize,
          Y_Position: squareSize,
           Layer_ID: l}));
    } else {
      tiles.push(createFakeTile({
        Tile_ID: tiles.length + 1,
         X_Position: squareSize - (x % squareSize),
         Y_Position: squareSize - (y % squareSize),
           Layer_ID: l}));
    }
  }}}
  return tiles;
}
function createFakePopulatedPlaystate() {
  return {
    game: createFakeGame(),
    layers: [createFakeLayer(), createFakeLayer({Layer_ID: 2})],
    tiles: [
      createFakeTiles(10,2)
    ],
    players: [
      createFakePlayer({Player_ID: 1, Tile_ID: 1}),
      createFakePlayer({Player_ID: 2, Tile_ID: 2, Class_ID: 28, Tile_ID2: 6}),
    ],
  };
}

/**
 * Minimal utils mock for command tests. Provides models + common utils used by commands.
 * In tests, override: utils.getOldestActiveGameId.mockResolvedValue(1); utils.checkGameState.mockResolvedValue(false);
 */
function createUtilsMock() {
  const models = createMockModels();
  return {
    models,
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
  createFakeEmptyPlaystate,
  createFakePopulatedPlaystate,
  createFakeTiles
};
