/**
 * everyCase stands in for it.each across the suite, so a check it failed to
 * run, or a failure it failed to report, would pass every table silently.
 */
const { everyCase } = require('./helpers/everyCase.js');

describe('everyCase', () => {
  it('runs the check once per row, spreading array rows and passing the rest whole', async () => {
    const seen = [];
    const failures = await everyCase('%s', [[1, 2], [3, 4], 'plain'], (...args) => { seen.push(args); });
    expect(failures).toEqual([]);
    expect(seen).toEqual([[1, 2], [3, 4], ['plain']]);
  });

  it('reports every failing row, labelled by the title and what the expectation said', async () => {
    const failures = await everyCase('%s doubles to %i', [[1, 2], [2, 5], [3, 7]], async (n, doubled) => {
      expect(n * 2).toBe(doubled);
    });
    expect(failures).toHaveLength(2);
    expect(failures[0]).toMatch(/^2 doubles to 5: Expected: 5 \| Received: 4$/);
    expect(failures[1]).toMatch(/^3 doubles to 7: /);
  });

  it('reports a thrown non-Error too', async () => {
    const failures = await everyCase('%s', ['x'], () => { throw 'tile is full'; });
    expect(failures).toEqual(['x: tile is full']);
  });
});
