/**
 * /reload-commands - logic tests. Plain data in, plain data out: no jest.mock,
 * no discord.js, no interaction.
 *
 * The command has no database access at all; its two seams are the filesystem
 * walk and the module loader, and both arrive through deps (deps.fs,
 * deps.commandsRoot, deps.loadCommand). Injecting them means these tests
 * exercise the real decision logic - which files count as commands, which are
 * skipped, which failures are survivable - against a fake tree, without
 * touching disk and without ever loading a real command module (and so never
 * loading discord.js).
 */
const path = require('path');
const logic = require('../../../commands/Developer Commands/reloadCommands.logic.js');
const reloadCommands = require('../../../commands/Developer Commands/reloadCommands.js');
const { GAMESTATES, REJECTIONS } = require('../../../enums.js');
const { createDeps, createFakeGame } = require('../../helpers/mockModels.js');

const ROOT = path.join('/fake', 'commands');

/** a loadable command module: only data.name and execute are ever read */
function fakeModule(name) {
  return { data: { name }, execute: () => {} };
}

/**
 * Fake fs over a plain tree: { 'Player Commands': ['gift.js'], '_deps.js': null }
 * An array value is a directory listing; null is a file.
 */
function createFakeFs(tree) {
  return {
    readdirSync: jest.fn((dir) => {
      if (dir === ROOT) return Object.keys(tree);
      const entry = tree[path.basename(dir)];
      if (!Array.isArray(entry)) {
        const err = new Error(`ENOTDIR: not a directory, scandir '${dir}'`);
        err.code = 'ENOTDIR';
        throw err;
      }
      return entry;
    }),
    statSync: jest.fn((p) => {
      const entry = tree[path.basename(p)];
      return { isDirectory: () => Array.isArray(entry) };
    }),
  };
}

const DEFAULT_TREE = {
  'Player Commands': ['gift.js', 'gift.logic.js', 'board.js', 'board.logic.js'],
  'Developer Commands': ['reloadCommands.js', 'reloadCommands.logic.js'],
  '_adapter.js': null,
  '_deps.js': null,
};

/** slash names keyed by file name, so the loader can answer by path */
const DEFAULT_NAMES = {
  'gift.js': 'gift',
  'board.js': 'board',
  'reloadCommands.js': 'reload-commands',
};

function happyDeps(over = {}) {
  const tree = over.tree || DEFAULT_TREE;
  const names = over.names || DEFAULT_NAMES;
  const deps = createDeps({
    models: {
      // run() never touches the database - these exist only so the tests can
      // assert that it does not
      Games: { findByPk: async () => over.game || createFakeGame({ GAME_STATE: GAMESTATES.ACTIVE }) },
    },
  });
  deps.commandsRoot = ROOT;
  deps.fs = createFakeFs(tree);
  deps.loadCommand = jest.fn(over.loadCommand || ((filePath) => {
    const file = path.basename(filePath);
    if (!(file in names)) throw new Error(`unexpected load of ${file}`);
    const value = names[file];
    if (value instanceof Error) throw value;
    return typeof value === 'string' ? fakeModule(value) : value;
  }));
  return deps;
}

const INPUT = { isDev: true, discordId: '123' };

/** every model write accessor across the fake models */
function expectNoWrites(deps) {
  for (const name of ['Games', 'Players', 'Tiles', 'Classes', 'Layers']) {
    expect(deps.models[name].update).not.toHaveBeenCalled();
    expect(deps.models[name].create).not.toHaveBeenCalled();
    expect(deps.models[name].destroy).not.toHaveBeenCalled();
  }
}

describe('reloadCommands parse', () => {
  it('maps the dev flag and the actor, and declares no options', () => {
    const input = logic.parse({}, { discordId: '123', username: 'snage', isDev: true });
    expect(input).toEqual({ isDev: true, discordId: '123' });
  });

  it('turns a missing dev flag into false', () => {
    const input = logic.parse({}, { discordId: '456', username: 'nobody' });
    expect(input).toEqual({ isDev: false, discordId: '456' });
  });

  it('only an exact true counts as dev', () => {
    expect(logic.parse({}, { discordId: '456', isDev: 'yes' }).isDev).toBe(false);
    expect(logic.parse({}, { discordId: '456', isDev: 1 }).isDev).toBe(false);
  });

  it('ignores any raw options handed to it', () => {
    expect(logic.parse({ game: 3, layer: 'x' }, { discordId: '1', isDev: true }))
      .toEqual({ isDev: true, discordId: '1' });
  });
});

describe('reloadCommands run rejections', () => {
  it('rejects a non-dev caller, loads nothing and writes nothing', async () => {
    const deps = happyDeps();
    const result = await logic.run({ ...INPUT, isDev: false }, deps);
    expect(result).toEqual({ ok: false, reason: REJECTIONS.NOT_DEV });
    expect(deps.fs.readdirSync).not.toHaveBeenCalled();
    expect(deps.loadCommand).not.toHaveBeenCalled();
    expectNoWrites(deps);
  });

  // The dev flag is this command's only gate: there is no AP spend, no board
  // geometry and no player lookup, so there are no AP or range boundaries to
  // exercise. The boundary that does exist here is the file filter, covered
  // in "run file selection" below.
});

describe('reloadCommands run file selection', () => {
  it('reloads every command file in every folder', async () => {
    const deps = happyDeps();
    const result = await logic.run(INPUT, deps);
    expect(result.ok).toBe(true);
    expect(result.kind).toBe('reloaded');
    expect(result.data.reloaded.map((c) => c.name)).toEqual(['gift', 'board', 'reload-commands']);
    expect(result.data.failures).toEqual([]);
  });

  it('resolves each module by its real path, not by its slash name', async () => {
    const deps = happyDeps();
    await logic.run(INPUT, deps);
    expect(deps.loadCommand).toHaveBeenCalledWith(path.join(ROOT, 'Player Commands', 'gift.js'));
    expect(deps.loadCommand).toHaveBeenCalledWith(path.join(ROOT, 'Developer Commands', 'reloadCommands.js'));
    // the old code asked for ./<slash name>.js inside Developer Commands
    expect(deps.loadCommand).not.toHaveBeenCalledWith(path.join(ROOT, 'Developer Commands', 'reload-commands.js'));
  });

  it('carries the fresh module through for the adapter to set on the client', async () => {
    const deps = happyDeps();
    const result = await logic.run(INPUT, deps);
    for (const entry of result.data.reloaded) {
      expect(entry.command.data.name).toBe(entry.name);
      expect(typeof entry.command.execute).toBe('function');
      expect(entry.filePath).toContain(ROOT);
    }
  });

  it('never reads a non-directory in the commands root as a folder', async () => {
    const deps = happyDeps();
    await logic.run(INPUT, deps);
    expect(deps.fs.readdirSync).not.toHaveBeenCalledWith(path.join(ROOT, '_adapter.js'));
    expect(deps.fs.readdirSync).not.toHaveBeenCalledWith(path.join(ROOT, '_deps.js'));
    expect(deps.fs.readdirSync).toHaveBeenCalledTimes(3); // root + 2 folders
  });

  it('skips .logic.js siblings and _-prefixed shared files', async () => {
    const deps = happyDeps({
      tree: { Only: ['a.js', 'a.logic.js', '_shared.js', 'notes.md'] },
      names: { 'a.js': 'a' },
    });
    const result = await logic.run(INPUT, deps);
    expect(deps.loadCommand).toHaveBeenCalledTimes(1);
    expect(deps.loadCommand).toHaveBeenCalledWith(path.join(ROOT, 'Only', 'a.js'));
    expect(result.data.reloaded.map((c) => c.name)).toEqual(['a']);
  });

  it('skips a module with no data/execute instead of crashing on it', async () => {
    const deps = happyDeps({
      tree: { Only: ['good.js', 'helper.js', 'nodata.js', 'noexec.js'] },
      names: {
        'good.js': 'good',
        'helper.js': {},
        'nodata.js': { execute: () => {} },
        'noexec.js': { data: { name: 'noexec' } },
      },
    });
    const result = await logic.run(INPUT, deps);
    expect(result.ok).toBe(true);
    expect(result.data.reloaded.map((c) => c.name)).toEqual(['good']);
    expect(result.data.skipped.map((s) => s.file)).toEqual(['helper.js', 'nodata.js', 'noexec.js']);
    expect(result.data.failures).toEqual([]);
  });

  it('records a module that throws on require as a failure and keeps going', async () => {
    const deps = happyDeps({
      tree: { Only: ['broken.js', 'fine.js'] },
      names: { 'broken.js': new Error('boom'), 'fine.js': 'fine' },
    });
    const result = await logic.run(INPUT, deps);
    expect(result.ok).toBe(true);
    expect(result.data.failures).toEqual([{ name: 'broken', message: 'boom' }]);
    expect(result.data.reloaded.map((c) => c.name)).toEqual(['fine']);
  });

  it('returns empty lists for a tree with no command files', async () => {
    const deps = happyDeps({ tree: { Diagrams: ['board.drawio'] }, names: {} });
    const result = await logic.run(INPUT, deps);
    expect(result).toEqual({ ok: true, kind: 'reloaded', data: { reloaded: [], failures: [], skipped: [] } });
    expect(deps.loadCommand).not.toHaveBeenCalled();
  });

  // QUIRK (preserved): the walk has no allow-list of folders - every directory
  // under commands/ is scanned, decommissioned code included, exactly as
  // index.js does when it builds the collection at boot.
  it('scans every directory, including decommissioned', async () => {
    const deps = happyDeps({
      tree: { 'Player Commands': ['gift.js'], decommissioned: ['createRoles.js'] },
      names: { 'gift.js': 'gift', 'createRoles.js': 'create-roles' },
    });
    const result = await logic.run(INPUT, deps);
    expect(result.data.reloaded.map((c) => c.name)).toEqual(['gift', 'create-roles']);
  });

  it('writes nothing to the database on the success path either', async () => {
    const deps = happyDeps();
    await logic.run(INPUT, deps);
    expectNoWrites(deps);
  });

  // The gamestate table. This command deliberately has NO gamestate gate - the
  // dev reloads code no matter what any game is doing - so the table pins that
  // absence: adding a state that should block a reload breaks this test.
  it.each(Object.values(GAMESTATES))('reloads regardless of gamestate %s', async (state) => {
    const deps = happyDeps({ game: createFakeGame({ GAME_STATE: state }) });
    const result = await logic.run(INPUT, deps);
    expect(result.ok).toBe(true);
    expect(result.data.reloaded).toHaveLength(3);
    // the gamestate is never even read: run() makes no database call
    expect(deps.models.Games.findByPk).not.toHaveBeenCalled();
  });

  it('covers all 8 gamestates in the table above', () => {
    expect(Object.values(GAMESTATES)).toHaveLength(8);
  });
});

describe('reloadCommands present', () => {
  it('renders one line per reloaded command, in the legacy wording', () => {
    const out = logic.present({
      ok: true,
      kind: 'reloaded',
      data: { reloaded: [{ name: 'gift' }, { name: 'board' }], failures: [], skipped: [] },
    });
    expect(out).toEqual({ content: 'Command `gift` was reloaded!\nCommand `board` was reloaded!' });
  });

  it('renders a failed module in the legacy error wording', () => {
    const out = logic.present({
      ok: true,
      kind: 'reloaded',
      data: { reloaded: [], failures: [{ name: 'broken', message: 'boom' }], skipped: [] },
    });
    expect(out).toEqual({ content: 'There was an error while reloading a command `broken`:\n`boom`' });
  });

  it('renders successes and failures together in one reply', () => {
    const out = logic.present({
      ok: true,
      kind: 'reloaded',
      data: { reloaded: [{ name: 'gift' }], failures: [{ name: 'broken', message: 'boom' }], skipped: [] },
    });
    expect(out).toEqual({
      content: 'Command `gift` was reloaded!\nThere was an error while reloading a command `broken`:\n`boom`',
    });
  });

  it('never renders empty content', () => {
    const out = logic.present({ ok: true, kind: 'reloaded', data: { reloaded: [], failures: [], skipped: [] } });
    expect(out).toEqual({ content: 'No commands were found to reload!' });
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

describe('reloadCommands adapter (smoke)', () => {
  it('exports the command contract', () => {
    expect(reloadCommands.data.toJSON().name).toBe('reload-commands');
    expect(typeof reloadCommands.execute).toBe('function');
  });
});
