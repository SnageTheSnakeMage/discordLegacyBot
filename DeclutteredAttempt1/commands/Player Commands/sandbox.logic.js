/**
 * /sandbox - debug powers for a game in the SANDBOX gamestate.
 *
 * parse/run/present per TESTING.md Part 1. run() takes plain data and a deps
 * bundle and returns a CommandResult; it never sees an interaction.
 *
 * One logic file serves every subcommand, dispatching on input.subcommand the
 * way databaseCall.logic.js does. They share a gate - the game has to exist
 * and be in SANDBOX - so a player can never point these at a live game.
 *
 * The gate resolves the game itself rather than calling
 * utils.getOldestGamestateGameId: that helper ends in
 * `games[games.length - 1].Game_ID`, which throws on an empty array, so a
 * player with no sandbox game would get the central error handler instead of
 * being told they have no sandbox game.
 *
 * The gate itself does not check that the caller is registered in the game:
 * the read-only subcommands (get-tile-id, get-classes, view-chaos) change
 * nothing, so membership is irrelevant to them. The subcommands that write to
 * a player's row - reset, set-stat, set-meta - call requirePlayer() for that,
 * and only ever touch the caller's own row.
 */
const path = require('path');
const { GAMESTATES, REJECTIONS, ChaosEvents } = require('../../enums.js');
const { messageFor } = require('../_messages.js');
const { stepLogger } = require('../_logging.js');
const defaultDeps = require('../_deps.js');

// shipped with the repo, and the same file the seeder reads
const CLASSES_CSV = path.join(__dirname, '..', '..', 'database', 'seed', 'classes.csv');

// What set-stat and set-meta may write. Discord already restricts the option
// to these names, but the allowlists are the real guard: they are what stops a
// future catalogue edit from making Player_ID, Game_ID or Discord_ID settable
// and letting a player rewrite whose row it is.
//
// The split is Discord's 25-choice limit, not a meaningful boundary: 29
// columns are settable and they do not fit in one dropdown.
const SETTABLE_STATS = Object.freeze([
  'Action_Points', 'MAX_AP', 'MISSED_AP', 'Health_Points', 'MAX_HP', 'MISSED_HP', 'Health_Points2',
  'Damage', 'MAX_DAMAGE', 'Damage2', 'DMG_BUFF', 'Range_', 'MAX_RANGE', 'Range2',
  'Free_Move', 'Free_Move2', 'Kills', 'Meals', 'Pharoh_HP', 'cCOverides',
]);
const SETTABLE_META = Object.freeze([
  'Class_ID', 'Tile_ID', 'Tile_ID2', 'Dead', 'MarkedForDeath', 'Hitman_Target',
  'HP_COST', 'RANGE_COST', 'DAMAGE_COST',
]);

function parse(raw, actor) {
  return {
    subcommand: raw.subcommand ?? null,
    x: raw.x ?? null,
    y: raw.y ?? null,
    layer: raw.layer ?? null,
    // set-stat calls it stat, set-meta calls it field; one column name either way
    column: raw.stat ?? raw.field ?? null,
    value: raw.value ?? null,
    minutes: raw.minutes ?? null,
    times: raw.times ?? null,
    event: raw.event ?? null,
    gameId: raw.game ?? null,
    discordId: actor.discordId,
  };
}

/**
 * The shared gate. Returns { ok: true, game } or a CommandResult rejection.
 */
async function resolveSandboxGame(input, models) {
  let gameId = input.gameId;

  if (gameId == null) {
    // the caller's sandbox games, oldest first - Game_ID ascends with age
    const membership = await models.Players.findAll({
      where: { Discord_ID: input.discordId },
      attributes: ['Game_ID'],
    });
    const gameIds = membership.map((row) => row.Game_ID);
    const sandboxes = gameIds.length
      ? await models.Games.findAll({ where: { Game_ID: gameIds, GAME_STATE: GAMESTATES.SANDBOX } })
      : [];
    if (sandboxes.length === 0) {
      return {
        ok: false,
        reason: REJECTIONS.NO_SUCH_GAME,
        data: { message: 'You are not in a sandbox game. Pass a game id, or ask a dev to put a game in the SANDBOX gamestate.' },
      };
    }
    const oldest = sandboxes.reduce((a, b) => (a.Game_ID <= b.Game_ID ? a : b));
    gameId = oldest.Game_ID;
    return { ok: true, game: oldest };
  }

  const game = await models.Games.findByPk(gameId);
  if (!game) return { ok: false, reason: REJECTIONS.NO_SUCH_GAME, data: { gameId } };
  if (game.GAME_STATE !== GAMESTATES.SANDBOX) {
    return { ok: false, reason: REJECTIONS.NOT_SANDBOX, data: { gameId, gamestate: game.GAME_STATE } };
  }
  return { ok: true, game };
}

/** /sandbox get-tile-id - position in, Tile_ID out. */
async function getTileId(input, models, game) {
  // the layer option is the 1-based number a player sees, the same convention
  // /board uses; Layer_ID is whatever the row happens to be
  const layers = await models.Layers.findAll({ where: { Game_ID: game.Game_ID }, attributes: ['Layer_ID'] });
  const layerIds = layers.map((l) => l.Layer_ID);
  const layerId = layerIds[input.layer - 1];
  if (layerId === undefined) {
    return { ok: false, reason: REJECTIONS.NO_SUCH_LAYER, data: { message: `Game ${game.Game_ID} has ${layerIds.length} layer(s); there is no layer ${input.layer}.` } };
  }

  const tile = await models.Tiles.findOne({
    where: { Layer_ID: layerId, X_Position: input.x, Y_Position: input.y },
  });
  if (!tile) return { ok: false, reason: REJECTIONS.NO_SUCH_TILE };

  return {
    ok: true,
    kind: 'tileId',
    data: {
      tileId: tile.Tile_ID,
      x: input.x,
      y: input.y,
      layer: input.layer,
      layerId,
      tileType: tile.Tile_Type,
      gameId: game.Game_ID,
    },
  };
}

/** /sandbox view-chaos - what set-chaos will accept, and what is set now. */
function viewChaos(game) {
  return {
    ok: true,
    kind: 'chaosList',
    data: {
      // names only: the descriptions together run well past Discord's 2000
      // character limit, and the names are what set-chaos takes
      events: Object.keys(ChaosEvents),
      current: game.CURR_CC_EVENT,
      gameId: game.Game_ID,
    },
  };
}

/** The caller's row in this game, or a rejection. Writers only. */
async function requirePlayer(input, models, game) {
  const player = await models.Players.findOne({
    where: { Game_ID: game.Game_ID, Discord_ID: input.discordId },
  });
  if (!player) {
    return {
      ok: false,
      reason: REJECTIONS.NOT_IN_GAME,
      data: { message: `You are not registered in game ${game.Game_ID}. Register first, or pick a sandbox game you are in.` },
    };
  }
  return { ok: true, player };
}

/** /sandbox set-stat and set-meta - write one column of the caller's own row. */
async function setColumn(input, models, game, player, allowed, label, trace) {
  if (!allowed.includes(input.column)) {
    return {
      ok: false,
      reason: REJECTIONS.INVALID_AMOUNT,
      data: { message: `"${input.column}" is not a ${label} you can set. Try one of: ${allowed.join(', ')}` },
    };
  }

  const before = player[input.column];
  // worth a line of its own: this is a player rewriting their own row, and
  // "my stats went weird" is exactly the report this explains
  trace('columnSet', { playerId: player.Player_ID, column: input.column, before, after: input.value });
  // only ever the caller's own row, keyed by Player_ID
  await models.Players.update({ [input.column]: input.value }, { where: { Player_ID: player.Player_ID } });

  return {
    ok: true,
    kind: 'columnSet',
    data: { column: input.column, before, after: input.value, gameId: game.Game_ID },
  };
}

/**
 * /sandbox reset - take the caller off the board, delete their row, and put
 * them back through the spawn procedure.
 *
 * utils.spawnPlayer is registerPlayer without the icon download: a reset has
 * no attachment to download from, and the player's icon is already on disk
 * from when they registered, so it is left exactly where it is.
 */
async function reset(input, deps, game, player, trace) {
  const { models, utils } = deps;

  // vacate both bodies: clearPlayerFromBoard frees the tile's PlayerN slot as
  // well as nulling the player's own column, so no tile is left naming a row
  // that is about to be destroyed
  trace('resetClearing', { playerId: player.Player_ID, tileId: player.Tile_ID, tileId2: player.Tile_ID2 });
  await utils.clearPlayerFromBoard(player.Player_ID, player.Tile_ID, 'Tile_ID');
  if (player.Tile_ID2 != null) {
    await utils.clearPlayerFromBoard(player.Player_ID, player.Tile_ID2, 'Tile_ID2');
  }

  await models.Players.destroy({ where: { Player_ID: player.Player_ID } });
  trace('resetDestroyed', { playerId: player.Player_ID });

  const rolled = await utils.spawnPlayer(game.Game_ID, input.discordId);
  trace('resetRespawned', { className: rolled && rolled.Class_Name });
  const respawned = await models.Players.findOne({
    where: { Game_ID: game.Game_ID, Discord_ID: input.discordId },
  });

  return {
    ok: true,
    kind: 'reset',
    data: {
      gameId: game.Game_ID,
      oldPlayerId: player.Player_ID,
      newPlayerId: respawned ? respawned.Player_ID : null,
      className: rolled ? rolled.Class_Name : null,
      tileId: respawned ? respawned.Tile_ID : null,
      tileId2: respawned ? respawned.Tile_ID2 : null,
    },
  };
}

/** /sandbox ap-time - change how often this game distributes AP. */
async function apTime(input, models, game) {
  const before = game.AP_INTERVAL_MIN;
  await models.Games.update({ AP_INTERVAL_MIN: input.minutes }, { where: { Game_ID: game.Game_ID } });
  return { ok: true, kind: 'apTime', data: { gameId: game.Game_ID, before, after: input.minutes } };
}

/** /sandbox set-chaos - set CURR_CC_EVENT to one of the enum's events. */
async function setChaos(input, models, game) {
  const names = Object.keys(ChaosEvents);
  if (!names.includes(input.event)) {
    return {
      ok: false,
      reason: REJECTIONS.INVALID_AMOUNT,
      data: { message: `"${input.event}" is not a chaos event. Run /sandbox view-chaos for the list - the names are case and punctuation sensitive.` },
    };
  }
  const before = game.CURR_CC_EVENT;
  await models.Games.update({ CURR_CC_EVENT: input.event }, { where: { Game_ID: game.Game_ID } });
  return { ok: true, kind: 'chaosSet', data: { gameId: game.Game_ID, before, after: input.event } };
}

/**
 * /sandbox ap-tick - the plan only.
 *
 * run() deliberately does NOT distribute: utils.distributeAP needs a Discord
 * client to fetch the dead chat channel, and a logic file never gets one -
 * override.logic.js records an out-of-scope `client` as a bug that was
 * removed. So this validates and hands the adapter a count; sandbox.js, which
 * has interaction.client, runs the distributions.
 */
function apTick(input, game) {
  return { ok: true, kind: 'apTick', data: { gameId: game.Game_ID, times: input.times } };
}

async function run(input, deps = defaultDeps) {
  const { models } = deps;
  const trace = stepLogger('sandbox', deps);

  const gate = await resolveSandboxGame(input, models);
  if (!gate.ok) return gate;
  const { game } = gate;
  trace('gate', { subcommand: input.subcommand, gameId: game.Game_ID });

  switch (input.subcommand) {
    case 'get-tile-id':
      return getTileId(input, models, game);
    case 'get-classes':
      return { ok: true, kind: 'classes', data: { filePath: CLASSES_CSV, gameId: game.Game_ID } };
    case 'view-chaos':
      return viewChaos(game);
    case 'reset':
    case 'set-stat':
    case 'set-meta':
    case 'ap-time':
    case 'ap-tick':
    case 'set-chaos': {
      const membership = await requirePlayer(input, models, game);
      if (!membership.ok) return membership;
      const { player } = membership;
      switch (input.subcommand) {
        case 'reset': return reset(input, deps, game, player, trace);
        case 'set-stat': return setColumn(input, models, game, player, SETTABLE_STATS, 'stat', trace);
        case 'set-meta': return setColumn(input, models, game, player, SETTABLE_META, 'field', trace);
        case 'ap-time': return apTime(input, models, game);
        case 'set-chaos': return setChaos(input, models, game);
        default: return apTick(input, game);
      }
    }
    default:
      // Discord will not send a subcommand that is not registered, so this is
      // a catalogue entry without a branch here rather than player input
      return {
        ok: false,
        reason: REJECTIONS.INVALID_AMOUNT,
        data: { message: `/sandbox has no "${input.subcommand}" behaviour wired up yet.` },
      };
  }
}

function present(result) {
  if (!result.ok) return { content: messageFor(result.reason, result.data) };
  const d = result.data;

  switch (result.kind) {
    case 'tileId':
      return { content: `Tile_ID **${d.tileId}** - game ${d.gameId}, layer ${d.layer} (Layer_ID ${d.layerId}), position ${d.x},${d.y}, type ${d.tileType}` };
    case 'classes':
      return {
        content: `Every class in game ${d.gameId}. The id column is the Class_ID set-class takes.`,
        files: [{ path: d.filePath, name: 'classes.csv' }],
      };
    case 'columnSet':
      return { content: `Game ${d.gameId}: **${d.column}** ${d.before} -> **${d.after}**` };
    case 'reset':
      return {
        content: [
          `Reset in game ${d.gameId}. Player_ID ${d.oldPlayerId} is gone; you are now Player_ID ${d.newPlayerId}.`,
          `Rolled **${d.className}**, spawned on Tile_ID ${d.tileId}${d.tileId2 != null ? ` and ${d.tileId2}` : ''}.`,
          'Your icon was left as it is - a reset has no upload to take a new one from.',
        ].join('\n'),
      };
    case 'apTime':
      return { content: `Game ${d.gameId}: AP_INTERVAL_MIN ${d.before} -> **${d.after}** minutes. The running AP check picks this up on its next pass.` };
    case 'chaosSet':
      return { content: `Game ${d.gameId}: chaos event ${d.before ?? 'none'} -> **${d.after}**` };
    case 'apTick':
      return {
        content: `Ran ${d.times} AP distribution${d.times === 1 ? '' : 's'} on game ${d.gameId}. No chaos poll was posted - ap-tick skips the council round trip so dead chat stays quiet.`,
      };
    case 'chaosList':
      return {
        content: [
          `Chaos events set-chaos accepts for game ${d.gameId}:`,
          d.events.map((name) => `- ${name}`).join('\n'),
          `\nCurrently set: **${d.current ?? 'none'}**`,
        ].join('\n'),
      };
    default:
      return { content: 'Done.' };
  }
}

module.exports = { parse, run, present };
