/**
 * /exorcise - Exorcist class command: turn any non-gateway tile in range
 * into a blank tile, or (when a player is targeted) strip a player's class.
 *
 * parse/run/present per TESTING.md Part 1. run() takes plain data and a
 * deps bundle and returns a CommandResult; it never sees an interaction.
 *
 * Ported from the old execute with these fixes:
 * - `interaction.options.getUser('player').id ?? null` crashed with a
 *   TypeError whenever the optional player option was omitted (`?.` was
 *   intended), so tile mode never worked; absent option now parses to null
 * - getOldestGameId was called with NO argument, and that overload throws
 *   "missing playerDiscordID", so the no-game-option default always
 *   crashed; it now receives the actor's discord id like the other
 *   converted commands
 * - a missing game now returns NO_SUCH_GAME instead of crashing on
 *   game.Game_ID (the old catch turned that into "An error occurred: ...")
 * - a missing player now returns NOT_IN_GAME instead of crashing on
 *   player.Class_ID
 * - classRemoval(victim, excorist) was called with only the victim, so a
 *   Twin or revive-holding Pharoh target crashed on excorist.Kills; the
 *   exorcist is now passed as the second argument
 *
 * Preserved as-is (see the pinning tests):
 * - the gamestate gate runs BEFORE the missing-tile check, and passes
 *   isClockwatcher=false unconditionally, exactly like the old
 *   checkGameStateAndReply(gamestate, false, interaction) call
 * - there is no dead-player check: a dead Exorcist can still exorcise
 * - tile mode gates on 3 AP but DEDUCTS 4, so a 3-AP exorcist ends on -1
 * - class mode deducts the 16 AP from the TARGET, not the exorcist
 * - a targeted user who is not in the game silently falls into tile mode
 *   (and the gateway rejection still applies then)
 * - the tile-mode success message names the tile's PRE-revert type (the
 *   row was read before the update), never "Blank1"/"Blank2"
 * - rejection order: gamestate, missing tile, class, gateway, range, AP
 */
const { REJECTIONS } = require('../../enums.js');
const { messageFor } = require('../_messages.js');
const defaultDeps = require('../_deps.js');

function parse(raw, actor) {
  return {
    x: raw.x,
    y: raw.y,
    targetDiscordId: raw.player ?? null,
    targetUsername: raw.playerUsername ?? null,
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

  const targetPlayer = await models.Players.findOne({ where: { Game_ID: game.Game_ID, Discord_ID: input.targetDiscordId } });

  const playerClass = await models.Classes.findByPk(player.Class_ID);
  const playerTile = await models.Tiles.findByPk(player.Tile_ID);
  const tileInRange = utils.getTileCordinatesOfLine(
    [playerTile.X_Position, playerTile.Y_Position],
    [input.x, input.y],
  ).length <= player.Range_;
  const tileToChange = await models.Tiles.findOne({
    where: { X_Position: input.x, Y_Position: input.y, Layer_ID: playerTile.Layer_ID },
  });

  // the old code hard-coded isClockwatcher=false here, and gated BEFORE
  // verifying the tile; keep both
  const verdict = utils.checkGameState(game.GAME_STATE, false);
  if (verdict.blocked) return { ok: false, reason: verdict.reason };

  if (!tileToChange) {
    return { ok: false, reason: REJECTIONS.NO_SUCH_TILE, data: { action: 'exorcise' } };
  }

  if (playerClass.Class_Name !== 'Exorcist') {
    return { ok: false, reason: REJECTIONS.WRONG_CLASS, data: { className: 'Exorcist' } };
  }

  // gateway tiles are protected only in tile mode; a resolved target skips
  // this check entirely (the old && / || grouping did exactly this)
  if ((tileToChange.Tile_Type === 'Gateway_Open' && !targetPlayer)
    || (tileToChange.Tile_Type === 'Gateway_Locked' && !targetPlayer)) {
    return { ok: false, reason: REJECTIONS.WRONG_TILE_TYPE, data: { message: 'You cannot exorcise a gateway tile!' } };
  }

  // range is always measured to the inputted tile coordinates, even in
  // class-removal mode; the target's own position is never consulted
  if (!tileInRange) {
    return { ok: false, reason: REJECTIONS.OUT_OF_RANGE, data: { message: 'You are not in range of the tile or player you want to exorcise!' } };
  }

  // the legacy wording says "dig a tile" here, exactly like /dig
  if (player.Action_Points < 3 && !targetPlayer) {
    return { ok: false, reason: REJECTIONS.NOT_ENOUGH_AP, data: { action: 'dig a tile' } };
  }

  if (player.Action_Points < 16 && targetPlayer) {
    return { ok: false, reason: REJECTIONS.NOT_ENOUGH_AP, data: { action: 'remove a class' } };
  }

  if (targetPlayer) {
    // the old code charged the TARGET the 16 AP, not the exorcist; kept
    await models.Players.update(
      { Action_Points: targetPlayer.Action_Points - 16 },
      { where: { Player_ID: targetPlayer.Player_ID } },
    );
    await utils.classRemoval(targetPlayer, player);
    return { ok: true, kind: 'class_removed', data: { targetUsername: input.targetUsername } };
  }

  // tile mode: gated on 3 AP above, but the old code deducted 4; kept
  await models.Players.update(
    { Action_Points: player.Action_Points - 4 },
    { where: { Player_ID: player.Player_ID } },
  );
  await utils.revertTileToBlank(tileToChange);

  return {
    ok: true,
    kind: 'tile_exorcised',
    data: {
      x: input.x,
      y: input.y,
      // the pre-revert type, as the old message showed (the row was read
      // before the update)
      previousTileType: tileToChange.Tile_Type,
      layerId: tileToChange.Layer_ID,
    },
  };
}

function present(result) {
  if (!result.ok) return { content: messageFor(result.reason, result.data) };
  const d = result.data;
  if (result.kind === 'class_removed') {
    return { content: `You have exorcised ${d.targetUsername} and removed their class!` };
  }
  return { content: `You have made a ${d.previousTileType} tile on coordinates (${d.x}, ${d.y}) on layer ${d.layerId}!` };
}

module.exports = { parse, run, present };
