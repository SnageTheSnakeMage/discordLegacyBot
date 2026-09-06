/**
 * /board - logic tests. GenerateGameGridImage is the canvas seam and is the
 * one util faked here (via deps.utils); everything else runs real.
 */
const logic = require('../../../commands/Player Commands/board.logic.js');
const board = require('../../../commands/Player Commands/board.js');
const { GAMESTATES, REJECTIONS } = require('../../../enums.js');
const {
  createDeps, createFakeGame, createFakePlayer, createFakeClass, createFakeTile, createFakeLayer,
} = require('../../helpers/mockModels.js');

const FAKE_PNG = Buffer.from('not-a-real-png');

function happyDeps(over = {}) {
  const player = over.player || createFakePlayer({ Discord_ID: '123', Tile_ID: 1, Tile_ID2: 2 });
  const game = over.game || createFakeGame({ GAME_STATE: GAMESTATES.ACTIVE });
  const playerClass = over.playerClass || createFakeClass({ Class_Name: 'Average' });
  const deps = createDeps({
    models: {
      Games: { findByPk: async () => game },
      Players: { findOne: async () => player },
      Classes: { findByPk: async () => playerClass },
      Tiles: { findByPk: async (id) => (id === 1
        ? createFakeTile({ Tile_ID: 1, Layer_ID: 11 })
        : createFakeTile({ Tile_ID: 2, Layer_ID: 22 })) },
      Layers: { findAll: async () => [createFakeLayer({ Layer_ID: 11 }), createFakeLayer({ Layer_ID: 22 })] },
    },
  });
  deps.utils = { ...deps.utils, GenerateGameGridImage: jest.fn(async () => FAKE_PNG) };
  return deps;
}

const INPUT = { gameId: 1, layer: null, body: 1, discordId: '123' };

describe('board.parse', () => {
  it('defaults body to 1 and coerces only 2 to 2', () => {
    expect(logic.parse({ game: null, layer: null, body: null }, { discordId: '1' }).body).toBe(1);
    expect(logic.parse({ game: null, layer: null, body: 2 }, { discordId: '1' }).body).toBe(2);
    expect(logic.parse({ game: null, layer: null, body: 7 }, { discordId: '1' }).body).toBe(1);
  });
});

describe('board.run', () => {
  it('rejects an unknown game', async () => {
    const deps = happyDeps();
    deps.models.Games.findByPk = jest.fn(async () => null);
    expect(await logic.run(INPUT, deps)).toMatchObject({ ok: false, reason: REJECTIONS.NO_SUCH_GAME });
  });

  it('rejects a player who is not in the game (the old code crashed here)', async () => {
    const deps = happyDeps();
    deps.models.Players.findOne = jest.fn(async () => null);
    expect(await logic.run(INPUT, deps)).toMatchObject({ ok: false, reason: REJECTIONS.NOT_IN_GAME });
  });

  it.each([
    [GAMESTATES.OVER, REJECTIONS.GAME_OVER],
    [GAMESTATES.DEV_PAUSED, REJECTIONS.GAME_PAUSED],
    [GAMESTATES.TIMESTOPPED, REJECTIONS.TIME_STOPPED],
  ])('gamestate %s blocks with %s', async (state, reason) => {
    const deps = happyDeps({ game: createFakeGame({ GAME_STATE: state }) });
    expect(await logic.run(INPUT, deps)).toMatchObject({ ok: false, reason });
    expect(deps.utils.GenerateGameGridImage).not.toHaveBeenCalled();
  });

  it('renders the layer of body 1 by default', async () => {
    const deps = happyDeps();
    const result = await logic.run(INPUT, deps);
    expect(result.ok).toBe(true);
    expect(deps.utils.GenerateGameGridImage).toHaveBeenCalledWith(1, 11, 1);
    expect(result.data.buffer).toBe(FAKE_PNG);
  });

  it('renders the layer of body 2 for a twin asking for body 2', async () => {
    const deps = happyDeps();
    const result = await logic.run({ ...INPUT, body: 2 }, deps);
    expect(result.ok).toBe(true);
    expect(deps.utils.GenerateGameGridImage).toHaveBeenCalledWith(1, 22, 1);
  });

  it('maps an explicit common layer number to the game Layer_ID (this path used to throw ReferenceError)', async () => {
    const deps = happyDeps();
    const result = await logic.run({ ...INPUT, layer: 2 }, deps);
    expect(result.ok).toBe(true);
    expect(deps.utils.GenerateGameGridImage).toHaveBeenCalledWith(1, 22, 1);
  });

  it('rejects a common layer number beyond the game layers', async () => {
    const deps = happyDeps();
    expect(await logic.run({ ...INPUT, layer: 3 }, deps)).toMatchObject({ ok: false, reason: REJECTIONS.NO_SUCH_LAYER });
  });

  it('preserves the old Oracle default: no layer input renders with a null layer id', async () => {
    const deps = happyDeps({ playerClass: createFakeClass({ Class_Name: 'Oracle' }) });
    const result = await logic.run(INPUT, deps);
    expect(result.ok).toBe(true);
    expect(deps.utils.GenerateGameGridImage).toHaveBeenCalledWith(1, null, 1);
  });
});

describe('board.present', () => {
  it('returns the image as a plain file descriptor, never an AttachmentBuilder', () => {
    const out = logic.present({ ok: true, kind: 'board', data: { buffer: FAKE_PNG } });
    expect(out).toEqual({ files: [{ buffer: FAKE_PNG, name: 'grid.png' }] });
    expect(out.files[0].constructor).toBe(Object);
  });

  it('renders rejections as text', () => {
    expect(logic.present({ ok: false, reason: REJECTIONS.NOT_IN_GAME }).content).toMatch(/register/);
  });
});

describe('board adapter (smoke)', () => {
  it('exports the command contract', () => {
    expect(board.data.toJSON().name).toBe('board');
    expect(typeof board.execute).toBe('function');
  });
});
