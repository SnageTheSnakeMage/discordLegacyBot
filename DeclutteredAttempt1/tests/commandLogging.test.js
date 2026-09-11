/**
 * Logging around command run() calls.
 *
 * The wrapper has to be invisible: it returns exactly what run() returned
 * and rethrows exactly what run() threw. If it ever swallows a result or an
 * error, every command breaks at once - so those two are pinned first.
 */
const { runLogged, summarise, describe: describeResult } = require('../commands/_logging.js');

function fakeLogger() {
  const lines = { debug: [], info: [], error: [] };
  const child = {
    debug: (obj, msg) => lines.debug.push({ obj, msg }),
    info: (obj, msg) => lines.info.push({ obj, msg }),
    error: (obj, msg) => lines.error.push({ obj, msg }),
  };
  return { logger: { child: () => child }, lines };
}

describe('runLogged', () => {
  it('returns exactly what run() returned', async () => {
    const { logger } = fakeLogger();
    const result = { ok: true, kind: 'burned', data: { x: 1 } };
    const logic = { run: jest.fn(async () => result) };
    expect(await runLogged('burn', logic, { a: 1 }, logger)).toBe(result);
    expect(logic.run).toHaveBeenCalledWith({ a: 1 });
  });

  it('rethrows exactly what run() threw', async () => {
    const { logger, lines } = fakeLogger();
    const boom = new Error('kaboom');
    const logic = { run: async () => { throw boom; } };
    await expect(runLogged('burn', logic, {}, logger)).rejects.toBe(boom);
    // and it is recorded before the central handler sees it
    expect(lines.error).toHaveLength(1);
    expect(lines.error[0].msg).toBe('burn: threw');
  });

  it('logs the input on entry and the outcome on exit', async () => {
    const { logger, lines } = fakeLogger();
    const logic = { run: async () => ({ ok: true, kind: 'burned' }) };
    await runLogged('burn', logic, { gameId: 1, x: 2 }, logger);
    expect(lines.debug[0].obj.input).toEqual({ gameId: 1, x: 2 });
    expect(lines.info[0].obj).toMatchObject({ outcome: 'ok', kind: 'burned' });
    expect(typeof lines.info[0].obj.ms).toBe('number');
  });

  it('records a rejection with its reason', async () => {
    const { logger, lines } = fakeLogger();
    const logic = { run: async () => ({ ok: false, reason: 'NOT_ENOUGH_AP' }) };
    await runLogged('burn', logic, {}, logger);
    expect(lines.info[0].obj).toMatchObject({ outcome: 'rejected', reason: 'NOT_ENOUGH_AP' });
  });

  it('works with no logger at all, so tests and scripts are unaffected', async () => {
    const logic = { run: async () => ({ ok: true, kind: 'burned' }) };
    expect(await runLogged('burn', logic, {}, null)).toEqual({ ok: true, kind: 'burned' });
  });
});

describe('summarise', () => {
  it('drops fields that are never worth writing down', () => {
    expect(summarise({ gameId: 1, iconUrl: 'https://cdn/x.png' }))
      .toEqual({ gameId: 1, iconUrl: '[omitted]' });
  });

  it('truncates long player-supplied strings', () => {
    const long = 'x'.repeat(500);
    const out = summarise({ note: long });
    expect(out.note.length).toBeLessThan(140);
    expect(out.note.endsWith('...')).toBe(true);
  });

  it('passes ordinary values through untouched', () => {
    const input = { gameId: 1, x: 2, direction: 'east', body: null };
    expect(summarise(input)).toEqual(input);
  });
});

describe('describe', () => {
  it.each([
    [{ ok: true, kind: 'burned' }, { outcome: 'ok', kind: 'burned' }],
    [{ ok: false, reason: 'GAME_OVER' }, { outcome: 'rejected', reason: 'GAME_OVER' }],
    [null, { outcome: 'empty' }],
  ])('flattens %j', (result, expected) => {
    expect(describeResult(result)).toEqual(expected);
  });
});
