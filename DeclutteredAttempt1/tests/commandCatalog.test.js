/**
 * commandCatalog.js is hand-edited, and a bad entry is not a test failure by
 * itself - it is a rejected command at deploy time, and Discord rejects the
 * whole PUT, so one typo takes every command down. These tests are the guard
 * rail that turns that into a red suite instead.
 *
 * They also pin the thing the catalogue exists for: the name and kind of an
 * option are written once and feed both the builder and readOptions.
 */
const fs = require('fs');
const path = require('path');
const { COMMANDS } = require('../commandCatalog.js');
const { buildData, optionSpec } = require('../commands/_catalog.js');

// Discord's rule for a chat-input command or option name
const NAME = /^[a-z0-9_-]{1,32}$/;
const MAX_DESCRIPTION = 100;

/** every option in the catalogue, flattened, as [label, spec] */
function allOptions() {
  const out = [];
  for (const [name, entry] of Object.entries(COMMANDS)) {
    for (const [optionName, spec] of Object.entries(entry.options || {})) {
      out.push([`${name}.${optionName}`, optionName, spec]);
    }
    for (const [subName, sub] of Object.entries(entry.subcommands || {})) {
      for (const [optionName, spec] of Object.entries(sub.options || {})) {
        out.push([`${name}.${subName}.${optionName}`, optionName, spec]);
      }
    }
  }
  return out;
}

describe('commandCatalog entries are ones Discord will accept', () => {
  // These collect every offender rather than running one case per entry: the
  // failing expectation names them all at once, and the suite's test count
  // stays a count of rules rather than of catalogue rows.
  it('gives every command a legal name and a 1-100 character description', () => {
    const offenders = [];
    for (const [name, entry] of Object.entries(COMMANDS)) {
      if (!NAME.test(name)) offenders.push(`${name}: illegal name`);
      if (entry.description.length === 0) offenders.push(`${name}: empty description`);
      // the longest description in the catalogue is exactly 100 characters, so
      // this is not hypothetical: one more word breaks the deploy
      if (entry.description.length > MAX_DESCRIPTION) {
        offenders.push(`${name}: description is ${entry.description.length} characters`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('gives every option a legal name and a 1-100 character description', () => {
    const offenders = [];
    for (const [label, optionName, spec] of allOptions()) {
      if (!NAME.test(optionName)) offenders.push(`${label}: illegal name`);
      if (spec.description.length === 0) offenders.push(`${label}: empty description`);
      if (spec.description.length > MAX_DESCRIPTION) {
        offenders.push(`${label}: description is ${spec.description.length} characters`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('never declares a required option after an optional one', () => {
    // Discord rejects the command outright when they are out of order
    const offenders = [];
    const check = (label, options) => {
      let seenOptional = false;
      for (const [optionName, spec] of Object.entries(options || {})) {
        if (spec.required) { if (seenOptional) offenders.push(`${label}.${optionName}`); }
        else seenOptional = true;
      }
    };
    for (const [name, entry] of Object.entries(COMMANDS)) {
      check(name, entry.options);
      for (const [subName, sub] of Object.entries(entry.subcommands || {})) check(`${name}.${subName}`, sub.options);
    }
    expect(offenders).toEqual([]);
  });

  it('never mixes top-level options with subcommands', () => {
    // Discord rejects this combination, and one rejected command fails the
    // whole deploy
    const mixed = Object.entries(COMMANDS)
      .filter(([, entry]) => entry.options && entry.subcommands)
      .map(([name]) => name);
    expect(mixed).toEqual([]);
  });

  it('stays inside the 25-option, 25-subcommand and 25-choice limits', () => {
    const tooMany = [];
    for (const [name, entry] of Object.entries(COMMANDS)) {
      if (Object.keys(entry.options || {}).length > 25) tooMany.push(`${name} options`);
      if (Object.keys(entry.subcommands || {}).length > 25) tooMany.push(`${name} subcommands`);
    }
    for (const [label, , spec] of allOptions()) {
      if (spec.choices && spec.choices.length > 25) tooMany.push(`${label} choices`);
    }
    expect(tooMany).toEqual([]);
  });
});

describe('the catalogue and the command files agree', () => {
  /** every adapter on disk, the way index.js and deploy-commands.js load them */
  const adapters = [];
  const commandsPath = path.join(__dirname, '..', 'commands');
  for (const folder of fs.readdirSync(commandsPath).filter((e) => fs.statSync(path.join(commandsPath, e)).isDirectory())) {
    for (const file of fs.readdirSync(path.join(commandsPath, folder))
      .filter((f) => f.endsWith('.js') && !f.endsWith('.logic.js') && !f.startsWith('_'))) {
      adapters.push([`${folder}/${file}`, path.join(commandsPath, folder, file)]);
    }
  }

  it('found the command files', () => {
    expect(adapters.length).toBeGreaterThan(40);
  });

  it('has every command file exporting data built from a catalogue entry', () => {
    const offenders = [];
    for (const [label, file] of adapters) {
      const command = require(file);
      if (typeof command.execute !== 'function') offenders.push(`${label}: no execute`);
      if (!COMMANDS[command.data.name]) offenders.push(`${label}: "${command.data.name}" is not in the catalogue`);
    }
    expect(offenders).toEqual([]);
  });

  it('has no catalogue entry without a command file', () => {
    const onDisk = new Set(adapters.map(([, file]) => require(file).data.name));
    const orphans = Object.keys(COMMANDS).filter((name) => !onDisk.has(name));
    expect(orphans).toEqual([]);
  });
});

describe('buildData', () => {
  it('builds the name, description and options of a plain command', () => {
    const json = buildData('gift').toJSON();
    expect(json.name).toBe('gift');
    expect(json.description).toBe(COMMANDS.gift.description);
    expect(json.options.map((o) => o.name)).toEqual(['amount', 'player', 'game']);
    // amount is required with a minimum; game is neither
    expect(json.options[0]).toMatchObject({ required: true, min_value: 1 });
    expect(json.options[2].required).toBe(false);
  });

  it('resolves a permission and a context by name', () => {
    const json = buildData('reload-commands').toJSON();
    // BanMembers is bit 4, InteractionContextType.Guild is 0
    expect(json.default_member_permissions).toBe('4');
    expect(json.contexts).toEqual([0]);
  });

  it('builds subcommands with their own options', () => {
    const json = buildData('call-db').toJSON();
    expect(json.options.every((o) => o.type === 1)).toBe(true);
    expect(json.options.map((o) => o.name)).toEqual(['find-all', 'find-by-primary-key', 'update-player']);
    expect(json.options[0].options[0]).toMatchObject({ name: 'model', required: true });
  });

  it('names the command it cannot find, rather than throwing something opaque', () => {
    expect(() => buildData('no-such-command')).toThrow(/no entry for "no-such-command"/);
  });
});

describe('optionSpec', () => {
  it('gives readOptions the name and kind of every readable option', () => {
    expect(optionSpec('shoot')).toEqual({
      x: 'integer', y: 'integer', target: 'user', amount: 'integer', game: 'integer', body: 'integer',
    });
  });

  it('leaves attachments out, because readOptions has no kind for them', () => {
    // register declares an icon attachment and flattens it in its own adapter
    expect(COMMANDS.register.options.icon.kind).toBe('attachment');
    expect(optionSpec('register')).toEqual({ game: 'integer' });
  });

  it('flattens subcommand options, which readOptions asks for by name', () => {
    expect(optionSpec('call-db')).toEqual({ model: 'string' });
  });

  // reload-commands is the only option-less command left in the catalogue, so
  // this picks it by that property rather than by name - if it ever gains an
  // option, the assertion below says so instead of failing on a stale example
  it('is empty for a command that declares no options', () => {
    const optionless = Object.entries(COMMANDS)
      .filter(([, entry]) => !entry.options && !entry.subcommands)
      .map(([name]) => name);
    expect(optionless.length).toBeGreaterThan(0);
    for (const name of optionless) expect(optionSpec(name)).toEqual({});
  });
});
