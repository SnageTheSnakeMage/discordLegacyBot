/**
 * The Classes seed is a hand-editable spreadsheet now, so a bad edit has to
 * fail loudly rather than quietly seeding a broken class table. These pin
 * the CSV parser and the seed file's own integrity.
 */
const fs = require('fs');
const path = require('path');
const { parseCsv, readSeed } = require('../scripts/bootstrap-db.js');

const SEED = path.join(__dirname, '..', 'database', 'seed', 'classes.csv');

describe('parseCsv', () => {
  it.each([
    ['plain rows', 'a,b\n1,2\n', [['a', 'b'], ['1', '2']]],
    ['a comma inside a quoted field', 'a,b\n"x,y",2\n', [['a', 'b'], ['x,y', '2']]],
    ['a doubled quote', 'a\n"he said ""hi"""\n', [['a'], ['he said "hi"']]],
    ['a newline inside a quoted field', 'a,b\n"l1\nl2",2\n', [['a', 'b'], ['l1\nl2', '2']]],
    ['CRLF line endings', 'a,b\r\n1,2\r\n', [['a', 'b'], ['1', '2']]],
    ['an empty field', 'a,b\n,2\n', [['a', 'b'], ['', '2']]],
    ['no trailing newline', 'a,b\n1,2', [['a', 'b'], ['1', '2']]],
  ])('handles %s', (_label, input, expected) => {
    expect(parseCsv(input)).toEqual(expected);
  });
});

describe('classes.csv', () => {
  const classes = readSeed();

  it('seeds every class with a unique id and name', () => {
    expect(classes).toHaveLength(38);
    expect(new Set(classes.map((c) => c.Class_ID)).size).toBe(38);
    expect(new Set(classes.map((c) => c.Class_Name)).size).toBe(38);
  });

  it('keeps the ids commands hard-code', () => {
    // checkTarget gates on Class_ID != 10, so Hitman must stay id 10
    expect(classes.find((c) => c.Class_Name === 'Hitman').Class_ID).toBe(10);
  });

  it('carries the classes utils looks up by name', () => {
    // distributeAP and the integration fixtures resolve these by Class_Name
    const names = classes.map((c) => c.Class_Name);
    for (const n of ['Average', 'Lava Diver', 'Glutton', 'Immutable', 'Chef', 'Hitman', 'Pyromaniac', 'Snowman']) {
      expect(names).toContain(n);
    }
  });

  it('parses every stat as a number and every class with a description', () => {
    for (const c of classes) {
      for (const k of ['Class_ID', 'Start_AP', 'Start_MAX_AP', 'Start_HP', 'Start_MAX_HP',
        'Start_Range_', 'Start_MAX_Range_', 'Start_Damage', 'Start_MAX_Damage']) {
        expect(typeof c[k]).toBe('number');
        expect(Number.isNaN(c[k])).toBe(false);
      }
      expect(c.Description.length).toBeGreaterThan(0);
      expect(c.Role_Color).toMatch(/^#?[0-9a-fA-F]{6}$/);
    }
  });

  it('rejects a row with the wrong number of fields', () => {
    const good = fs.readFileSync(SEED, 'utf8');
    const broken = `${good.trimEnd()}\n39,Broken,0,12\n`;
    const spy = jest.spyOn(fs, 'readFileSync').mockReturnValue(broken);
    expect(() => readSeed()).toThrow(/line 40: got 4 fields, expected 12/);
    spy.mockRestore();
  });

  it('rejects a stat that is not a number', () => {
    const broken = 'id,class,ap,max_ap,hp,max_hp,range,max_range,damage,max_damage,color,description\n'
      + '1,Vampyr,N/A,12,6,12,1,6,1,2,CB0000,desc\n';
    const spy = jest.spyOn(fs, 'readFileSync').mockReturnValue(broken);
    expect(() => readSeed()).toThrow(/column "ap" is "N\/A", which is not a number/);
    spy.mockRestore();
  });

  it('rejects an unknown column', () => {
    const spy = jest.spyOn(fs, 'readFileSync').mockReturnValue('id,class,nonsense\n1,Vampyr,x\n');
    expect(() => readSeed()).toThrow(/unknown column\(s\): nonsense/);
    spy.mockRestore();
  });
});
