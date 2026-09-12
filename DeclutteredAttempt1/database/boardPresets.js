/**
 * Board presets: ASCII maps -> plain layer/tile data.
 *
 * A board is a stack of layers; a layer is a grid of tiles. Drawing one as
 * text means a new board is a file you can edit in any editor and read in a
 * diff, instead of 600 INSERT statements (database/tileTableHydration.sql)
 * that nobody can picture.
 *
 * FORMAT (see docs/BOARDS.md for the full guide)
 *
 *   # comments (hash + space) and blank lines are ignored
 *   description: four-layer board from the 2025 playtest
 *   legend G Gateway_Open        <- optional overrides, before the first layer
 *
 *   layer Surface
 *   VVVVV
 *   V.~.V
 *   VVVVV
 *   vvvvv                        <- the next layer sits BELOW this one
 *   layer Caverns
 *   #####
 *   #.G.#
 *   #####
 *
 * Row 1 is Y_Position 1 and column 1 is X_Position 1, matching the draw
 * order in utils.GenerateGameGridImage (canvasX from X, canvasY from Y). The
 * 'vvv' separator is the stacking: layers come out in file order, each one
 * Layer_Below the one before it, so /board layer:1 is the top of the file.
 *
 * There is no implicit border. What you draw is what you get - a board that
 * wants a Void rim draws one.
 *
 * This file must never import discord.js.
 */
const fs = require('fs');
const path = require('path');

/** Every Tile_Type with a texture in tiles/environment. */
const TILE_TYPES = Object.freeze([
  'Blank1', 'Blank2', 'Void', 'Wall', 'Wall_Damaged', 'Ice', 'Fire', 'Storm',
  'Heal', 'Bush', 'Chest', 'Smoke', 'Gateway_Open', 'Gateway_Locked',
]);

/**
 * The default character legend. '.' is the checkerboard: it becomes Blank1 or
 * Blank2 from the tile's own coordinates, so an ordinary floor is one
 * character and the checker pattern cannot drift. '1' and '2' pin a blank
 * explicitly, which is how a hand-tuned board (the old layer 1 has twelve
 * off-pattern blanks) survives a round trip.
 */
const DEFAULT_LEGEND = Object.freeze({
  '.': 'Checker',
  1: 'Blank1',
  2: 'Blank2',
  V: 'Void',
  '#': 'Wall',
  x: 'Wall_Damaged',
  '~': 'Ice',
  F: 'Fire',
  S: 'Storm',
  '+': 'Heal',
  B: 'Bush',
  C: 'Chest',
  ',': 'Smoke',
  G: 'Gateway_Open',
  L: 'Gateway_Locked',
});

/** Reverse of DEFAULT_LEGEND, for formatBoard. */
const CHAR_FOR_TYPE = Object.freeze(Object.fromEntries(
  Object.entries(DEFAULT_LEGEND).filter(([, type]) => type !== 'Checker').map(([ch, type]) => [type, ch]),
));

const BOARDS_DIR = path.join(__dirname, 'boards');
const PRESET_EXTENSION = '.board';
/** A preset name reaches this module from a slash-command option, so it is
 * never allowed to describe a path. */
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const SEPARATOR = /^v+$/;
const COMMENT = /^#(\s|$)/;

/** Blank1 on an even X+Y, Blank2 on an odd one - the pattern the seeded
 * boards already use on every layer they did not hand-tune. */
function checkerType(x, y) {
  return (x + y) % 2 === 0 ? 'Blank1' : 'Blank2';
}

/**
 * Parses board text into plain data:
 *   { description, layers: [{ name, width, height, tiles: [...] }] }
 * Tiles carry real column names (Tile_Type, X_Position, Y_Position) so the
 * caller hands them straight to Tiles.bulkCreate.
 *
 * Throws on anything malformed, always naming the line - a board that parses
 * is a board that inserts.
 */
function parseBoard(text) {
  const legend = { ...DEFAULT_LEGEND };
  const layers = [];
  let description = '';
  let current = null;
  let sawSeparator = false;

  const lines = String(text).split(/\r?\n/);
  lines.forEach((rawLine, index) => {
    const lineNumber = index + 1;
    const line = rawLine.trim();
    const fail = (message) => { throw new Error(`board line ${lineNumber}: ${message}`); };

    // A comment is '#' plus a space, never a bare '#...' - '#' is also the
    // Wall character, so "###FFF###" has to stay a row of map.
    if (line === '' || COMMENT.test(line)) return;

    if (line.toLowerCase().startsWith('description:')) {
      if (layers.length) fail('description: must come before the first layer');
      description = line.slice('description:'.length).trim();
      return;
    }

    if (line.toLowerCase().startsWith('legend ')) {
      if (layers.length) fail('legend lines must come before the first layer');
      const [, ch, type, ...extra] = line.split(/\s+/);
      if (extra.length) fail('legend takes exactly one character and one tile type');
      if (!ch || ch.length !== 1) fail(`legend needs a single character, got "${ch || ''}"`);
      if (type !== 'Checker' && !TILE_TYPES.includes(type)) {
        fail(`unknown tile type "${type}". Known types: ${TILE_TYPES.join(', ')}`);
      }
      legend[ch] = type;
      return;
    }

    if (line.toLowerCase().startsWith('layer')) {
      if (layers.length && !sawSeparator) {
        fail('layers must be separated by a "vvv" line saying the next layer is below');
      }
      current = { name: line.slice('layer'.length).trim() || `Layer ${layers.length + 1}`, rows: [] };
      layers.push(current);
      sawSeparator = false;
      return;
    }

    if (SEPARATOR.test(line)) {
      if (!current) fail('"vvv" separator before any layer');
      if (!current.rows.length) fail(`layer "${current.name}" has no rows`);
      sawSeparator = true;
      return;
    }

    // anything else is a row of the current layer
    if (!current) fail(`expected "layer <name>" before any map rows, got "${line}"`);
    if (sawSeparator) fail('map rows after a "vvv" separator - start the next layer with "layer <name>"');

    const width = current.rows.length ? current.rows[0].length : line.length;
    if (line.length !== width) {
      fail(`row is ${line.length} tiles wide but layer "${current.name}" started at ${width}`);
    }
    const y = current.rows.length + 1;
    const row = [...line].map((ch, i) => {
      const type = legend[ch];
      if (!type) fail(`unknown map character "${ch}" at column ${i + 1}`);
      return type === 'Checker' ? checkerType(i + 1, y) : type;
    });
    current.rows.push(row);
  });

  if (!layers.length) throw new Error('board has no layers');
  const empty = layers.find((layer) => !layer.rows.length);
  if (empty) throw new Error(`layer "${empty.name}" has no rows`);

  return {
    description,
    layers: layers.map((layer) => ({
      name: layer.name,
      width: layer.rows[0].length,
      height: layer.rows.length,
      tiles: layer.rows.flatMap((row, y) => row.map((type, x) => ({
        Tile_Type: type,
        X_Position: x + 1,
        Y_Position: y + 1,
      }))),
    })),
  };
}

/**
 * The inverse of parseBoard, used by scripts/export-board.js to turn a board
 * that already exists (in the database, or in tileTableHydration.sql) into a
 * preset file. A blank that matches the checker pattern comes back as '.',
 * so only the deliberate exceptions carry a '1' or '2'.
 */
function formatBoard(board) {
  const out = [];
  if (board.description) out.push(`description: ${board.description}`);
  if (out.length) out.push('');

  board.layers.forEach((layer, layerIndex) => {
    if (layerIndex > 0) out.push('v'.repeat(Math.max(3, layer.width)));
    out.push(`layer ${layer.name || `Layer ${layerIndex + 1}`}`);
    const grid = Array.from({ length: layer.height }, () => new Array(layer.width).fill(null));
    for (const tile of layer.tiles) {
      const { X_Position: x, Y_Position: y, Tile_Type: type } = tile;
      if (x < 1 || x > layer.width || y < 1 || y > layer.height) {
        throw new Error(`tile at ${x},${y} is outside layer "${layer.name}" (${layer.width}x${layer.height})`);
      }
      const ch = CHAR_FOR_TYPE[type];
      if (!ch) throw new Error(`no legend character for tile type "${type}"`);
      grid[y - 1][x - 1] = type === checkerType(x, y) ? '.' : ch;
    }
    const hole = grid.flat().indexOf(null);
    if (hole !== -1) throw new Error(`layer "${layer.name}" is missing at least one tile`);
    out.push(...grid.map((row) => row.join('')));
  });

  return `${out.join('\n')}\n`;
}

/** Preset names available to /create-board, without the extension. */
function listPresets(dir = BOARDS_DIR) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((file) => file.endsWith(PRESET_EXTENSION))
    .map((file) => path.basename(file, PRESET_EXTENSION))
    .sort();
}

/**
 * Loads one preset by name. Returns null for a name that does not exist, so
 * the command turns it into a rejection; throws only when the file itself is
 * malformed, which is a fault in the repo, not in the caller.
 */
function loadPreset(name, dir = BOARDS_DIR) {
  if (typeof name !== 'string' || !SAFE_NAME.test(name)) return null;
  const file = path.join(dir, `${name}${PRESET_EXTENSION}`);
  if (!fs.existsSync(file)) return null;
  const board = parseBoard(fs.readFileSync(file, 'utf8'));
  return { name, ...board };
}

module.exports = {
  TILE_TYPES,
  DEFAULT_LEGEND,
  CHAR_FOR_TYPE,
  BOARDS_DIR,
  PRESET_EXTENSION,
  checkerType,
  parseBoard,
  formatBoard,
  listPresets,
  loadPreset,
};
