/**
 * Every `amount` option is a whole number of at least 1, on both sides of the
 * Discord boundary: the catalogue tells Discord the minimum, and each
 * command's run() refuses anything else before it reads a row.
 *
 * Walking the catalogue covers every command with an `amount`, including one
 * added later, rather than trusting each command's own suite to remember.
 */
const fs = require('fs');
const path = require('path');
const { COMMANDS } = require('../commandCatalog.js');
const { REJECTIONS } = require('../enums.js');

const COMMANDS_DIR = path.join(__dirname, '..', 'commands');

// command name -> its logic file, found through the adapter that builds it
function logicFileFor(name) {
  for (const dir of fs.readdirSync(COMMANDS_DIR)) {
    const full = path.join(COMMANDS_DIR, dir);
    if (!fs.statSync(full).isDirectory() || dir === 'decommissioned') continue;
    for (const f of fs.readdirSync(full)) {
      if (!f.endsWith('.js') || f.endsWith('.logic.js')) continue;
      if (fs.readFileSync(path.join(full, f), 'utf8').includes(`buildData('${name}')`)) {
        return path.join(full, f.replace(/\.js$/, '.logic.js'));
      }
    }
  }
  return null;
}

const withAmount = Object.entries(COMMANDS)
  .filter(([, entry]) => entry.options && entry.options.amount)
  .map(([name, entry]) => ({ name, option: entry.options.amount }));

const BAD_AMOUNTS = [0, -1, -3, 1.5];

describe('the amount option of every command', () => {
  it('finds the commands that take one', () => {
    expect(withAmount.map((c) => c.name)).toEqual(expect.arrayContaining(['stab', 'shoot', 'store', 'retrieve']));
  });

  it('is declared to Discord as an integer of at least 1', () => {
    const offenders = withAmount
      .filter(({ option }) => option.kind !== 'integer' || !(option.min >= 1))
      .map(({ name }) => name);
    expect(offenders).toEqual([]);
  });

  it('is refused by run() when it is not a whole number of at least 1', async () => {
    const offenders = [];
    for (const { name } of withAmount) {
      const file = logicFileFor(name);
      if (!file || !fs.existsSync(file)) {
        offenders.push(`${name}: no logic file`);
        continue;
      }
      const logic = require(file);
      for (const amount of BAD_AMOUNTS) {
        const input = logic.parse({ amount }, { discordId: '1' });
        // deps are empty: the gate has to answer before anything is looked up
        const result = await logic.run(input, {}).catch((e) => ({ threw: String(e) }));
        if (result.reason !== REJECTIONS.INVALID_AMOUNT) {
          offenders.push(`${name} amount ${amount}: ${JSON.stringify(result)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
