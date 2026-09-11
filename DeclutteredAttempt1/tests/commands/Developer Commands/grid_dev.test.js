/**
 * /grid_dev - logic tests. Plain data in, plain data out: no jest.mock, no
 * discord.js, no interaction. GenerateGameGridImage is the canvas seam and is
 * the one util faked here (via deps.utils); everything else runs real.
 */
const logic = require('../../../commands/Developer Commands/grid_dev.logic.js');
const gridDev = require('../../../commands/Developer Commands/grid_dev.js');
const { GAMESTATES, REJECTIONS } = require('../../../enums.js');
const { createDeps, createFakeGame } = require('../../helpers/mockModels.js');

const FAKE_PNG = Buffer.from('not-a-real-png');

function happyDeps(over = {}) {
  const deps = createDeps({
    models: {
      // run() never touches the database - these exist only so the tests can
      // assert that it does not
      Games: { findByPk: async () => over.game || createFakeGame({ GAME_STATE: GAMESTATES.ACTIVE }) },
    },
    utils: { GenerateGameGridImage: jest.fn(async () => FAKE_PNG) },
  });
  return deps;
}

// the options are declared as strings on the SlashCommandBuilder, so the ids
// arrive as strings
const INPUT = { gameId: '1', layerId: '3', isDev: true, discordId: '123' };

describe('grid_dev parse', () => {
  it('maps raw options and the dev flag', () => {
    const input = logic.parse(
      { layer: '3', game: '1' },
      { discordId: '123', username: 'snage', isDev: true },
    );
    expect(input).toEqual({ gameId: '1', layerId: '3', isDev: true, discordId: '123' });
  });

  it('turns absent options into null and a missing dev flag into false', () => {
    const input = logic.parse({ layer: null, game: null }, { discordId: '456', username: 'nobody' });
    expect(input).toEqual({ gameId: null, layerId: null, isDev: false, discordId: '456' });
  });

  it('only an exact true counts as dev', () => {
    expect(logic.parse({}, { discordId: '456', isDev: 'yes' }).isDev).toBe(false);
  });

  // QUIRK (preserved): both options are addStringOption, so the ids stay
  // strings and are never coerced to numbers before reaching the renderer.
  it('keeps the ids as the strings the string options supply', () => {
    const input = logic.parse({ layer: '12', game: '7' }, { discordId: '1', isDev: true });
    expect(input.gameId).toBe('7');
    expect(input.layerId).toBe('12');
  });
});

describe('grid_dev run rejections', () => {
  it('rejects a non-dev caller, renders nothing and writes nothing', async () => {
    const deps = happyDeps();
    const result = await logic.run({ ...INPUT, isDev: false }, deps);
    expect(result).toEqual({ ok: false, reason: REJECTIONS.NOT_DEV });
    expect(deps.utils.GenerateGameGridImage).not.toHaveBeenCalled();
    expect(deps.models.Games.update).not.toHaveBeenCalled();
    expect(deps.models.Games.create).not.toHaveBeenCalled();
    expect(deps.models.Players.update).not.toHaveBeenCalled();
    expect(deps.models.Players.create).not.toHaveBeenCalled();
    expect(deps.models.Tiles.update).not.toHaveBeenCalled();
    expect(deps.models.Tiles.create).not.toHaveBeenCalled();
  });

  // The dev flag is this command's only gate: there is no player lookup, no
  // AP spend and no board geometry, so there are no AP or range boundaries
  // to exercise here.
});

describe('grid_dev run success', () => {
  it('renders the requested layer and returns the buffer', async () => {
    const deps = happyDeps();
    const result = await logic.run(INPUT, deps);
    expect(result).toEqual({
      ok: true,
      kind: 'grid',
      data: { buffer: FAKE_PNG, gameId: '1', layerId: '3' },
    });
    expect(deps.utils.GenerateGameGridImage).toHaveBeenCalledTimes(1);
  });

  // QUIRK (preserved): the renderer is called with exactly two arguments, in
  // (gameId, layerId) order. The absent third argument (playerID) is what
  // gives the dev trap sight and all-layer sight inside the helper; passing
  // an explicit undefined third argument would fail this assertion.
  it('calls the renderer with exactly (gameId, layerId) and no playerID', async () => {
    const deps = happyDeps();
    await logic.run(INPUT, deps);
    expect(deps.utils.GenerateGameGridImage).toHaveBeenCalledWith('1', '3');
    expect(deps.utils.GenerateGameGridImage.mock.calls[0]).toHaveLength(2);
  });

  it('writes nothing to the database on the success path either', async () => {
    const deps = happyDeps();
    await logic.run(INPUT, deps);
    expect(deps.models.Games.update).not.toHaveBeenCalled();
    expect(deps.models.Games.create).not.toHaveBeenCalled();
    expect(deps.models.Players.update).not.toHaveBeenCalled();
    expect(deps.models.Tiles.update).not.toHaveBeenCalled();
  });

  // The gamestate table. This command deliberately has NO gamestate gate -
  // the dev can look at any game in any state - so the table pins that
  // absence: adding a state that should block the dev view breaks this test.
  it.each(Object.values(GAMESTATES))('renders regardless of gamestate %s', async (state) => {
    const deps = happyDeps({ game: createFakeGame({ GAME_STATE: state }) });
    const result = await logic.run(INPUT, deps);
    expect(result.ok).toBe(true);
    expect(deps.utils.GenerateGameGridImage).toHaveBeenCalledWith('1', '3');
    // the gamestate is never even read: run() makes no database call
    expect(deps.models.Games.findByPk).not.toHaveBeenCalled();
  });

  it('covers all 8 gamestates in the table above', () => {
    expect(Object.values(GAMESTATES)).toHaveLength(8);
  });

  // QUIRK (preserved): no existence check on either id. A game or layer that
  // does not exist is the renderer's problem, exactly as before.
  it('passes unknown ids straight through to the renderer', async () => {
    const deps = happyDeps();
    const result = await logic.run({ ...INPUT, gameId: '999', layerId: '999' }, deps);
    expect(result.ok).toBe(true);
    expect(deps.utils.GenerateGameGridImage).toHaveBeenCalledWith('999', '999');
  });
});

describe('grid_dev present', () => {
  it('returns the image as a plain file descriptor, never an AttachmentBuilder', () => {
    const out = logic.present({ ok: true, kind: 'grid', data: { buffer: FAKE_PNG, gameId: '1', layerId: '3' } });
    expect(out).toEqual({ files: [{ buffer: FAKE_PNG, name: 'grid.png' }] });
    expect(out.files[0].constructor).toBe(Object);
  });

  it('renders the non-dev rejection through the shared message table', () => {
    const out = logic.present({ ok: false, reason: REJECTIONS.NOT_DEV });
    expect(out).toEqual({ content: 'Only the dev can use this command.' });
  });

  it('prefers a carried legacy message over the shared table', () => {
    const out = logic.present({ ok: false, reason: REJECTIONS.NOT_DEV, data: { message: 'nope' } });
    expect(out).toEqual({ content: 'nope' });
  });
});

describe('grid_dev adapter (smoke)', () => {
  it('exports the command contract', () => {
    expect(gridDev.data.toJSON().name).toBe('grid_dev');
    expect(typeof gridDev.execute).toBe('function');
  });
});
