/**
 * Deterministic board fixtures for integration tests. No randomness
 * anywhere: a seeded board is byte-identical on every run.
 */
const { models } = require('./testDb.js');
const { GAMESTATES } = require('../../../enums.js');

/** Classes distributeAP looks up by name at its top; production DBs always have them. */
const CORE_CLASSES = ['Average', 'Lava Diver', 'Glutton', 'Immutable', 'Chef', 'Hitman', 'Pyromaniac', 'Snowman'];

/** One game row with known costs. Also seeds the class rows utils assumes exist. */
async function seedGame(overrides = {}) {
  for (const name of CORE_CLASSES) await seedClass(name);
  return models.Games.create({
    GAME_STATE: GAMESTATES.ACTIVE,
    AP_INTERVAL_MIN: 720,
    CHEST_AMOUNT: 0,
    CURR_CC_EVENT: 'BOOOORRRINNNG',
    moveCost: 1,
    shootCost: 2,
    fireDmg: 1,
    mineDmg: 1,
    classBlacklist: '',
    classDupelicateMax: 2,
    maxIncreaseOnKill: 1,
    chaosCouncilBool: false,
    finaleThreshold: 4,
    timestopTurns: 0,
    lastAPDistributionTimestampInMS: 0,
    APAmount: 4,
    immutableDoomsday: 32,
    ...overrides,
  });
}

/** One layer of width x height Blank1 tiles, positions 1-indexed. */
async function seedLayer(gameId, { width = 5, height = 5 } = {}) {
  const layer = await models.Layers.create({ Game_ID: gameId, X_Bound: width, Y_Bound: height });
  const rows = [];
  for (let x = 1; x <= width; x++) {
    for (let y = 1; y <= height; y++) {
      rows.push({ Layer_ID: layer.Layer_ID, Tile_Type: 'Blank1', X_Position: x, Y_Position: y });
    }
  }
  await models.Tiles.bulkCreate(rows);
  return layer;
}


/** Classes row by name, created once per db (call after freshDb resets the cache via resetSeedCaches). */
async function seedClass(className, overrides = {}) {
  const existing = await models.Classes.findOne({ where: { Class_Name: className } });
  if (existing) return existing;
  return models.Classes.create({
    Class_Name: className,
    Start_AP: 4,
    Start_MAX_AP: 10,
    Start_HP: 10,
    Start_MAX_HP: 10,
    Start_Range_: 3,
    Start_MAX_Range_: 5,
    Start_Damage: 1,
    Start_MAX_Damage: 3,
    Role_Color: 'ffffff',
    Description: `${className} (integration fixture)`,
    ...overrides,
  });
}

/**
 * A player standing on (x, y) of the given layer. Creates the Classes row
 * if needed and claims the first free Tiles.PlayerN slot - keeping BOTH
 * sides of the position invariant (#78) true from the start.
 */
async function seedPlayer(gameId, {
  discordId, x, y, layerId, className = 'Average', ...stats
} = {}) {
  const klass = await seedClass(className);
  const tile = await models.Tiles.findOne({ where: { Layer_ID: layerId, X_Position: x, Y_Position: y } });
  if (!tile) throw new Error(`seedPlayer: no tile at (${x},${y}) on layer ${layerId}`);
  const player = await models.Players.create({
    Game_ID: gameId,
    Class_ID: klass.Class_ID,
    Discord_ID: discordId,
    Tile_ID: tile.Tile_ID,
    Action_Points: 4,
    MAX_AP: 10,
    MISSED_AP: 0,
    Health_Points: 10,
    MAX_HP: 10,
    MISSED_HP: 0,
    Damage: 1,
    MAX_DAMAGE: 3,
    Range_: 3,
    MAX_RANGE: 5,
    Kills: 0,
    HP_COST: 4,
    RANGE_COST: 4,
    DAMAGE_COST: 8,
    Dead: false,
    DMG_BUFF: 0,
    Free_Move: 0,
    Free_Move2: 0,
    Pharoh_HP: 0,
    cCOverides: 1,
    MarkedForDeath: false,
    Meals: 0,
    ...stats,
  });
  const slot = tile.Player1 == null ? 'Player1'
    : tile.Player2 == null ? 'Player2'
      : tile.Player3 == null ? 'Player3'
        : tile.Player4 == null ? 'Player4' : null;
  if (!slot) throw new Error(`seedPlayer: tile (${x},${y}) is full`);
  await tile.update({ [slot]: player.Player_ID });
  return player;
}

/**
 * The #78 invariant, asserted after every integration test: every living,
 * placed player is referenced by exactly one tile slot, and that tile is
 * the one their Tile_ID points at. Twins get the same check on Tile_ID2.
 */
async function assertBoardConsistent(gameId) {
  const players = await models.Players.findAll({ where: { Game_ID: gameId } });
  const tiles = await models.Tiles.findAll();
  const slotRefs = new Map(); // playerId -> [tileId, ...]
  for (const t of tiles) {
    for (const slot of ['Player1', 'Player2', 'Player3', 'Player4']) {
      if (t[slot] != null) {
        if (!slotRefs.has(t[slot])) slotRefs.set(t[slot], []);
        slotRefs.get(t[slot]).push(t.Tile_ID);
      }
    }
  }
  const problems = [];
  for (const p of players) {
    const refs = slotRefs.get(p.Player_ID) || [];
    const expected = [p.Tile_ID, p.Tile_ID2].filter((id) => id != null);
    if (p.Dead && expected.length === 0) {
      if (refs.length !== 0) problems.push(`dead player ${p.Player_ID} still referenced by tiles ${refs}`);
      continue;
    }
    const sortedRefs = [...refs].sort((a, b) => a - b);
    const sortedExpected = [...expected].sort((a, b) => a - b);
    if (JSON.stringify(sortedRefs) !== JSON.stringify(sortedExpected)) {
      problems.push(`player ${p.Player_ID}: Tile_ID says [${sortedExpected}] but tile slots say [${sortedRefs}]`);
    }
  }
  if (problems.length) {
    throw new Error(`board inconsistent:\n  ${problems.join('\n  ')}`);
  }
}

/** ASCII rendering of a layer for readable failure output. */
async function boardAscii(layerId) {
  const tiles = await models.Tiles.findAll({
    where: { Layer_ID: layerId },
    order: [['Y_Position', 'ASC'], ['X_Position', 'ASC']],
  });
  const rows = new Map();
  for (const t of tiles) {
    if (!rows.has(t.Y_Position)) rows.set(t.Y_Position, []);
    const occupants = ['Player1', 'Player2', 'Player3', 'Player4'].filter((s) => t[s] != null).length;
    const glyph = occupants > 0 ? String(occupants)
      : t.trapped ? '*'
        : t.Tile_Type === 'Blank1' ? '.'
          : t.Tile_Type[0];
    rows.get(t.Y_Position).push(glyph);
  }
  return [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([, r]) => r.join(' ')).join('\n');
}

module.exports = { seedGame, seedLayer, seedClass, seedPlayer, assertBoardConsistent, boardAscii };
