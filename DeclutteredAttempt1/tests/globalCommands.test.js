/**
 * scripts/globalCommands.logic.js - the tool for the one list nothing else
 * touches.
 *
 * deploy-commands.js PUTs the whole GUILD set, so a stale guild command is
 * deleted by the next registration. Global commands are a separate list that
 * PUT never reaches: `/upgrade-range` outlived its implementation there, in
 * every guild, with nothing behind it. These cover the decisions - what counts
 * as a match, and what happens when nothing does - without a token or a
 * network, because `api` is the only way out of the logic.
 */
const { parseArgs, run, present } = require('../scripts/globalCommands.logic.js');

const COMMANDS = [
  { id: '11111111111111111', name: 'upgrade-range' },
  { id: '22222222222222222', name: 'stats' },
];

/** records every call, so a test can assert that nothing was deleted */
function fakeApi(commands = COMMANDS) {
  const calls = [];
  return {
    calls,
    list: async () => { calls.push('list'); return commands; },
    remove: async (id) => { calls.push(`remove:${id}`); },
    removeAll: async () => { calls.push('removeAll'); },
  };
}

describe('global-commands argument parsing', () => {
  it('lists by default', () => {
    expect(parseArgs([])).toEqual({ mode: 'list' });
  });

  it('takes a delete target', () => {
    expect(parseArgs(['--delete', 'upgrade-range'])).toEqual({ mode: 'delete', target: 'upgrade-range' });
    expect(parseArgs(['--delete-all'])).toEqual({ mode: 'delete-all' });
  });

  // Every one of these used to be a plausible way to delete the wrong thing,
  // or nothing, while looking like it worked.
  it('refuses anything ambiguous rather than guessing', () => {
    const offenders = [];
    const bad = [
      ['--delete'], // no target: must not silently become a list
      ['--delete', 'a', 'b'], // two targets: which one?
      ['--delete-all', 'stats'], // an argument that would be ignored
      ['--purge'], // not a flag this understands
      ['stats'], // a bare name, with no verb
    ];
    for (const argv of bad) {
      try {
        parseArgs(argv);
        offenders.push(`${argv.join(' ') || '(empty)'}: accepted, should have thrown`);
      } catch (err) {
        if (!/usage:/.test(err.message)) offenders.push(`${argv.join(' ')}: message has no usage - "${err.message}"`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('global-commands listing', () => {
  it('reports every global command with its id, which is what a delete needs', async () => {
    const api = fakeApi();
    const out = present(await run(parseArgs([]), { api }));
    expect(out).toContain('/upgrade-range');
    expect(out).toContain('11111111111111111');
    expect(api.calls).toEqual(['list']); // and listing deletes nothing
  });

  it('says so plainly when there are none', async () => {
    const out = present(await run(parseArgs([]), { api: fakeApi([]) }));
    expect(out).toBe('no global commands registered');
  });
});

describe('global-commands deleting', () => {
  it('deletes by name, by id, and by the name as typed in Discord', async () => {
    const offenders = [];
    for (const target of ['upgrade-range', '/upgrade-range', '11111111111111111']) {
      const api = fakeApi();
      const result = await run(parseArgs(['--delete', target]), { api });
      if (result.command.id !== '11111111111111111') offenders.push(`${target}: matched ${result.command.name}`);
      if (!api.calls.includes('remove:11111111111111111')) offenders.push(`${target}: did not delete`);
    }
    expect(offenders).toEqual([]);
  });

  // A global delete cannot be undone except by registering the command again,
  // and Discord takes up to an hour either way - so a near miss must not
  // become a delete of something else.
  it('deletes nothing when the target does not exist, and names what does', async () => {
    const api = fakeApi();
    await expect(run(parseArgs(['--delete', 'upgrade-rangee']), { api }))
      .rejects.toThrow(/no global command matches "upgrade-rangee".*\/upgrade-range/s);
    expect(api.calls).toEqual(['list']);
  });

  it('does not treat an unknown id as a name, or delete the first thing it sees', async () => {
    const api = fakeApi();
    await expect(run(parseArgs(['--delete', '99999999999999999']), { api })).rejects.toThrow(/no global command matches/);
    expect(api.calls).toEqual(['list']);
  });

  it('clears the whole set in one request', async () => {
    const api = fakeApi();
    const result = await run(parseArgs(['--delete-all']), { api });
    expect(api.calls).toEqual(['list', 'removeAll']);
    expect(present(result)).toContain('/upgrade-range');
  });

  it('does not send a delete when the set is already empty', async () => {
    const api = fakeApi([]);
    const result = await run(parseArgs(['--delete-all']), { api });
    expect(api.calls).toEqual(['list']);
    expect(present(result)).toBe('no global commands to delete');
  });
});
