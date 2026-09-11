/**
 * /weaponize - Blacksmith class command: for 6 AP, give a player in range a
 * damage buff so their next attack does double damage.
 *
 * parse/run/present per TESTING.md Part 1. run() takes plain data and a deps
 * bundle and returns a CommandResult; it never sees an interaction.
 *
 * Ported from the old execute with these fixes, each of which was a crash, a
 * dead read or a guard that could never pass (see the conversion commit):
 * - `await deferReply(interaction)` called a helper this file never imports,
 *   so every /weaponize threw "deferReply is not defined" before anything
 *   else ran; the adapter now uses plain interaction.deferReply()
 * - `interaction.options.getUser('player').id ?? interaction.user.id` read
 *   .id off null whenever the optional player option was omitted, so the
 *   documented "defaults to yourself" always threw; parse now falls back to
 *   the actor's id
 * - a missing game row crashed on game.GAME_STATE -> NO_SUCH_GAME
 * - a missing player row crashed on player.Tile_ID -> NOT_IN_GAME
 * - a missing target row crashed on targetPlayer.Tile_ID; the "Could not
 *   find target player!" guard that stood at the bottom of the command was
 *   testing `!targetId`, which can never be falsy (getUser().id is either a
 *   snowflake or it already threw), so it never fired. That message is now
 *   attached to a live !targetPlayer guard, placed before the first read of
 *   the target row
 * - the class gate compared `player.Class`, which is not a Players column
 *   (see database/Models/Players.js), so it was always undefined and every
 *   caller - Blacksmiths included - was told "You are not a Blacksmith!".
 *   The class row is now loaded through Class_ID and Class_Name compared, as
 *   the other class commands do
 * - the range check measured from `player.X_Position, player.Y_Position`,
 *   also not Players columns, so the line was drawn from [undefined,
 *   undefined]; it now starts at the Blacksmith's own tile coordinates
 *
 * Preserved as-is (each pinned by a test):
 * - there is no default-game lookup. The option description promises "oldest
 *   active game", but the command only ever read the option, so omitting it
 *   finds no game; that path now reports NO_SUCH_GAME instead of crashing
 * - the gamestate gate passes isClockwatcher=false, so a timestop blocks
 *   everyone here
 * - rejection order: gamestate, missing tile, missing target, target not on
 *   the tile, range, class, AP
 * - the buff INCREMENTS DMG_BUFF rather than setting it, so repeated
 *   weaponizing stacks the multiplier
 * - x/y default to the Blacksmith's own tile, so /weaponize with no
 *   coordinates targets whoever the buff is aimed at only if they share the
 *   Blacksmith's tile
 * - there is no dead-player check, and nothing stops a Blacksmith buffing
 *   themselves
 * - the AP write uses the in-memory Action_Points read before the buff write
 */
const { REJECTIONS } = require('../../enums.js');
const { messageFor } = require('../_messages.js');
const defaultDeps = require('../_deps.js');

const AP_COST = 6;

function parse(raw, actor) {
  return {
    // the old code crashed here when the option was omitted; "defaults to
    // yourself" is what the option description always promised
    targetDiscordId: raw.player ?? actor.discordId,
    targetUsername: raw.playerUsername ?? actor.username,
    x: raw.x ?? null,
    y: raw.y ?? null,
    gameId: raw.game ?? null,
    discordId: actor.discordId,
  };
}

async function run(input, deps = defaultDeps) {
  const { models, utils } = deps;

  // no default-game lookup: the old command only ever read the option
  const gameId = input.gameId;
  const game = await models.Games.findByPk(gameId);
  if (!game) return { ok: false, reason: REJECTIONS.NO_SUCH_GAME, data: { gameId } };

  const player = await models.Players.findOne({ where: { Game_ID: gameId, Discord_ID: input.discordId } });
  if (!player) return { ok: false, reason: REJECTIONS.NOT_IN_GAME };

  const playersTile = await models.Tiles.findOne({ where: { Tile_ID: player.Tile_ID } });
  const x = input.x ?? playersTile.X_Position;
  const y = input.y ?? playersTile.Y_Position;

  const targetTile = await models.Tiles.findOne({
    where: { Layer_ID: playersTile.Layer_ID, X_Position: x, Y_Position: y },
  });
  const targetPlayer = await models.Players.findOne({ where: { Game_ID: gameId, Discord_ID: input.targetDiscordId } });

  // the old code hardcoded isClockwatcher=false, so even a Clockwatcher is
  // blocked by a timestop here
  // a Clockwatcher acts through a timestop. Every call site used to
  // hard-code false here, so the class's whole ability did nothing.
  const verdict = utils.checkGameState(
    game.GAME_STATE, await utils.isClockwatcher(models, player),
  );
  if (verdict.blocked) return { ok: false, reason: verdict.reason };

  if (!targetTile) {
    return { ok: false, reason: REJECTIONS.NO_SUCH_TILE, data: { message: 'The tile provided is not in the game!' } };
  }

  // the legacy `!targetId` guard could never fire; its message now guards the
  // row that actually goes missing
  if (!targetPlayer) {
    return { ok: false, reason: REJECTIONS.NO_TARGET };
  }

  if (targetTile.Tile_ID != targetPlayer.Tile_ID) {
    return { ok: false, reason: REJECTIONS.TARGET_NOT_ON_TILE, data: { message: 'Your target is not on the tile provided!' } };
  }

  const tileInRange = utils.getTileCordinatesOfLine(
    [playersTile.X_Position, playersTile.Y_Position],
    [targetTile.X_Position, targetTile.Y_Position],
  ).length <= player.Range_;
  if (!tileInRange) {
    return { ok: false, reason: REJECTIONS.OUT_OF_RANGE };
  }

  const playerClass = await models.Classes.findByPk(player.Class_ID);
  if (!playerClass || playerClass.Class_Name != 'Blacksmith') {
    return { ok: false, reason: REJECTIONS.WRONG_CLASS, data: { className: 'Blacksmith' } };
  }

  if (player.Action_Points < AP_COST) {
    return { ok: false, reason: REJECTIONS.NOT_ENOUGH_AP, data: { action: 'weaponize' } };
  }

  // the buff stacks: DMG_BUFF is incremented, not set
  await models.Players.update(
    { DMG_BUFF: targetPlayer.DMG_BUFF + 1 },
    { where: { Game_ID: gameId, Discord_ID: input.targetDiscordId } },
  );

  await models.Players.update(
    { Action_Points: player.Action_Points - AP_COST },
    { where: { Game_ID: gameId, Discord_ID: input.discordId } },
  );

  return {
    ok: true,
    kind: 'weaponized',
    data: {
      targetUsername: input.targetUsername,
      targetDiscordId: input.targetDiscordId,
      dmgBuff: targetPlayer.DMG_BUFF + 1,
    },
  };
}

function present(result) {
  if (!result.ok) return { content: messageFor(result.reason, result.data) };
  const d = result.data;
  return { content: "You have given " + d.targetUsername + " a double damage buff! Their next attack(shoot, punish, or snipe) will do x2 damage!" };
}

module.exports = { parse, run, present };
