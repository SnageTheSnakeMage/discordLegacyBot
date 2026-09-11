/**
 * /call-db - logic tests. Plain data in, plain data out: no jest.mock, no
 * discord.js, no interaction. deps carries fake models.
 *
 * The old databaseCall.js was commented out in its entirety, so there was no
 * old test file and no runtime behaviour to pin. What these tests pin is the
 * converted shape: the dev gate, the option whitelist, the two subcommands
 * that `data` cannot supply inputs for, the one read path, and the invariant
 * that this command never writes.
 */
const logic = require('../../../commands/Developer Commands/databaseCall.logic.js');
const databaseCall = require('../../../commands/Developer Commands/databaseCall.js');
const { GAMESTATES, REJECTIONS } = require('../../../enums.js');
const { createDeps, createFakeGame, createFakePlayer } = require('../../helpers/mockModels.js');

const MODEL_NAMES = ['Players', 'Games', 'Classes', 'Tiles', 'Layers'];
const DEV_INPUT = { subcommand: 'find-all', model: 'Games', isDev: true, discordId: '123' };

/** every model, every mutating accessor: this command must never write. */
function expectNoWrites(deps) {
  for (const name of MODEL_NAMES) {
    expect(deps.models[name].update).not.toHaveBeenCalled();
    expect(deps.models[name].create).not.toHaveBeenCalled();
    expect(deps.models[name].destroy).not.toHaveBeenCalled();
  }
}

/** every model, every accessor: nothing reached the database at all. */
function expectNoDatabaseAccess(deps) {
  for (const name of MODEL_NAMES) {
    expect(deps.models[name].findAll).not.toHaveBeenCalled();
    expect(deps.models[name].findOne).not.toHaveBeenCalled();
    expect(deps.models[name].findByPk).not.toHaveBeenCalled();
  }
  expectNoWrites(deps);
}

describe('call-db parse', () => {
  it('maps the subcommand, the model and the dev flag', () => {
    const input = logic.parse(
      { subcommand: 'find-all', model: 'Players' },
      { discordId: '123', username: 'snage', isDev: true },
    );
    expect(input).toEqual({ subcommand: 'find-all', model: 'Players', isDev: true, discordId: '123' });
  });

  it('turns absent options into null and a missing dev flag into false', () => {
    const input = logic.parse({}, { discordId: '456', username: 'nobody' });
    expect(input).toEqual({ subcommand: null, model: null, isDev: false, discordId: '456' });
  });

  it('only an exact true counts as dev', () => {
    expect(logic.parse({}, { discordId: '456', isDev: 'yes' }).isDev).toBe(false);
    expect(logic.parse({}, { discordId: '456', isDev: 1 }).isDev).toBe(false);
  });
});

describe('call-db run rejections', () => {
  it('rejects a non-dev caller and touches nothing', async () => {
    const deps = createDeps();
    const result = await logic.run({ ...DEV_INPUT, isDev: false }, deps);
    expect(result).toEqual({ ok: false, reason: REJECTIONS.NOT_DEV });
    expectNoDatabaseAccess(deps);
  });

  it('checks the dev gate before the model, so a non-dev learns nothing about the models', async () => {
    const deps = createDeps();
    const result = await logic.run({ subcommand: 'find-all', model: 'Nonsense', isDev: false, discordId: '1' }, deps);
    expect(result.reason).toBe(REJECTIONS.NOT_DEV);
  });

  // MISSING CODE: REJECTIONS has no INVALID_MODEL, so the closest general
  // "that option value is not valid" code carries the exact wording in
  // data.message (see the conversion report's missing_codes).
  it.each([
    ['a model that is not on the choice list', 'Nonsense'],
    ['the right name in the wrong case', 'players'],
    ['an absent option', null],
    ['an empty string', ''],
  ])('rejects %s and touches nothing', async (_label, model) => {
    const deps = createDeps();
    const result = await logic.run({ ...DEV_INPUT, model }, deps);
    expect(result).toEqual({
      ok: false,
      reason: REJECTIONS.INVALID_AMOUNT,
      data: { message: `\`${model}\` is not one of the models this command can read.` },
    });
    expectNoDatabaseAccess(deps);
  });

  // `data` declares no primary-key option and no field/value options, so
  // these two subcommands have no way to receive the inputs they need. They
  // reject rather than guess, and they still touch nothing.
  it.each([
    'find-by-primary-key',
    'update-player',
    'some-subcommand-that-does-not-exist',
    null,
  ])('rejects the %s subcommand and touches nothing', async (subcommand) => {
    const deps = createDeps();
    const result = await logic.run({ ...DEV_INPUT, subcommand }, deps);
    expect(result).toEqual({
      ok: false,
      reason: REJECTIONS.INVALID_AMOUNT,
      data: { message: `The \`${subcommand}\` subcommand is not implemented.` },
    });
    expectNoDatabaseAccess(deps);
  });

  it('checks the model before the subcommand', async () => {
    const deps = createDeps();
    const result = await logic.run({ ...DEV_INPUT, model: 'Nonsense', subcommand: 'update-player' }, deps);
    expect(result.data.message).toBe('`Nonsense` is not one of the models this command can read.');
  });
});

describe('call-db run success', () => {
  it('reads the requested model and returns its rows as plain data', async () => {
    const game = createFakeGame({ Game_ID: 7 });
    const deps = createDeps({ models: { Games: { findAll: async () => [game] } } });
    const result = await logic.run(DEV_INPUT, deps);
    expect(result).toEqual({
      ok: true,
      kind: 'rows',
      data: { model: 'Games', rows: [game], count: 1 },
    });
    expect(deps.models.Games.findAll).toHaveBeenCalledTimes(1);
    expectNoWrites(deps);
  });

  it.each(MODEL_NAMES)('find-all on %s reads only that model', async (model) => {
    const deps = createDeps();
    const result = await logic.run({ ...DEV_INPUT, model }, deps);
    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ model, rows: [], count: 0 });
    expect(deps.models[model].findAll).toHaveBeenCalledTimes(1);
    for (const other of MODEL_NAMES.filter((n) => n !== model)) {
      expect(deps.models[other].findAll).not.toHaveBeenCalled();
    }
    expectNoWrites(deps);
  });

  it('covers all five models of the option choice list', () => {
    expect(logic.MODEL_CHOICES).toEqual(MODEL_NAMES);
  });

  it('unwraps Sequelize rows through toJSON so present() never sees the ORM', async () => {
    const plain = { Player_ID: 1, Discord_ID: '123' };
    const instance = { dataValues: plain, toJSON: () => plain };
    const deps = createDeps({ models: { Players: { findAll: async () => [instance] } } });
    const result = await logic.run({ ...DEV_INPUT, model: 'Players' }, deps);
    expect(result.data.rows).toEqual([plain]);
    expect(result.data.rows[0]).not.toHaveProperty('dataValues');
  });

  it('treats a model that resolves nothing as an empty result rather than throwing', async () => {
    const deps = createDeps({ models: { Tiles: { findAll: async () => undefined } } });
    const result = await logic.run({ ...DEV_INPUT, model: 'Tiles' }, deps);
    expect(result).toEqual({ ok: true, kind: 'rows', data: { model: 'Tiles', rows: [], count: 0 } });
  });

  // The gamestate table. This command has no gamestate gate at all - it never
  // loads "the" game, it dumps a table - so the table asserts exactly that:
  // every state in the enum reads back unchanged and none of them blocks the
  // command. A new state cannot be added without this test being reconsidered.
  it.each(Object.values(GAMESTATES))('gamestate %s neither blocks nor alters the read', async (state) => {
    const game = createFakeGame({ GAME_STATE: state });
    const deps = createDeps({ models: { Games: { findAll: async () => [game] } } });
    const result = await logic.run(DEV_INPUT, deps);
    expect(result.ok).toBe(true);
    expect(result.data.rows[0].GAME_STATE).toBe(state);
    expectNoWrites(deps);
  });

  it('covers all 8 gamestates in the table above', () => {
    expect(Object.values(GAMESTATES)).toHaveLength(8);
  });

  // No AP or range boundaries apply: this command spends no AP and has no
  // board geometry. The boundary that does apply is Discord's 2000-character
  // content limit, tested exactly-at vs one-over in the present() block.
});

describe('call-db present', () => {
  it('renders the non-dev rejection through the shared message table', () => {
    const out = logic.present({ ok: false, reason: REJECTIONS.NOT_DEV });
    expect(out).toEqual({ content: 'Only the dev can use this command.' });
  });

  it('renders a rejection that carries its own wording', () => {
    const out = logic.present({
      ok: false,
      reason: REJECTIONS.INVALID_AMOUNT,
      data: { message: 'The `update-player` subcommand is not implemented.' },
    });
    expect(out).toEqual({ content: 'The `update-player` subcommand is not implemented.' });
  });

  it('renders an empty table without a code block', () => {
    const out = logic.present({ ok: true, kind: 'rows', data: { model: 'Layers', rows: [], count: 0 } });
    expect(out).toEqual({ content: 'No entries found in Layers.' });
  });

  it('renders one row as singular, in a json code block', () => {
    const row = { Player_ID: 1, Discord_ID: '123' };
    const out = logic.present({ ok: true, kind: 'rows', data: { model: 'Players', rows: [row], count: 1 } });
    expect(out).toEqual({ content: '1 entry in Players:\n```json\n{"Player_ID":1,"Discord_ID":"123"}\n```' });
  });

  it('renders several rows as plural, one per line', () => {
    const rows = [{ a: 1 }, { a: 2 }];
    const out = logic.present({ ok: true, kind: 'rows', data: { model: 'Tiles', rows, count: 2 } });
    expect(out).toEqual({ content: '2 entries in Tiles:\n```json\n{"a":1}\n{"a":2}\n```' });
  });

  // boundary: exactly at Discord's content limit vs one character over.
  // header '1 entry in Games:' is 17, plus the newline, the 8-char opening
  // fence and the 4-char closing fence, leaves 1970 characters of body.
  const BODY_BUDGET = logic.MAX_CONTENT - '1 entry in Games:'.length - 1 - '```json\n'.length - '\n```'.length;
  const rowOfBodyLength = (length) => ({ x: 'a'.repeat(length - '{"x":""}'.length) });

  it('leaves a body that exactly fills the limit untruncated', () => {
    const row = rowOfBodyLength(BODY_BUDGET);
    const out = logic.present({ ok: true, kind: 'rows', data: { model: 'Games', rows: [row], count: 1 } });
    expect(out.content).toHaveLength(logic.MAX_CONTENT);
    expect(out.content).toContain(JSON.stringify(row));
    expect(out.content).not.toContain('...');
  });

  it('truncates a body one character over the limit and still fits', () => {
    const row = rowOfBodyLength(BODY_BUDGET + 1);
    const out = logic.present({ ok: true, kind: 'rows', data: { model: 'Games', rows: [row], count: 1 } });
    expect(out.content).toHaveLength(logic.MAX_CONTENT);
    expect(out.content.endsWith('...\n```')).toBe(true);
  });

  it('keeps a very large dump inside the limit', () => {
    const rows = Array.from({ length: 200 }, (_, i) => createFakePlayer({ Player_ID: i }));
    const out = logic.present({ ok: true, kind: 'rows', data: { model: 'Players', rows, count: rows.length } });
    expect(out.content.length).toBeLessThanOrEqual(logic.MAX_CONTENT);
    expect(out.content.startsWith('200 entries in Players:')).toBe(true);
  });
});

describe('call-db adapter (smoke)', () => {
  it('exports the command contract', () => {
    expect(databaseCall.data.toJSON().name).toBe('call-db');
    expect(typeof databaseCall.execute).toBe('function');
  });

  it('declares the three subcommands, each carrying the model choice list', () => {
    const json = databaseCall.data.toJSON();
    expect(json.options.map((o) => o.name)).toEqual(['find-all', 'find-by-primary-key', 'update-player']);
    for (const subcommand of json.options) {
      expect(subcommand.type).toBe(1);
      expect(subcommand.options.map((o) => o.name)).toEqual(['model']);
      expect(subcommand.options[0].required).toBe(true);
      expect(subcommand.options[0].choices.map((c) => c.value)).toEqual(MODEL_NAMES);
    }
  });
});
