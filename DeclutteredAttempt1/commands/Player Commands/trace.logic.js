/**
 * /trace - preview the tiles a shot would travel through, without spending
 * anything (closes #91).
 *
 * parse/run/present per TESTING.md Part 1. run() takes plain data and a deps
 * bundle and returns a CommandResult; it never sees an interaction.
 *
 * This is /shoot's targeting half with every write removed: same game and
 * player resolution, same body handling, same utils.getTileCordinatesOfLine
 * path, same range rule. It deducts no AP, damages no wall and needs no
 * target player, because the whole point is to check a line before
 * committing to it.
 *
 * Deliberately unlike /shoot:
 * - no target user option. You trace to a tile, not at somebody, so the
 *   preview works on an empty tile or one you only suspect is occupied.
 * - out of range is reported rather than rejected. "How far out am I?" is
 *   exactly what a player is asking, so the path still comes back with the
 *   shortfall attached.
 */
const { REJECTIONS } = require('../../enums.js');
const { messageFor } = require('../_messages.js');
const defaultDeps = require('../_deps.js');

//the tile types a shot stops on: an intact wall soaks a shot, a damaged one
//is destroyed by it. Everything else is passed through.
const BLOCKING_TILE_TYPES = ['Wall', 'Wall_Damaged'];

function parse(raw, actor) {
  return {
    x: raw.x,
    y: raw.y,
    gameId: raw.game ?? null,
    body: raw.body === 2 ? 2 : 1,
    discordId: actor.discordId,
  };
}

async function run(input, deps = defaultDeps) {
  const { models, utils } = deps;

  //the same resolver /shoot uses (8c3cd694): a shot preview must land on the
  //game the shot itself would, so an old finished game is never picked
  const gameId = input.gameId ?? await utils.getOldestActiveGameId(input.discordId);
  const game = await models.Games.findByPk(gameId);
  if (!game) return { ok: false, reason: REJECTIONS.NO_SUCH_GAME, data: { gameId } };

  const player = await models.Players.findOne({ where: { Discord_ID: input.discordId, Game_ID: gameId } });
  if (!player) return { ok: false, reason: REJECTIONS.NOT_IN_GAME };

  const playerClass = await models.Classes.findByPk(player.Class_ID);
  const verdict = utils.checkGameState(
    game.GAME_STATE, await utils.isClockwatcher(models, player),
  );
  if (verdict.blocked) return { ok: false, reason: verdict.reason };

  const shootersTile = await models.Tiles.findByPk(input.body === 2 ? player.Tile_ID2 : player.Tile_ID);
  if (!shootersTile) {
    return { ok: false, reason: REJECTIONS.NOT_IN_GAME, data: { message: 'You are not on the board! Are you registered in that game?' } };
  }

  const targetTile = await models.Tiles.findOne({
    where: { Layer_ID: shootersTile.Layer_ID, X_Position: input.x, Y_Position: input.y },
  });
  if (!targetTile) return { ok: false, reason: REJECTIONS.NO_SUCH_TILE };

  const path = utils.getTileCordinatesOfLine(
    [shootersTile.X_Position, shootersTile.Y_Position],
    [targetTile.X_Position, targetTile.Y_Position],
  );

  //the first entry is the tile you are standing on, so distance is one less
  //than the path length - the same -1 /shoot applies to its range check
  const distance = path.length - 1;

  //walk the path in order so the first blocker is the first one listed
  const steps = [];
  for (let i = 1; i < path.length; i++) {
    const [x, y] = path[i];
    const tile = await models.Tiles.findOne({ where: { X_Position: x, Y_Position: y, Layer_ID: shootersTile.Layer_ID } });
    steps.push({
      x,
      y,
      //a coordinate the line crosses that has no row is off the board; say so
      //rather than dropping it, since it still costs the shot its distance
      tileType: tile ? tile.Tile_Type : null,
      blocks: tile ? BLOCKING_TILE_TYPES.includes(tile.Tile_Type) : false,
      inRange: i <= player.Range_,
    });
  }

  return {
    ok: true,
    kind: 'traced',
    data: {
      steps,
      distance,
      range: player.Range_,
      inRange: distance <= player.Range_,
      shootCost: game.shootCost,
      //shooting out of a bush is a coin flip for everyone but a Hunter, which
      //changes whether the line is worth taking at all
      fromBush: shootersTile.Tile_Type === 'Bush' && playerClass.Class_Name !== 'Hunter',
      targetInBush: targetTile.Tile_Type === 'Bush' && playerClass.Class_Name !== 'Hunter',
      target: { x: input.x, y: input.y },
    },
  };
}

function present(result) {
  if (!result.ok) return { content: messageFor(result.reason, result.data) };
  const d = result.data;

  if (d.steps.length === 0) {
    return { content: `${d.target.x},${d.target.y} is the tile you are standing on.` };
  }

  const lines = [`Path to ${d.target.x},${d.target.y} - ${d.distance} ${d.distance === 1 ? 'tile' : 'tiles'} away, your range is ${d.range}:`];
  for (const step of d.steps) {
    const type = step.tileType === null ? 'off the board' : step.tileType;
    const marks = [];
    if (step.blocks) marks.push('blocks the shot');
    if (!step.inRange) marks.push('out of range');
    lines.push(`- ${step.x},${step.y}: ${type}${marks.length ? ` (${marks.join(', ')})` : ''}`);
  }

  const firstBlocker = d.steps.find((step) => step.blocks);
  if (firstBlocker) {
    lines.push(`\nThe first shot would hit the ${firstBlocker.tileType} at ${firstBlocker.x},${firstBlocker.y}, not the target tile.`);
  }
  if (!d.inRange) {
    lines.push(`\nThat tile is ${d.distance - d.range} out of range.`);
  }
  if (d.fromBush || d.targetInBush) {
    lines.push('\nYou are shooting from or into a Bush, so each shot has a 50% chance to miss.');
  }
  lines.push(`\nShooting costs ${d.shootCost} AP a shot. Tracing costs nothing.`);

  return { content: lines.join('\n') };
}

module.exports = { parse, run, present };
