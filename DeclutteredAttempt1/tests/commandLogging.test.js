/**
 * Logging around command run() calls.
 *
 * The wrapper has to be invisible: it returns exactly what run() returned
 * and rethrows exactly what run() threw. If it ever swallows a result or an
 * error, every command breaks at once - so those two are pinned first.
 */
const { runLogged, stepLogger, summarise, describe: describeResult } = require('../commands/_logging.js');

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

describe('stepLogger', () => {
  const noGlobalLogger = () => {
    const saved = globalThis.topLogger;
    globalThis.topLogger = undefined;
    return () => { globalThis.topLogger = saved; };
  };

  it('writes one debug line per step, tagged with the command', () => {
    const { logger, lines } = fakeLogger();
    const trace = stepLogger('move', { logger });

    trace('destination', { to: [3, 4] });

    expect(lines.debug).toHaveLength(1);
    expect(lines.debug[0].msg).toBe('move: destination');
    expect(lines.debug[0].obj).toEqual({ function: 'destination', to: [3, 4] });
    // steps are debug only: they are for reconstructing a turn, not for
    // normal operation, so they must never reach info or error
    expect(lines.info).toHaveLength(0);
    expect(lines.error).toHaveLength(0);
  });

  it('redacts step details the same way run() input is redacted', () => {
    const { logger, lines } = fakeLogger();
    const trace = stepLogger('move', { logger });

    trace('pathVerified', { path: 'x'.repeat(400), iconUrl: 'http://example.invalid/i.png' });

    const logged = lines.debug[0].obj;
    expect(logged.path.endsWith('...')).toBe(true);
    expect(logged.path.length).toBeLessThan(140);
    expect(logged.iconUrl).toBe('[omitted]');
  });

  it('is a no-op function when there is no logger at all', () => {
    const restore = noGlobalLogger();
    try {
      const trace = stepLogger('move', {});
      // the point of the guarantee: a logic file called from a test that
      // injects no logger behaves exactly as it did before step logging
      expect(typeof trace).toBe('function');
      expect(() => trace('destination', { to: [1, 2] })).not.toThrow();
      expect(trace('destination')).toBeUndefined();
    } finally {
      restore();
    }
  });

  it('falls back to the global logger when deps carries none', () => {
    const { logger, lines } = fakeLogger();
    const saved = globalThis.topLogger;
    globalThis.topLogger = logger;
    try {
      stepLogger('move', {})('cost', { spentAP: 4 });
      expect(lines.debug).toHaveLength(1);
      expect(lines.debug[0].obj.spentAP).toBe(4);
    } finally {
      globalThis.topLogger = saved;
    }
  });

  it('prefers the injected logger over the global one', () => {
    const injected = fakeLogger();
    const global = fakeLogger();
    const saved = globalThis.topLogger;
    globalThis.topLogger = global.logger;
    try {
      stepLogger('move', { logger: injected.logger })('step', { index: 0 });
      expect(injected.lines.debug).toHaveLength(1);
      expect(global.lines.debug).toHaveLength(0);
    } finally {
      globalThis.topLogger = saved;
    }
  });

  it('survives a logger with no child()', () => {
    const restore = noGlobalLogger();
    try {
      const trace = stepLogger('move', { logger: { debug: () => { throw new Error('should not be called'); } } });
      expect(() => trace('step', {})).not.toThrow();
    } finally {
      restore();
    }
  });
});
