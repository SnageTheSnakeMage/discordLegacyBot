/**
 * /lock - a Guardian locks or unlocks a Gateway tile in range for 2 AP.
 *
 * parse/run/present per TESTING.md Part 1. run() takes plain data and a deps
 * bundle and returns a CommandResult; it never sees an interaction.
 *
 * Ported from the old execute() with these fixes, each of which was a crash
 * or made every write below it dead (see the conversion commit):
 * - the gateway guard read `!= "Gateway_Open" || != "Gateway_Locked"`, which
 *   no string can ever fail, so EVERY invocation that got that far replied
 *   "You cannot lock a non-gateway tile!" and the three writes underneath
 *   were unreachable. It is now `&&`, the check that was obviously meant.
 * - the default-game lookup called utils.getOldestGameId() with no argument,
 *   which throws "missing playerDiscordID"; the actor's id is passed now.
 * - a missing game / player / player tile / player class dereferenced null;
 *   they return NO_SUCH_GAME / NOT_IN_GAME / NO_SUCH_TILE / WRONG_CLASS.
 * - checkGameStateAndReply is the pure two-argument checkGameState.
 *
 * Preserved as-is: the gamestate gate is asked with isClockwatcher = false
 * (a Guardian is never a Clockwatcher), the range test is inclusive of both
 * endpoints, the finale rule only blocks *locking* the last open gateway,
 * and the success line names the tile's OLD type - Tiles.update does not
 * refresh the in-memory row, so "You have made a Gateway_Open tile" is what
 * a player saw after locking one. Both are pinned by tests.
 */
const { GAMESTATES, REJECTIONS } = require('../../enums.js');
const { messageFor } = require('../_messages.js');
const defaultDeps = require('../_deps.js');

const LOCK_COST = 2;

function parse(raw, actor) {
  return {
    x: raw.x,
    y: raw.y,
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

  const playerClass = await models.Classes.findByPk(player.Class_ID);
  const playerTile = await models.Tiles.findByPk(player.Tile_ID);
  if (!playerTile) return { ok: false, reason: REJECTIONS.NO_SUCH_TILE };

  const tileInRange = utils.getTileCordinatesOfLine(
    [playerTile.X_Position, playerTile.Y_Position],
    [input.x, input.y],
  ).length <= player.Range_;
  const tileToChange = await models.Tiles.findOne({
    where: { X_Position: input.x, Y_Position: input.y, Layer_ID: playerTile.Layer_ID },
  });
  const layersTiles = await models.Tiles.findAll({ where: { Layer_ID: playerTile.Layer_ID } });
  const gatewaysRemaining = layersTiles.filter((tile) => tile.Tile_Type === 'Gateway_Open');

  if (!tileToChange) {
    return { ok: false, reason: REJECTIONS.NO_SUCH_TILE, data: { message: 'Could not find a gateway to lock at the given coordinates.' } };
  }

  const verdict = utils.checkGameState(game.GAME_STATE, false);
  if (verdict.blocked) return { ok: false, reason: verdict.reason };

  if (!playerClass || playerClass.Class_Name !== 'Guardian') {
    return { ok: false, reason: REJECTIONS.WRONG_CLASS, data: { className: 'Guardian' } };
  }

  if (tileToChange.Tile_Type !== 'Gateway_Open' && tileToChange.Tile_Type !== 'Gateway_Locked') {
    return { ok: false, reason: REJECTIONS.WRONG_TILE_TYPE, data: { message: 'You cannot lock a non-gateway tile!' } };
  }

  if (!tileInRange) {
    return { ok: false, reason: REJECTIONS.OUT_OF_RANGE, data: { message: 'You are not in range of the tile you want to lock/unlock!' } };
  }

  if (player.Action_Points < LOCK_COST) {
    return { ok: false, reason: REJECTIONS.NOT_ENOUGH_AP, data: { action: 'lock/unlock a tile' } };
  }

  if (game.GAME_STATE === GAMESTATES.FINALE
    && tileToChange.Tile_Type === 'Gateway_Open'
    && gatewaysRemaining.length === 1) {
    return { ok: false, reason: REJECTIONS.WRONG_TILE_TYPE, data: { message: 'You cannot lock the last open gateway in the layer during a finale!' } };
  }

  const newTileType = tileToChange.Tile_Type === 'Gateway_Open' ? 'Gateway_Locked' : 'Gateway_Open';
  await models.Tiles.update({ Tile_Type: newTileType }, { where: { Tile_ID: tileToChange.Tile_ID } });
  await models.Players.update(
    { Action_Points: player.Action_Points - LOCK_COST },
    { where: { Player_ID: player.Player_ID } },
  );

  return {
    ok: true,
    kind: 'locked',
    data: {
      // the old wording reports the tile's type as it was read, not as it
      // now is; kept byte-identical on purpose
      tileType: tileToChange.Tile_Type,
      newTileType,
      x: input.x,
      y: input.y,
      layerId: tileToChange.Layer_ID,
    },
  };
}

function present(result) {
  if (!result.ok) return { content: messageFor(result.reason, result.data) };
  const d = result.data;
  return { content: `You have made a ${d.tileType} tile on coordinates (${d.x}, ${d.y}) on layer ${d.layerId}!` };
}

module.exports = { parse, run, present };
