/**
 * /resurrect - Necromancer class command: bring a dead player in the game
 * back to life on a chosen tile for 12 AP.
 *
 * parse/run/present per TESTING.md Part 1. run() takes plain data and a deps
 * bundle and returns a CommandResult; it never sees an interaction.
 *
 * Ported from the old execute with these fixes, each of which was a crash or
 * a write whose where-clause could never match:
 * - `models.Games.findByPk(...) ?? utils.getOldestGameId()` produced a Games
 *   ROW (or an id) and then used it as `Game_ID` in three where-clauses, so
 *   the player, the resurrectee and the layer lookup all searched for a game
 *   id that was actually a model instance and matched nothing; the game id is
 *   now resolved first and the row fetched from it
 * - getOldestGameId was called with NO argument, and that overload throws
 *   "missing playerDiscordID", so the no-game-option default always crashed;
 *   it now receives the actor's discord id like the other converted commands
 * - a missing game returns NO_SUCH_GAME and a missing player returns
 *   NOT_IN_GAME instead of crashing on player.Tile_ID
 * - `utils.commonLayerIDtoDbLayerID` does not exist on the real utils (only
 *   on the deleted __mocks__ copy), so EVERY invocation of this command threw
 *   TypeError before reaching a single check; the common-layer-number ->
 *   Layer_ID mapping is now done inline against deps.models.Layers, exactly
 *   as board.logic.js does it
 * - `player.Class` is not a column on Players, so `player.Class != "Necromancer"`
 *   was always true and the command could never get past its own class gate;
 *   the class row is now loaded via Classes.findByPk(player.Class_ID) and
 *   compared on Class_Name
 *
 * Preserved as-is (see the pinning tests):
 * - the gamestate gate passes isClockwatcher=false unconditionally, exactly
 *   like the old checkGameStateAndReply(gamestate, false, interaction) call
 * - there is no dead-check on the CASTER: a dead Necromancer may resurrect
 * - the `?? playersTile.Layer_ID` fallback: an out-of-range layer number
 *   silently falls back to the caster's own layer rather than rejecting
 * - `resurrectee.Dead === 0` is a strict integer compare (Dead is an INTEGER
 *   column defaulting to 0)
 * - the tile write claims the Player1 slot of the resurrectee's OLD tile
 *   (`where: { Tile_ID: resurrectee.Tile_ID }`), not the inputted tile, and
 *   Players.Tile_ID is never repointed - so the body lands back where it died
 * - `{ Dead: 0 }` is written as the number 0, not false
 * - rejection order: gamestate, class, tile, target-in-game, target-dead, AP,
 *   tile type, tile occupancy
 */
const { REJECTIONS } = require('../../enums.js');
const { messageFor } = require('../_messages.js');
const defaultDeps = require('../_deps.js');

const RESURRECT_COST = 12;
const FORBIDDEN_TILE_TYPES = ['Void', 'Wall', 'Ice'];

function parse(raw, actor) {
  return {
    targetDiscordId: raw.player ?? null,
    targetUsername: raw.playerUsername ?? null,
    x: raw.x,
    y: raw.y,
    layer: raw.layer ?? null,
    gameId: raw.game ?? null,
    discordId: actor.discordId,
  };
}

async function run(input, deps = defaultDeps) {
  const { models, utils } = deps;

  const gameId = input.gameId ?? await utils.getOldestGameId(input.discordId);
  const game = await models.Games.findByPk(gameId);
  if (!game) return { ok: false, reason: REJECTIONS.NO_SUCH_GAME, data: { gameId } };

  const player = await models.Players.findOne({ where: { Game_ID: game.Game_ID, Discord_ID: input.discordId } });
  if (!player) return { ok: false, reason: REJECTIONS.NOT_IN_GAME };

  const playersTile = await models.Tiles.findOne({ where: { Tile_ID: player.Tile_ID } });

  // the player passes a 1-based "common" layer number; map it to the game's
  // actual Layer_ID, falling back to the caster's own layer when the option
  // was absent OR names a layer this game does not have (the old `??`)
  let layerId;
  if (input.layer !== null) {
    const layerIds = (await models.Layers.findAll({ where: { Game_ID: game.Game_ID }, attributes: ['Layer_ID'] }))
      .map((l) => l.Layer_ID);
    layerId = layerIds[input.layer - 1];
  }
  if (layerId === undefined || layerId === null) {
    layerId = playersTile ? playersTile.Layer_ID : null;
  }

  const inputtedTile = await models.Tiles.findOne({
    where: { Layer_ID: layerId, X_Position: input.x, Y_Position: input.y },
  });
  const resurrectee = await models.Players.findOne({ where: { Game_ID: game.Game_ID, Discord_ID: input.targetDiscordId } });
  const playerClass = await models.Classes.findByPk(player.Class_ID);

  const verdict = utils.checkGameState(game.GAME_STATE, false);
  if (verdict.blocked) return { ok: false, reason: verdict.reason };

  if (!playerClass || playerClass.Class_Name !== 'Necromancer') {
    return { ok: false, reason: REJECTIONS.WRONG_CLASS, data: { className: 'Necromancer' } };
  }

  if (!inputtedTile) {
    return { ok: false, reason: REJECTIONS.NO_SUCH_TILE, data: { message: 'The tile provided is not in the game!' } };
  }

  if (!resurrectee) {
    return { ok: false, reason: REJECTIONS.TARGET_NOT_IN_GAME, data: { message: 'The resurrectee is not in this game!' } };
  }

  if (resurrectee.Dead === 0) {
    return { ok: false, reason: REJECTIONS.TARGET_NOT_DEAD };
  }

  if (player.Action_Points < RESURRECT_COST) {
    return { ok: false, reason: REJECTIONS.NOT_ENOUGH_AP, data: { action: 'resurrect' } };
  }

  if (FORBIDDEN_TILE_TYPES.includes(inputtedTile.Tile_Type)) {
    return { ok: false, reason: REJECTIONS.WRONG_TILE_TYPE, data: { message: 'You cannot resurrect to that tile!' } };
  }

  if (inputtedTile.Player1 != null || inputtedTile.Player2 != null
    || inputtedTile.Player3 != null || inputtedTile.Player4 != null) {
    return { ok: false, reason: REJECTIONS.TILE_OCCUPIED, data: { message: 'You cannot resurrect to that tile!' } };
  }

  await models.Players.update({ Dead: 0 }, { where: { Player_ID: resurrectee.Player_ID } });
  // the old code claimed a slot on the RESURRECTEE'S OWN tile, not the
  // inputted one, and never repointed Players.Tile_ID; kept
  await models.Tiles.update({ Player1: resurrectee.Player_ID }, { where: { Tile_ID: resurrectee.Tile_ID } });
  await models.Players.update(
    { Action_Points: player.Action_Points - RESURRECT_COST },
    { where: { Player_ID: player.Player_ID } },
  );

  return {
    ok: true,
    kind: 'resurrected',
    data: {
      targetUsername: input.targetUsername,
      targetPlayerId: resurrectee.Player_ID,
      x: input.x,
      y: input.y,
      layerId,
    },
  };
}

function present(result) {
  if (!result.ok) return { content: messageFor(result.reason, result.data) };
  return { content: `You have resurrected ${result.data.targetUsername} to the tile provided!` };
}

module.exports = { parse, run, present };
