/**
 * /build - Construction Worker class command: build a Wall on an empty tile
 * or a Chest on a tile in range, for 3 AP.
 *
 * parse/run/present per TESTING.md Part 1. run() takes plain data and a
 * deps bundle and returns a CommandResult; it never sees an interaction.
 *
 * Ported from the old execute with these fixes, each of which was a crash
 * or a dead branch before (see the conversion commit):
 * - the old code read interaction.options.getBoolean('wall?') but the
 *   declared option is named 'wall', so wall was always null: the wall
 *   branch and the occupied-tile check could never fire and the command
 *   could only ever build chests. The adapter now reads the declared
 *   'wall' option.
 * - utils.getOldestGameId() was called with no argument, and the effective
 *   implementation throws "missing playerDiscordID" - omitting the game
 *   option always crashed into the catch. The actor's discord id is now
 *   passed, as in the board conversion.
 * - a missing game or player row crashed on game.Game_ID / player.Class_ID;
 *   those now return NO_SUCH_GAME / NOT_IN_GAME.
 *
 * Preserved as-is: the AP check runs BEFORE the gamestate gate (so a broke
 * player in a paused game sees the AP message), the gamestate gate never
 * treats the builder as a Clockwatcher (the old code hard-coded false),
 * chests may be built on occupied tiles (only walls check occupants), and
 * the success message names the tile's PREVIOUS type - Tile_Type is read
 * before the update, so it says e.g. "You have made a Blank1 tile ...".
 */
const { REJECTIONS } = require('../../enums.js');
const { messageFor } = require('../_messages.js');
const defaultDeps = require('../_deps.js');

function parse(raw, actor) {
  return {
    wall: raw.wall,
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
  const tileInRange = utils.getTileCordinatesOfLine(
    [playerTile.X_Position, playerTile.Y_Position],
    [input.x, input.y],
  ).length <= player.Range_;
  const tileToChange = await models.Tiles.findOne({
    where: { X_Position: input.x, Y_Position: input.y, Layer_ID: playerTile.Layer_ID },
  });

  if (!tileToChange) {
    return { ok: false, reason: REJECTIONS.NO_SUCH_TILE, data: { action: 'build on' } };
  }

  if (playerClass.Class_Name !== 'Construction Worker') {
    return { ok: false, reason: REJECTIONS.WRONG_CLASS, data: { className: 'Construction Worker' } };
  }

  if (tileToChange.Tile_Type === 'Gateway_Open' || tileToChange.Tile_Type === 'Gateway_Locked') {
    return { ok: false, reason: REJECTIONS.WRONG_TILE_TYPE, data: { message: 'You cannot build on a gateway tile!' } };
  }

  // only walls care about occupants; chests build straight over players
  if (input.wall
    && (tileToChange.Player1 != null || tileToChange.Player2 != null
      || tileToChange.Player3 != null || tileToChange.Player4 != null)) {
    return { ok: false, reason: REJECTIONS.TILE_OCCUPIED };
  }

  if (!tileInRange) {
    return { ok: false, reason: REJECTIONS.OUT_OF_RANGE, data: { message: 'You are not in range of the tile you want to build!' } };
  }

  // old order preserved: AP before the gamestate gate
  if (player.Action_Points < 3) {
    return { ok: false, reason: REJECTIONS.NOT_ENOUGH_AP, data: { action: 'build a wall or chest' } };
  }

  // the old code hard-coded isClockwatcher=false here (a Construction
  // Worker can never be a Clockwatcher anyway)
  const verdict = utils.checkGameState(game.GAME_STATE, false);
  if (verdict.blocked) return { ok: false, reason: verdict.reason };

  await models.Players.update(
    { Action_Points: player.Action_Points - 3 },
    { where: { Player_ID: player.Player_ID } },
  );
  await models.Tiles.update(
    { Tile_Type: input.wall ? 'Wall' : 'Chest' },
    { where: { Tile_ID: tileToChange.Tile_ID } },
  );

  return {
    ok: true,
    kind: 'built',
    data: {
      // the old message read Tile_Type off the pre-update row, so it names
      // the tile's previous type; preserved byte-identically
      previousTileType: tileToChange.Tile_Type,
      x: input.x,
      y: input.y,
      layerId: tileToChange.Layer_ID,
    },
  };
}

function present(result) {
  if (!result.ok) return { content: messageFor(result.reason, result.data) };
  const d = result.data;
  return { content: `You have made a ${d.previousTileType} tile on coordinates (${d.x}, ${d.y}) on layer ${d.layerId}!` };
}

module.exports = { parse, run, present };
