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
 * This first set is read-only. Nothing here writes, which is why the gate
 * does not also check that the caller is registered in the game: looking up a
 * tile id or reading the chaos list changes nothing. The subcommands that
 * act on a player's own row check membership themselves.
 */
const path = require('path');
const { GAMESTATES, REJECTIONS, ChaosEvents } = require('../../enums.js');
const { messageFor } = require('../_messages.js');
const defaultDeps = require('../_deps.js');

// shipped with the repo, and the same file the seeder reads
const CLASSES_CSV = path.join(__dirname, '..', '..', 'database', 'seed', 'classes.csv');

function parse(raw, actor) {
  return {
    subcommand: raw.subcommand ?? null,
    x: raw.x ?? null,
    y: raw.y ?? null,
    layer: raw.layer ?? null,
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

async function run(input, deps = defaultDeps) {
  const { models } = deps;

  const gate = await resolveSandboxGame(input, models);
  if (!gate.ok) return gate;
  const { game } = gate;

  switch (input.subcommand) {
    case 'get-tile-id':
      return getTileId(input, models, game);
    case 'get-classes':
      return { ok: true, kind: 'classes', data: { filePath: CLASSES_CSV, gameId: game.Game_ID } };
    case 'view-chaos':
      return viewChaos(game);
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
