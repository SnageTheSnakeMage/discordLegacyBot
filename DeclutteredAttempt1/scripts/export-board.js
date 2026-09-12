#!/usr/bin/env node
/**
 * Turns a board that already exists into a .board preset.
 *
 * Two sources, because the two boards that exist live in two places:
 *
 *   node scripts/export-board.js --from-sql database/tileTableHydration.sql --name legacy
 *   LEGACY_DB_STORAGE=/data/database.db node scripts/export-board.js --from-db --game 3 --name playtest
 *
 * --from-sql reads the INSERT statements and groups them by Layer_ID in file
 * order. --from-db reads Layers/Tiles for one game in Layer_ID order, which
 * is the order board.logic.js maps a player's "layer 1" against, so layer 1
 * of the preset is layer 1 to a player. Writes database/boards/<name>.board unless --stdout is given.
 *
 * The old SQL calls a gateway "Gateway", which is not a Tile_Type any code
 * or texture knows - the live database has "Gateway_Open". The export
 * rewrites it and says how many it touched, rather than emitting a preset
 * that inserts tiles nothing can draw.
 */
const fs = require('fs');
const path = require('path');
const { formatBoard, listPresets, BOARDS_DIR, PRESET_EXTENSION } = require('../database/boardPresets.js');

const LEGACY_TYPE_FIXES = { Gateway: 'Gateway_Open' };

function parseArgs(argv) {
  const args = { fromSql: null, fromDb: false, game: null, name: null, out: null, stdout: false };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--from-sql': args.fromSql = argv[++i]; break;
      case '--from-db': args.fromDb = true; break;
      case '--game': args.game = Number(argv[++i]); break;
      case '--name': args.name = argv[++i]; break;
      case '--out': args.out = argv[++i]; break;
      case '--stdout': args.stdout = true; break;
      case '--help': case '-h': args.help = true; break;
      default: throw new Error(`unknown argument "${argv[i]}"`);
    }
  }
  return args;
}

function fixType(type, counts) {
  const fixed = LEGACY_TYPE_FIXES[type];
  if (!fixed) return type;
  counts[type] = (counts[type] || 0) + 1;
  return fixed;
}

/** Rows out of the INSERT INTO Tiles ... VALUES (...) statements. */
function layersFromSql(sqlText) {
  const columns = /INSERT\s+INTO\s+Tiles\s*\(([^)]*)\)/i.exec(sqlText);
  if (!columns) throw new Error('no "INSERT INTO Tiles (...)" statement found');
  const names = columns[1].split(',').map((c) => c.trim());
  const index = {
    layer: names.indexOf('Layer_ID'),
    type: names.indexOf('Tile_Type'),
    x: names.indexOf('X_Position'),
    y: names.indexOf('Y_Position'),
  };
  for (const [key, at] of Object.entries(index)) {
    if (at === -1) throw new Error(`the INSERT does not list a ${key} column`);
  }

  const fixes = {};
  const byLayer = new Map();
  const body = sqlText.slice(columns.index + columns[0].length);
  for (const [, inner] of body.matchAll(/\(([^()]*)\)/g)) {
    const values = inner.split(',').map((v) => v.trim().replace(/^["']|["']$/g, ''));
    if (values.length < names.length) continue;
    const layerId = Number(values[index.layer]);
    if (!Number.isInteger(layerId)) continue;
    if (!byLayer.has(layerId)) byLayer.set(layerId, []);
    byLayer.get(layerId).push({
      Tile_Type: fixType(values[index.type], fixes),
      X_Position: Number(values[index.x]),
      Y_Position: Number(values[index.y]),
    });
  }
  if (!byLayer.size) throw new Error('the INSERT statement has no value rows');

  return {
    fixes,
    layers: [...byLayer.entries()].map(([layerId, tiles]) => ({
      name: `Layer ${layerId}`,
      width: Math.max(...tiles.map((t) => t.X_Position)),
      height: Math.max(...tiles.map((t) => t.Y_Position)),
      tiles,
    })),
  };
}

/** Layers and tiles of one game, straight out of a database file. */
async function layersFromDb(gameId) {
  const { models } = require('../utils.js');
  const where = gameId == null ? {} : { Game_ID: gameId };
  const layerRows = await models.Layers.findAll({ where });
  if (!layerRows.length) {
    throw new Error(gameId == null ? 'this database has no layers' : `game ${gameId} has no layers`);
  }

  const fixes = {};
  const layers = [];
  for (const layer of layerRows) {
    const tileRows = await models.Tiles.findAll({ where: { Layer_ID: layer.Layer_ID } });
    const tiles = tileRows.map((tile) => ({
      Tile_Type: fixType(tile.Tile_Type, fixes),
      X_Position: tile.X_Position,
      Y_Position: tile.Y_Position,
    }));
    if (!tiles.length) throw new Error(`layer ${layer.Layer_ID} has no tiles`);
    layers.push({
      name: `Layer ${layer.Layer_ID}`,
      width: layer.X_Bound || Math.max(...tiles.map((t) => t.X_Position)),
      height: layer.Y_Bound || Math.max(...tiles.map((t) => t.Y_Position)),
      tiles,
    });
  }
  return { fixes, layers };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || (!args.fromSql && !args.fromDb)) {
    console.log(`usage:
  node scripts/export-board.js --from-sql <file> --name <preset> [--stdout] [--out <file>]
  node scripts/export-board.js --from-db [--game <id>] --name <preset> [--stdout] [--out <file>]

existing presets: ${listPresets().join(', ') || '(none)'}`);
    return;
  }
  if (!args.name && !args.stdout && !args.out) throw new Error('--name is required (or use --stdout)');

  const source = args.fromSql
    ? layersFromSql(fs.readFileSync(args.fromSql, 'utf8'))
    : await layersFromDb(args.game);

  const description = args.fromSql
    ? `exported from ${path.basename(args.fromSql)}`
    : `exported from game ${args.game ?? 'all'} of ${process.env.LEGACY_DB_STORAGE || './database/database.db'}`;

  const text = formatBoard({ description, layers: source.layers });

  for (const [from, count] of Object.entries(source.fixes)) {
    console.error(`[export-board] rewrote ${count} "${from}" tiles to "${LEGACY_TYPE_FIXES[from]}"`);
  }
  const summary = source.layers.map((l) => `${l.width}x${l.height}`).join(', ');
  console.error(`[export-board] ${source.layers.length} layers (${summary}), ${source.layers.reduce((n, l) => n + l.tiles.length, 0)} tiles`);

  if (args.stdout) {
    process.stdout.write(text);
    return;
  }
  const file = args.out || path.join(BOARDS_DIR, `${args.name}${PRESET_EXTENSION}`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  console.error(`[export-board] wrote ${file}`);
}

if (require.main === module) {
  main().then(
    () => process.exit(0),
    (error) => { console.error(`[export-board] ${error.message}`); process.exit(1); },
  );
}

module.exports = { parseArgs, layersFromSql, layersFromDb };
