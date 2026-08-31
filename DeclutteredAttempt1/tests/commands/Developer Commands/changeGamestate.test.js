/**
 * /change-gamestate - logic tests. Plain data in, plain data out: no
 * jest.mock, no discord.js, no interaction. deps carries fake models.
 */
const logic = require('../../../commands/Developer Commands/changeGamestate.logic.js');
const changeGamestate = require('../../../commands/Developer Commands/changeGamestate.js');
const { GAMESTATES, REJECTIONS } = require('../../../enums.js');
const { createDeps } = require('../../helpers/mockModels.js');

const DEV_INPUT = { gameId: 1, gamestate: GAMESTATES.ACTIVE, isDev: true, discordId: '123' };

describe('change-gamestate parse', () => {
  it('maps raw options and the dev flag', () => {
    const input = logic.parse(
      { game: 2, gamestate: 'FINALE' },
      { discordId: '123', username: 'snage', isDev: true },
    );
    expect(input).toEqual({ gameId: 2, gamestate: 'FINALE', isDev: true, discordId: '123' });
  });

  it('turns absent options into null and a missing dev flag into false', () => {
    const input = logic.parse({ game: null, gamestate: null }, { discordId: '456', username: 'nobody' });
    expect(input).toEqual({ gameId: null, gamestate: null, isDev: false, discordId: '456' });
  });

  it('only an exact true counts as dev', () => {
    expect(logic.parse({}, { discordId: '456', isDev: 'yes' }).isDev).toBe(false);
  });
});

describe('change-gamestate run rejections', () => {
  it('rejects a non-dev caller and writes nothing', async () => {
    const deps = createDeps();
    const result = await logic.run({ ...DEV_INPUT, isDev: false }, deps);
    expect(result).toEqual({
      ok: false,
      reason: REJECTIONS.NOT_DEV,
      data: { message: 'You must be a dev to use this command!' },
    });
    expect(deps.models.Games.update).not.toHaveBeenCalled();
    expect(deps.models.Games.create).not.toHaveBeenCalled();
  });

  // No AP or range boundaries apply: this command spends nothing and has no
  // board geometry - the only gate is the dev flag, which is boolean.
});

describe('change-gamestate run success', () => {
  it('writes the chosen gamestate with the exact update payload', async () => {
    const deps = createDeps();
    const result = await logic.run(DEV_INPUT, deps);
    expect(result).toEqual({
      ok: true,
      kind: 'gamestateChanged',
      data: { gameId: 1, gamestate: GAMESTATES.ACTIVE },
    });
    expect(deps.models.Games.update).toHaveBeenCalledWith(
      { GAME_STATE: GAMESTATES.ACTIVE },
      { where: { Game_ID: 1 } },
    );
    expect(deps.models.Games.update).toHaveBeenCalledTimes(1);
  });

  // the gamestate table: every state in the enum is writable, and is written
  // verbatim. Adding a state without deciding whether the dev can set it
  // breaks this test.
  it.each(Object.values(GAMESTATES))('writes gamestate %s verbatim', async (state) => {
    const deps = createDeps();
    const result = await logic.run({ ...DEV_INPUT, gamestate: state }, deps);
    expect(result.ok).toBe(true);
    expect(result.data.gamestate).toBe(state);
    expect(deps.models.Games.update).toHaveBeenCalledWith(
      { GAME_STATE: state },
      { where: { Game_ID: 1 } },
    );
  });

  it('covers all 8 gamestates in the table above', () => {
    expect(Object.values(GAMESTATES)).toHaveLength(8);
  });

  // QUIRK (preserved): the "Finished" choice's value is the mixed-case
  // 'Inactive', which is not GAMESTATES.INACTIVE. The choice list lives in
  // the command's unchanged `data`, so the value is written as given.
  it("writes the Finished choice's 'Inactive' value verbatim, not GAMESTATES.INACTIVE", async () => {
    const deps = createDeps();
    const result = await logic.run({ ...DEV_INPUT, gamestate: 'Inactive' }, deps);
    expect(result.ok).toBe(true);
    expect(deps.models.Games.update).toHaveBeenCalledWith(
      { GAME_STATE: 'Inactive' },
      { where: { Game_ID: 1 } },
    );
    expect(GAMESTATES.INACTIVE).toBe('INACTIVE');
  });

  // QUIRK (preserved): no existence check - a Game_ID matching no row still
  // reports success, exactly as the old .then(...) reply did.
  it('reports success even when the update matched no rows', async () => {
    const deps = createDeps({ models: { Games: { update: async () => [0] } } });
    const result = await logic.run({ ...DEV_INPUT, gameId: 999 }, deps);
    expect(result).toEqual({
      ok: true,
      kind: 'gamestateChanged',
      data: { gameId: 999, gamestate: GAMESTATES.ACTIVE },
    });
    expect(deps.models.Games.update).toHaveBeenCalledWith(
      { GAME_STATE: GAMESTATES.ACTIVE },
      { where: { Game_ID: 999 } },
    );
  });
});

describe('change-gamestate present', () => {
  it('renders the non-dev rejection with its exact legacy wording', () => {
    const out = logic.present({
      ok: false,
      reason: REJECTIONS.NOT_DEV,
      data: { message: 'You must be a dev to use this command!' },
    });
    expect(out).toEqual({ content: 'You must be a dev to use this command!' });
  });

  it('renders success with the game id and the raw gamestate value', () => {
    const out = logic.present({
      ok: true,
      kind: 'gamestateChanged',
      data: { gameId: 3, gamestate: 'DEV_PAUSED' },
    });
    expect(out).toEqual({ content: 'Game 3 has been changed to DEV_PAUSED!' });
  });

  it('renders a rejection with no data through the shared message table', () => {
    const out = logic.present({ ok: false, reason: REJECTIONS.NOT_DEV });
    expect(out.content).toBe('Only the dev can use this command.');
  });
});

describe('change-gamestate adapter (smoke)', () => {
  it('exports the command contract', () => {
    expect(changeGamestate.data.toJSON().name).toBe('change-gamestate');
    expect(typeof changeGamestate.execute).toBe('function');
  });
});
