/**
 * The rule: a logic file over 200 lines, comments excluded, logs its own
 * internals - not just the entry/exit pair that runLogged puts around run().
 *
 * This is a structural guard, like tests/clockwatcherGate.test.js. It is here
 * so the rule survives the next command conversion: a logic file that grows
 * past the threshold fails this test until it is given step logging, and the
 * failure names the file.
 *
 * Counting: comment-only lines (// and /* ... *\/ ) and blank lines are not
 * code. That is the reading of "200 lines excluding comments" that does not
 * let a file dodge the rule by carrying a long banner comment - move.logic.js
 * has 89 lines of preamble explaining what it fixed.
 */
const fs = require('fs');
const path = require('path');

const COMMANDS_DIR = path.join(__dirname, '..', 'commands');
const THRESHOLD = 200;

function logicFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) logicFiles(full, out);
    else if (entry.name.endsWith('.logic.js')) out.push(full);
  }
  return out;
}

/** lines that are neither blank nor comment-only */
function codeLineCount(source) {
  let count = 0;
  let inBlockComment = false;
  for (const raw of source.split('\n')) {
    const line = raw.trim();
    if (inBlockComment) {
      if (line.includes('*/')) inBlockComment = false;
      continue;
    }
    if (line.startsWith('/*')) {
      if (!line.includes('*/')) inBlockComment = true;
      continue;
    }
    if (line.startsWith('//') || line === '') continue;
    count++;
  }
  return count;
}

const files = logicFiles(COMMANDS_DIR).map((file) => ({
  file,
  relative: path.relative(COMMANDS_DIR, file),
  source: fs.readFileSync(file, 'utf8'),
})).map((entry) => ({ ...entry, codeLines: codeLineCount(entry.source) }));

describe('code line counting', () => {
  it('does not count comment-only or blank lines', () => {
    expect(codeLineCount('const a = 1;')).toBe(1);
    expect(codeLineCount('// just a comment')).toBe(0);
    expect(codeLineCount('\n\n\n')).toBe(0);
    expect(codeLineCount('/* block\n * spanning\n * lines\n */\nconst a = 1;')).toBe(1);
    expect(codeLineCount('/* one liner */\nconst a = 1;')).toBe(1);
    // code with a trailing comment is still code
    expect(codeLineCount('const a = 1; // why')).toBe(1);
  });
});

describe('logic files over 200 non-comment lines log their internals', () => {
  const large = files.filter((entry) => entry.codeLines > THRESHOLD);

  it('finds the files the rule applies to', () => {
    // if this list is empty the guard below is vacuous, so assert it is not
    expect(large.length).toBeGreaterThan(0);
    expect(large.map((entry) => entry.relative)).toContain(path.join('Player Commands', 'move.logic.js'));
  });

  it.each(large.map((entry) => [entry.relative, entry]))('%s requires stepLogger', (_relative, entry) => {
    expect(entry.source).toMatch(/require\((['"]).*_logging\.js\1\)/);
    expect(entry.source).toMatch(/stepLogger/);
  });

  it.each(large.map((entry) => [entry.relative, entry]))('%s actually calls its step logger', (_relative, entry) => {
    // stepLogger returns the logging function; a file that requires it and
    // never calls it has the import and none of the logging. Counting to a
    // fixed minimum was churn, not a guard: merging two trace() calls while
    // logging exactly as much used to fail this.
    const calls = entry.source.match(/(?<![\w.])trace\(/g) || [];
    expect(calls.length).toBeGreaterThan(0);
  });
});

describe('logic files under the threshold', () => {
  it('are the majority - the wrapper around run() is their whole logging story', () => {
    // This used to also assert
    //   small.length === files.length - files.filter(over threshold).length
    // which is the same partition computed twice: true for any file set and
    // any threshold, including an empty one. It could not fail. What is worth
    // pinning is that the rule applies to a minority, so the guard above is
    // about a few large files rather than quietly covering everything.
    const small = files.filter((entry) => entry.codeLines <= THRESHOLD);
    expect(small.length).toBeGreaterThan(30);
    expect(small.length).toBeGreaterThan(files.length - small.length);
  });
});
