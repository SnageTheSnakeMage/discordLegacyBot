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

  it('rejects a player who is not in the game', async () => {
    const deps = happyDeps();
    deps.models.Players.findOne = jest.fn(async () => null);
    expect(await logic.run(INPUT, deps)).toMatchObject({ ok: false, reason: REJECTIONS.NOT_IN_GAME });
  });

  it.each([
    [{ GAME_STATE: GAMESTATES.OVER }, REJECTIONS.GAME_OVER],
    [{ GAME_STATE: GAMESTATES.DEV_PAUSED }, REJECTIONS.GAME_PAUSED],
    [{ GAME_STATE: GAMESTATES.ACTIVE, timeStopped: true }, REJECTIONS.TIME_STOPPED],
  ])('game %o blocks with %s', async (condition, reason) => {
    const deps = happyDeps({ game: createFakeGame({ ...condition }) });
    expect(await logic.run(INPUT, deps)).toMatchObject({ ok: false, reason });
    expect(deps.utils.GenerateGameGridImage).not.toHaveBeenCalled();
  });

  // /board only looks, so the state that means "nothing to act on yet" stays
  // open to it: seeing the grid of a game you are waiting to start.
  it('a game in registration still renders', async () => {
    const deps = happyDeps({ game: createFakeGame({ GAME_STATE: GAMESTATES.REGISTRATION }) });
    expect(await logic.run(INPUT, deps)).toMatchObject({ ok: true });
    expect(deps.utils.GenerateGameGridImage).toHaveBeenCalled();
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

  // an Oracle, so this covers the 1-based number -> Layer_ID mapping and
  // nothing else; a non-Oracle asking for a layer it is not on is NOT_ORACLE
  it('maps an explicit common layer number to the game Layer_ID', async () => {
    const deps = happyDeps({ playerClass: createFakeClass({ Class_Name: 'Oracle' }) });
    const result = await logic.run({ ...INPUT, layer: 2 }, deps);
    expect(result.ok).toBe(true);
    expect(deps.utils.GenerateGameGridImage).toHaveBeenCalledWith(1, 22, 1);
  });

  // The rule as a rejection, decided before anything renders, so a player who
  // breaks it is told which rule they broke.
  describe('who may look at another layer', () => {
    // one body, on layer 11 - what a non-Twin actually looks like
    const oneBody = () => createFakePlayer({ Player_ID: 1, Discord_ID: '123', Tile_ID: 1, Tile_ID2: null });

    it('refuses a non-Oracle asking for a layer it is not standing on', async () => {
      const deps = happyDeps({ player: oneBody() });
      expect(await logic.run({ ...INPUT, layer: 2 }, deps))
        .toMatchObject({ ok: false, reason: REJECTIONS.NOT_ORACLE });
      expect(deps.utils.GenerateGameGridImage).not.toHaveBeenCalled();
    });

    it('says so in words a player can act on', () => {
      const content = logic.present({ ok: false, reason: REJECTIONS.NOT_ORACLE }).content;
      expect(content).toMatch(/Oracle/);
      expect(content).not.toMatch(/There was an error/);
    });

    it('allows a non-Oracle to name the layer it is already on', async () => {
      const deps = happyDeps({ player: oneBody() });
      const result = await logic.run({ ...INPUT, layer: 1 }, deps);
      expect(result.ok).toBe(true);
      expect(deps.utils.GenerateGameGridImage).toHaveBeenCalledWith(1, 11, 1);
    });

    it('allows a dead player any layer', async () => {
      const deps = happyDeps({
        player: createFakePlayer({ Player_ID: 1, Discord_ID: '123', Tile_ID: null, Tile_ID2: null, Dead: true }),
      });
      expect(await logic.run({ ...INPUT, layer: 2 }, deps)).toMatchObject({ ok: true });
    });

    // a Twin stands on two layers, so neither of them is "another layer"
    it('allows a Twin the layer of either of its bodies', async () => {
      const deps = happyDeps({
        player: createFakePlayer({ Player_ID: 1, Discord_ID: '123', Tile_ID: 1, Tile_ID2: 2 }),
        playerClass: createFakeClass({ Class_Name: 'Twin' }),
      });
      expect(await logic.run({ ...INPUT, layer: 1 }, deps)).toMatchObject({ ok: true });
      expect(await logic.run({ ...INPUT, layer: 2 }, deps)).toMatchObject({ ok: true });
    });
  });

  it('rejects a common layer number beyond the game layers', async () => {
    const deps = happyDeps();
    expect(await logic.run({ ...INPUT, layer: 3 }, deps)).toMatchObject({ ok: false, reason: REJECTIONS.NO_SUCH_LAYER });
  });

  // an Oracle naming no layer is a player asking about its own position, so it
  // gets its own layer like anyone else - a null layer id has no grid to draw
  it('renders an Oracle its own layer when it names none', async () => {
    const deps = happyDeps({ playerClass: createFakeClass({ Class_Name: 'Oracle' }) });
    const result = await logic.run(INPUT, deps);
    expect(result.ok).toBe(true);
    expect(deps.utils.GenerateGameGridImage).toHaveBeenCalledWith(1, 11, 1);
  });

  it('renders an Oracle the layer of body 2 when it asks for body 2 and names none', async () => {
    const deps = happyDeps({ playerClass: createFakeClass({ Class_Name: 'Oracle' }) });
    const result = await logic.run({ ...INPUT, body: 2 }, deps);
    expect(result.ok).toBe(true);
    expect(deps.utils.GenerateGameGridImage).toHaveBeenCalledWith(1, 22, 1);
  });

  it('refuses an Oracle with no tile and no layer named, rather than a null layer', async () => {
    const deps = happyDeps({
      player: createFakePlayer({ Player_ID: 1, Discord_ID: '123', Tile_ID: null, Tile_ID2: null, Dead: true }),
      playerClass: createFakeClass({ Class_Name: 'Oracle' }),
    });
    // the shared fake answers every id; a player off the board has none
    deps.models.Tiles.findByPk = jest.fn(async () => null);
    expect(await logic.run(INPUT, deps)).toMatchObject({ ok: false, reason: REJECTIONS.NO_SUCH_TILE });
    expect(deps.utils.GenerateGameGridImage).not.toHaveBeenCalled();
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
