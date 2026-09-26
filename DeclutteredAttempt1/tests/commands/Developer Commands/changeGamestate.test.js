/**
 * /change-gamestate - logic tests. Plain data in, plain data out: no
 * jest.mock, no discord.js, no interaction. deps carries fake models.
 */
const logic = require('../../../commands/Developer Commands/changeGamestate.logic.js');
const changeGamestate = require('../../../commands/Developer Commands/changeGamestate.js');
const { GAMESTATES, REJECTIONS } = require('../../../enums.js');
const { createDeps, createFakeGame } = require('../../helpers/mockModels.js');

/**
 * deps whose Games.findByPk finds a game. The command needs one to exist:
 * utils.setGameState reads the row to decide what the clock may do, and
 * answers null for a game that is not there.
 */
function devDeps(over = {}, game = {}) {
  return createDeps({
    ...over,
    models: {
      Games: { findByPk: async (id) => createFakeGame({ Game_ID: id, ...game }) },
      ...(over.models || {}),
    },
  });
}

const DEV_INPUT = { gameId: 1, gamestate: GAMESTATES.ACTIVE, isDev: true, discordId: '123' };

describe('change-gamestate parse', () => {
  it('maps raw options and the dev flag', () => {
    const input = logic.parse(
      { game: 2, gamestate: 'OVER' },
      { discordId: '123', username: 'snage', isDev: true },
    );
    expect(input).toEqual({ gameId: 2, gamestate: 'OVER', isDev: true, discordId: '123' });
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
  it('writes the chosen gamestate and starts the clock', async () => {
    const deps = devDeps({}, { GAME_STATE: GAMESTATES.REGISTRATION, gameActive: false });
    const result = await logic.run(DEV_INPUT, deps);
    expect(result).toEqual({
      ok: true,
      kind: 'gamestateChanged',
      data: { gameId: 1, gamestate: GAMESTATES.ACTIVE, gameActive: true },
    });
    // starting the clock resets the AP timestamp, so the game is not paid for
    // the time it spent stopped
    expect(deps.models.Games.update).toHaveBeenCalledWith(
      {
        GAME_STATE: GAMESTATES.ACTIVE,
        gameActive: true,
        lastAPDistributionTimestampInMS: expect.any(Number),
      },
      { where: { Game_ID: 1 } },
    );
    expect(deps.models.Games.update).toHaveBeenCalledTimes(1);
  });

  // every state in the enum is writable by the dev, and the clock follows it:
  // a game being played runs, and nothing else does
  it.each(Object.values(GAMESTATES))('writes %s, with the clock following it', async (state) => {
    const deps = devDeps({}, { GAME_STATE: GAMESTATES.REGISTRATION, gameActive: false });
    const result = await logic.run({ ...DEV_INPUT, gamestate: state }, deps);
    expect(result.ok).toBe(true);
    expect(result.data.gamestate).toBe(state);
    expect(deps.models.Games.update).toHaveBeenCalledWith(
      expect.objectContaining({ GAME_STATE: state, gameActive: state === GAMESTATES.ACTIVE }),
      { where: { Game_ID: 1 } },
    );
  });

  // a value the choice list cannot produce would otherwise be written into a
  // not-null column that nothing else understands
  it('throws on a gamestate outside the enum rather than writing it', async () => {
    const deps = devDeps();
    await expect(logic.run({ ...DEV_INPUT, gamestate: 'Inactive' }, deps))
      .rejects.toContain('Gamestate out of enum');
    expect(deps.models.Games.update).not.toHaveBeenCalled();
  });

  it('rejects a game id that matches no row', async () => {
    const deps = createDeps({ models: { Games: { findByPk: async () => null } } });
    const result = await logic.run({ ...DEV_INPUT, gameId: 999 }, deps);
    expect(result).toEqual({
      ok: false,
      reason: REJECTIONS.NO_SUCH_GAME,
      data: { gameId: 999 },
    });
    expect(deps.models.Games.update).not.toHaveBeenCalled();
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
      data: { gameId: 3, gamestate: 'DEV_PAUSED', gameActive: false },
    });
    expect(out).toEqual({ content: 'Game 3 has been changed to DEV_PAUSED! (the clock is stopped)' });
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

describe('changeGamestate registered choices', () => {
  // /change-gamestate is the one command that can write GAME_STATE directly,
  // and checkGameState throws on anything outside the enum - a bad choice
  // value bricks every command in that game. The 'Finished' choice used to
  // carry the value 'Inactive' (mixed case, not the enum's INACTIVE); the
  // legacy write was dead so it never landed, and the conversion made the
  // write live. This pins every registered choice to a real enum member.
  it('every registered choice value is a real GAMESTATES member', () => {
    const choices = (changeGamestate.data.toJSON().options || [])
      .flatMap((o) => o.choices || []);
    expect(choices.length).toBeGreaterThan(0);
    const states = Object.values(GAMESTATES);
    for (const c of choices) {
      expect(states).toContain(c.value);
    }
  });
});
