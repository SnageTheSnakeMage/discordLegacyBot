/**
 * /warp - logic tests. Plain data in, plain data out: no jest.mock, no
 * discord.js, no interaction. deps carries fake models; utils logic is real.
 *
 * Several tests below pin deliberately odd behaviour that the conversion
 * preserved (splice-while-iterating, repeated filter passes, no Clockwatcher
 * exemption, loose class comparison). Each says so where it is asserted.
 */
const logic = require('../../../commands/Class Commands/warp.logic.js');
const warp = require('../../../commands/Class Commands/warp.js');
const { GAMESTATES, REJECTIONS } = require('../../../enums.js');
const {
  createDeps, createFakeGame, createFakePlayer, createFakeClass, createFakeTile, createFakeLayer,
} = require('../../helpers/mockModels.js');

const DISCORD = '123';
const HOPPER_CLASS_ID = 7;

/** a Gateway_Open tile with all four player slots taken */
function fullGateway(id) {
  return createFakeTile({
    Tile_ID: id, Layer_ID: 3, Tile_Type: 'Gateway_Open',
    Player1: 11, Player2: 12, Player3: 13, Player4: 14,
  });
}
function openGateway(id) {
  return createFakeTile({ Tile_ID: id, Layer_ID: 3, Tile_Type: 'Gateway_Open' });
}
function blank(id) {
  return createFakeTile({ Tile_ID: id, Layer_ID: 3, Tile_Type: 'Blank1' });
}

/**
 * Happy-path deps: a Dimensional Hopper standing on a blank tile of layer 1,
 * which has layer 2 above it and layer 3 below it; layer 3 holds one usable
 * blank tile. Override any piece per test.
 */
function setup(over = {}) {
  const player = over.player || createFakePlayer({
    Player_ID: 1, Discord_ID: DISCORD, Class_ID: HOPPER_CLASS_ID, Tile_ID: 1,
  });
  const game = over.game || createFakeGame({ Game_ID: 1, GAME_STATE: GAMESTATES.ACTIVE });
  const currentTile = over.currentTile === undefined
    ? createFakeTile({ Tile_ID: 1, Layer_ID: 1, Tile_Type: 'Blank1' })
    : over.currentTile;
  const layers = over.layers || {
    1: createFakeLayer({ Layer_ID: 1, Layer_Above: 2, Layer_Below: 3 }),
    2: createFakeLayer({ Layer_ID: 2 }),
    3: createFakeLayer({ Layer_ID: 3 }),
  };
  const destinationTiles = over.destinationTiles || [blank(50)];
  const hopperClass = over.hopperClass === undefined
    ? createFakeClass({ Class_ID: HOPPER_CLASS_ID, Class_Name: 'Dimensional Hopper' })
    : over.hopperClass;

  const deps = createDeps({
    models: {
      Games: { findByPk: async () => game },
      Players: { findOne: async () => player },
      Tiles: {
        findOne: async ({ where }) => (currentTile && where.Tile_ID === currentTile.Tile_ID ? currentTile : null),
        // a fresh array each call: run() splices the list it is given
        findAll: async () => destinationTiles.slice(),
      },
      Layers: { findOne: async ({ where }) => layers[where.Layer_ID] || null },
      Classes: { findOne: async () => hopperClass },
    },
    random: over.random,
  });
  return { deps, player, game, currentTile, destinationTiles };
}

/** default input: warp DOWN in game 1 */
const INPUT = { up: false, gameId: 1, discordId: DISCORD };

describe('warp.parse', () => {
  it('maps the up-or-down option and the game id', () => {
    const input = logic.parse({ 'up-or-down': true, game: 3 }, { discordId: DISCORD, username: 'snage' });
    expect(input).toEqual({ up: true, gameId: 3, discordId: DISCORD });
  });

  it('defaults an absent game to null and coerces a null direction to down', () => {
    const input = logic.parse({ 'up-or-down': null, game: null }, { discordId: DISCORD, username: 'snage' });
    expect(input).toEqual({ up: false, gameId: null, discordId: DISCORD });
  });

  it('coerces false to down', () => {
    expect(logic.parse({ 'up-or-down': false }, { discordId: DISCORD }).up).toBe(false);
  });
});

describe('warp.run rejections', () => {
  it('rejects an unknown game and writes nothing', async () => {
    const { deps } = setup();
    deps.models.Games.findByPk = jest.fn(async () => null);
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({ ok: false, reason: REJECTIONS.NO_SUCH_GAME });
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  it('rejects a player who is not in the game', async () => {
    const { deps } = setup();
    deps.models.Players.findOne = jest.fn(async () => null);
    const result = await logic.run(INPUT, deps);
    expect(result.reason).toBe(REJECTIONS.NOT_IN_GAME);
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  it('rejects when the player is not standing on a known tile', async () => {
    const { deps } = setup({ currentTile: null });
    const result = await logic.run(INPUT, deps);
    expect(result.reason).toBe(REJECTIONS.NO_SUCH_TILE);
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  it('rejects when the current tile has no layer row', async () => {
    const { deps } = setup({ layers: {} });
    const result = await logic.run(INPUT, deps);
    expect(result.reason).toBe(REJECTIONS.NO_SUCH_LAYER);
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  it('rejects with the exact legacy wording when there is no layer below', async () => {
    const { deps } = setup({
      layers: { 1: createFakeLayer({ Layer_ID: 1, Layer_Above: 2, Layer_Below: null }), 2: createFakeLayer({ Layer_ID: 2 }) },
    });
    const result = await logic.run(INPUT, deps);
    expect(result).toEqual({
      ok: false,
      reason: REJECTIONS.NO_SUCH_LAYER,
      // preserved quirk: the legacy string is missing a space after "a"
      data: { message: 'Could not find alayer below layer: 1' },
    });
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  it('rejects with the exact legacy wording when there is no layer above', async () => {
    const { deps } = setup({
      layers: { 1: createFakeLayer({ Layer_ID: 1, Layer_Above: null, Layer_Below: 3 }), 3: createFakeLayer({ Layer_ID: 3 }) },
    });
    const result = await logic.run({ ...INPUT, up: true }, deps);
    expect(result.data.message).toBe('Could not find alayer above layer: 1');
  });

  // preserved quirk: the missing-layer check sits BEFORE the gamestate gate,
  // exactly where the legacy code wrote it
  it('reports a missing layer before it reports that the game is over', async () => {
    const { deps } = setup({
      game: createFakeGame({ GAME_STATE: GAMESTATES.OVER }),
      layers: { 1: createFakeLayer({ Layer_ID: 1, Layer_Above: 2, Layer_Below: null }), 2: createFakeLayer({ Layer_ID: 2 }) },
    });
    const result = await logic.run(INPUT, deps);
    expect(result.reason).toBe(REJECTIONS.NO_SUCH_LAYER);
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
    const { deps } = setup({ game: createFakeGame({ GAME_STATE: state }) });
    const result = await logic.run(INPUT, deps);
    if (reason === null) {
      expect(result.ok).toBe(true);
    } else {
      expect(result).toMatchObject({ ok: false, reason });
      expect(deps.models.Players.update).not.toHaveBeenCalled();
    }
  });

  // preserved quirk: warp passes isClockwatcher=false unconditionally, so a
  // Clockwatcher is blocked by a timestop like everyone else
  it('does not exempt a Clockwatcher from a timestop', async () => {
    const { deps } = setup({
      game: createFakeGame({ GAME_STATE: GAMESTATES.TIMESTOPPED }),
      player: createFakePlayer({ Discord_ID: DISCORD, Class_ID: 9, Tile_ID: 1 }),
      hopperClass: createFakeClass({ Class_ID: 9, Class_Name: 'Clockwatcher' }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result.reason).toBe(REJECTIONS.TIME_STOPPED);
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  it('rejects a non-hopper who is not on an open gateway', async () => {
    const { deps } = setup({
      player: createFakePlayer({ Discord_ID: DISCORD, Class_ID: 2, Tile_ID: 1 }),
    });
    const result = await logic.run(INPUT, deps);
    expect(result.reason).toBe(REJECTIONS.NOT_ON_GATEWAY);
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  // preserved quirk: the class test is `player.Class_ID == hopperClass?.Class_ID`,
  // so a null Class_ID loosely equals the undefined of a missing class row
  it('treats a player with a null Class_ID as a hopper when the class row is missing', async () => {
    const { deps } = setup({
      player: createFakePlayer({ Discord_ID: DISCORD, Class_ID: null, Tile_ID: 1 }),
      hopperClass: null,
    });
    const result = await logic.run(INPUT, deps);
    expect(result.ok).toBe(true);
  });

  it('rejects a non-hopper on a gateway when the destination layer has no gateways', async () => {
    const { deps } = setup({
      player: createFakePlayer({ Discord_ID: DISCORD, Class_ID: 2, Tile_ID: 1 }),
      currentTile: createFakeTile({ Tile_ID: 1, Layer_ID: 1, Tile_Type: 'Gateway_Open' }),
      destinationTiles: [],
    });
    const result = await logic.run(INPUT, deps);
    expect(result).toEqual({
      ok: false,
      reason: REJECTIONS.NO_AVAILABLE_TILE,
      data: { message: 'There are no available(not full or locked) gateways on the layer below you!' },
    });
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  it('rejects when the only gateway on the destination layer is full', async () => {
    const { deps } = setup({
      currentTile: createFakeTile({ Tile_ID: 1, Layer_ID: 1, Tile_Type: 'Gateway_Open' }),
      destinationTiles: [fullGateway(60)],
    });
    const result = await logic.run(INPUT, deps);
    expect(result.reason).toBe(REJECTIONS.NO_AVAILABLE_TILE);
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  it('rejects a hopper when the destination layer holds no tiles at all', async () => {
    const { deps } = setup({ destinationTiles: [] });
    const result = await logic.run(INPUT, deps);
    expect(result).toEqual({
      ok: false,
      reason: REJECTIONS.NO_AVAILABLE_TILE,
      data: { message: 'There are no available(not full, wall, damaged wall, void, ice, or locked gateway) tiles on the layer below you!' },
    });
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });

  it('rejects a hopper when the destination layer holds one unusable tile', async () => {
    const { deps } = setup({
      destinationTiles: [createFakeTile({ Tile_ID: 61, Layer_ID: 3, Tile_Type: 'Wall' })],
    });
    const result = await logic.run(INPUT, deps);
    expect(result.reason).toBe(REJECTIONS.NO_AVAILABLE_TILE);
    expect(deps.models.Players.update).not.toHaveBeenCalled();
  });
});

describe('warp.run preserved loop quirks', () => {
  // splice-while-iterating with for-in: removing index 0 shifts the next tile
  // into it, and for-in moves on to index 1, so every other full gateway
  // survives the filter and can be warped onto
  it('leaves every other full gateway in the pool and can land on one', async () => {
    const { deps } = setup({
      currentTile: createFakeTile({ Tile_ID: 1, Layer_ID: 1, Tile_Type: 'Gateway_Open' }),
      destinationTiles: [fullGateway(70), fullGateway(71), fullGateway(72), fullGateway(73)],
      random: jest.fn(() => 0),
    });
    const result = await logic.run(INPUT, deps);
    expect(result.ok).toBe(true);
    // survivors are the tiles at odd original indexes: 71 and 73
    expect(deps.random).toHaveBeenCalledWith(1);
    expect(result.data.tileId).toBe(71);
    expect(deps.models.Players.update).toHaveBeenCalledWith(
      { Tile_ID: 71 }, { where: { Game_ID: 1, Discord_ID: DISCORD } },
    );
  });

  // same quirk on the hopper branch: two walls, one survives, and the hopper
  // is teleported onto it
  it('lets a hopper land on a wall that survived the filter', async () => {
    const { deps } = setup({
      destinationTiles: [
        createFakeTile({ Tile_ID: 80, Layer_ID: 3, Tile_Type: 'Wall' }),
        createFakeTile({ Tile_ID: 81, Layer_ID: 3, Tile_Type: 'Wall' }),
      ],
    });
    const result = await logic.run(INPUT, deps);
    expect(result.ok).toBe(true);
    expect(result.data.tileId).toBe(81);
  });

  // the outer of the two nested loops re-runs the whole filter pass (and
  // re-rolls the destination) once per surviving index of the original array
  it('re-runs the filter pass, removing more than a single pass would', async () => {
    const { deps } = setup({
      destinationTiles: [
        createFakeTile({ Tile_ID: 90, Layer_ID: 3, Tile_Type: 'Wall' }),
        blank(91),
        createFakeTile({ Tile_ID: 92, Layer_ID: 3, Tile_Type: 'Void' }),
        blank(93),
        createFakeTile({ Tile_ID: 94, Layer_ID: 3, Tile_Type: 'Wall_Damaged' }),
        createFakeTile({ Tile_ID: 95, Layer_ID: 3, Tile_Type: 'Gateway_Locked' }),
      ],
      random: jest.fn(() => 0),
    });
    const result = await logic.run(INPUT, deps);
    expect(result.ok).toBe(true);
    // pass 1 leaves [91, 93, 95]; pass 2 removes the locked gateway
    expect(deps.random).toHaveBeenNthCalledWith(1, 2);
    expect(deps.random).toHaveBeenNthCalledWith(2, 1);
    expect(deps.random).toHaveBeenCalledTimes(2);
    expect(result.data.tileId).toBe(91);
  });

  // the destination is indexed with length - 1 because getRandomInt is
  // inclusive of its max (utils.js:40); the legacy length could index past
  // the end and crash
  it('indexes the pool with length - 1 and can pick the last tile', async () => {
    const { deps } = setup({
      destinationTiles: [blank(100), blank(101), blank(102)],
      random: jest.fn(() => 2),
    });
    const result = await logic.run(INPUT, deps);
    expect(deps.random).toHaveBeenCalledWith(2);
    expect(result.data.tileId).toBe(102);
  });
});

describe('warp.run success', () => {
  it('teleports a hopper down and writes only Players.Tile_ID', async () => {
    const { deps } = setup();
    const result = await logic.run(INPUT, deps);
    expect(result).toEqual({
      ok: true,
      kind: 'warped',
      data: { up: false, viaGateway: false, tileId: 50, layerId: 3 },
    });
    expect(deps.models.Players.update).toHaveBeenCalledWith(
      { Tile_ID: 50 }, { where: { Game_ID: 1, Discord_ID: DISCORD } },
    );
    expect(deps.models.Players.update).toHaveBeenCalledTimes(1);
    // preserved quirk: the destination tile's PlayerN slot is never claimed
    // and the old tile is never vacated
    expect(deps.models.Tiles.update).not.toHaveBeenCalled();
  });

  it('teleports a hopper up, using the layer above', async () => {
    const { deps } = setup({ destinationTiles: [createFakeTile({ Tile_ID: 55, Layer_ID: 2, Tile_Type: 'Blank1' })] });
    const result = await logic.run({ ...INPUT, up: true }, deps);
    expect(result.data).toEqual({ up: true, viaGateway: false, tileId: 55, layerId: 2 });
    expect(deps.models.Layers.findOne).toHaveBeenCalledWith({ where: { Layer_ID: 2 } });
  });

  it('teleports a non-hopper standing on an open gateway to another open gateway', async () => {
    const { deps } = setup({
      player: createFakePlayer({ Discord_ID: DISCORD, Class_ID: 2, Tile_ID: 1 }),
      currentTile: createFakeTile({ Tile_ID: 1, Layer_ID: 1, Tile_Type: 'Gateway_Open' }),
      destinationTiles: [openGateway(65)],
    });
    const result = await logic.run(INPUT, deps);
    expect(result).toMatchObject({ ok: true, kind: 'warped', data: { viaGateway: true, tileId: 65 } });
    expect(deps.models.Tiles.findAll).toHaveBeenCalledWith({ where: { Layer_ID: 3, Tile_Type: 'Gateway_Open' } });
    expect(deps.models.Players.update).toHaveBeenCalledWith(
      { Tile_ID: 65 }, { where: { Game_ID: 1, Discord_ID: DISCORD } },
    );
  });

  it('resolves the default game via getOldestGameId when no game is given', async () => {
    const { deps } = setup();
    deps.utils = { ...deps.utils, getOldestGameId: jest.fn(async () => 1) };
    const result = await logic.run({ ...INPUT, gameId: null }, deps);
    expect(result.ok).toBe(true);
    expect(deps.utils.getOldestGameId).toHaveBeenCalledWith(DISCORD);
  });
});

describe('warp.present', () => {
  it('renders the gateway success wording', () => {
    const out = logic.present({ ok: true, kind: 'warped', data: { up: true, viaGateway: true, tileId: 1 } });
    expect(out).toEqual({
      content: 'Teleported to a random gateway tile on the layer above you!\n Check out where you are with the board command!',
    });
  });

  it('renders the hopper success wording', () => {
    const out = logic.present({ ok: true, kind: 'warped', data: { up: false, viaGateway: false, tileId: 1 } });
    expect(out).toEqual({
      content: 'Teleported to a random tile on the layer below you!\n Check out where you are with the stats or board command!',
    });
  });

  it('renders NOT_ON_GATEWAY with its legacy wording', () => {
    const out = logic.present({ ok: false, reason: REJECTIONS.NOT_ON_GATEWAY });
    expect(out).toEqual({ content: 'You must be on a Gateway tile or a Dimensional Hopper to use this command!' });
  });

  it('passes a carried legacy message through untouched', () => {
    const out = logic.present({
      ok: false,
      reason: REJECTIONS.NO_AVAILABLE_TILE,
      data: { message: 'There are no available(not full or locked) gateways on the layer above you!' },
    });
    expect(out).toEqual({ content: 'There are no available(not full or locked) gateways on the layer above you!' });
  });

  it('renders every rejection this command can return as non-empty text', () => {
    const codes = [
      REJECTIONS.NO_SUCH_GAME, REJECTIONS.NOT_IN_GAME, REJECTIONS.NO_SUCH_TILE,
      REJECTIONS.NO_SUCH_LAYER, REJECTIONS.NO_AVAILABLE_TILE, REJECTIONS.NOT_ON_GATEWAY,
      REJECTIONS.GAME_OVER, REJECTIONS.GAME_PAUSED, REJECTIONS.TIME_STOPPED,
    ];
    for (const reason of codes) {
      const { content } = logic.present({ ok: false, reason });
      expect(typeof content).toBe('string');
      expect(content.length).toBeGreaterThan(0);
    }
  });
});

describe('warp adapter (smoke)', () => {
  it('exports the command contract', () => {
    expect(warp.data.toJSON().name).toBe('warp');
    expect(typeof warp.execute).toBe('function');
  });
});
