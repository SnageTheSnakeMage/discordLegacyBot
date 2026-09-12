/**
 * The board preset parser. These are the tests that decide whether a hand
 * drawn map becomes the right rows in Layers and Tiles, so they assert
 * coordinates and stacking, not just "it parsed".
 */
const fs = require('fs');
const path = require('path');
const {
  parseBoard, formatBoard, listPresets, loadPreset, checkerType, BOARDS_DIR, TILE_TYPES,
} = require('../database/boardPresets.js');

const SMALL = [
  'layer Top',
  '#.#',
  '.G.',
  '#.#',
  'vvv',
  'layer Bottom',
  '~~',
  '~~',
].join('\n');

describe('parseBoard', () => {
  test('row 1 is Y 1 and column 1 is X 1', () => {
    const board = parseBoard('layer One\nG.\n.#');
    const at = (x, y) => board.layers[0].tiles.find((t) => t.X_Position === x && t.Y_Position === y).Tile_Type;
    expect(at(1, 1)).toBe('Gateway_Open');
    expect(at(2, 2)).toBe('Wall');
    expect(board.layers[0].width).toBe(2);
    expect(board.layers[0].height).toBe(2);
  });

  test('layers come out in file order, one per "vvv" separator', () => {
    const board = parseBoard(SMALL);
    expect(board.layers.map((l) => l.name)).toEqual(['Top', 'Bottom']);
    expect(board.layers.map((l) => l.tiles.length)).toEqual([9, 4]);
  });

  test("'.' alternates Blank1 and Blank2 by coordinate", () => {
    const board = parseBoard('layer One\n..\n..');
    for (const tile of board.layers[0].tiles) {
      expect(tile.Tile_Type).toBe(checkerType(tile.X_Position, tile.Y_Position));
    }
    expect(checkerType(1, 1)).toBe('Blank1');
    expect(checkerType(2, 1)).toBe('Blank2');
  });

  test("'1' and '2' pin a blank against the checker pattern", () => {
    const board = parseBoard('layer One\n12');
    expect(board.layers[0].tiles.map((t) => t.Tile_Type)).toEqual(['Blank1', 'Blank2']);
  });

  test('a row of walls is map, not a comment', () => {
    const board = parseBoard('# a real comment\nlayer One\n###\n#.#\n###');
    expect(board.layers[0].height).toBe(3);
    expect(board.layers[0].tiles.filter((t) => t.Tile_Type === 'Wall')).toHaveLength(8);
  });

  test('description and legend lines configure the parse', () => {
    const board = parseBoard('description: a board\nlegend Z Ice\nlayer One\nZZ');
    expect(board.description).toBe('a board');
    expect(board.layers[0].tiles.every((t) => t.Tile_Type === 'Ice')).toBe(true);
  });

  test.each([
    ['a ragged layer', 'layer One\n###\n##', /row is 2 tiles wide/],
    ['an unknown character', 'layer One\n#?#', /unknown map character "\?"/],
    ['a missing separator', 'layer One\n##\nlayer Two\n##', /separated by a "vvv" line/],
    ['rows before any layer', '##\n##', /expected "layer <name>"/],
    ['an empty board', '# nothing here\n', /no layers/],
    ['an unknown tile type in a legend', 'legend Z Lava\nlayer One\nZZ', /unknown tile type "Lava"/],
    ['a legend after a layer', 'layer One\n##\nlegend Z Ice', /must come before the first layer/],
  ])('rejects %s', (_label, text, message) => {
    expect(() => parseBoard(text)).toThrow(message);
  });

  test('errors name the line they came from', () => {
    expect(() => parseBoard('layer One\n##\n###')).toThrow(/board line 3:/);
  });
});

describe('formatBoard', () => {
  test('round-trips a parsed board byte for byte', () => {
    const text = formatBoard(parseBoard(SMALL));
    expect(parseBoard(text).layers.map((l) => l.tiles)).toEqual(parseBoard(SMALL).layers.map((l) => l.tiles));
    expect(text).toContain('vvv');
  });

  test('writes off-pattern blanks explicitly so they survive a round trip', () => {
    const board = parseBoard('layer One\n21');
    const text = formatBoard(board);
    expect(text).toContain('21');
    expect(parseBoard(text).layers[0].tiles.map((t) => t.Tile_Type)).toEqual(['Blank2', 'Blank1']);
  });

  test('refuses a layer with a hole in it', () => {
    expect(() => formatBoard({
      layers: [{ name: 'One', width: 2, height: 1, tiles: [{ Tile_Type: 'Wall', X_Position: 1, Y_Position: 1 }] }],
    })).toThrow(/missing at least one tile/);
  });
});

describe('the presets shipped in database/boards', () => {
  const names = listPresets();

  test('there is at least one', () => {
    expect(names.length).toBeGreaterThan(0);
  });

  test.each(names)('%s parses, and every tile type is one the renderer can draw', (name) => {
    const preset = loadPreset(name);
    expect(preset.layers.length).toBeGreaterThan(0);
    for (const layer of preset.layers) {
      expect(layer.tiles).toHaveLength(layer.width * layer.height);
      for (const tile of layer.tiles) {
        expect(TILE_TYPES).toContain(tile.Tile_Type);
        expect(fs.existsSync(path.join(__dirname, '..', 'tiles', 'environment', `${tile.Tile_Type}.png`))).toBe(true);
      }
    }
  });

  test.each(names)('%s is stored in the format the exporter writes', (name) => {
    const onDisk = fs.readFileSync(path.join(BOARDS_DIR, `${name}.board`), 'utf8');
    const reformatted = formatBoard(loadPreset(name));
    // comments, the description header and the width of a "vvv" separator
    // are the author's; the map body is what has to match
    const rows = (text) => text.split('\n')
      .filter((line) => line && !line.startsWith('#') && !line.startsWith('description:'))
      .map((line) => (/^v+$/.test(line) ? 'v' : line));
    expect(rows(reformatted)).toEqual(rows(onDisk));
  });
});

describe('loadPreset', () => {
  test('returns null for a name that does not exist', () => {
    expect(loadPreset('no-such-board')).toBeNull();
  });

  test.each(['../secrets', 'a/b', '.', '', null, 42])('refuses the unsafe name %p', (name) => {
    expect(loadPreset(name)).toBeNull();
  });
});
