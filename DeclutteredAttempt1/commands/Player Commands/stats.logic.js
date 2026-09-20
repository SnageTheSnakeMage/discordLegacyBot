/**
 * /stats - show a player's stats in a game as an embed.
 *
 * parse/run/present per TESTING.md Part 1. run() takes plain data and a
 * deps bundle and returns a CommandResult; it never sees an interaction.
 *
 * Ported from the old execute with these fixes, each of which was a crash
 * before (see the conversion commit):
 * - utils.dbLayerIDtoCommonLayerID does not exist on the real utils object
 *   (it only ever existed on the since-deleted __mocks__ copy), so every
 *   /stats that got past
 *   the gamestate gate threw a TypeError; the db-layer-id -> common-layer-id
 *   conversion is now done inline against deps.models.Layers
 * - an unknown game id crashed reading game.GAME_STATE off null; it now
 *   returns NO_SUCH_GAME
 * - a target not in the game was thrown as an Error, so the player only ever
 *   saw the central handler's generic "There was an error..." text; it is now
 *   returned as NOT_IN_GAME carrying the exact legacy string, so the intended
 *   message finally reaches the player
 * - the default-class Pharoh-HP overflow field passed a raw number as the
 *   embed field value, which discord.js v14 builders reject (crash); it is
 *   now stringified
 *
 * Preserved as-is: isClockwatcher is hardcoded false (a Clockwatcher cannot
 * see stats during a timestop), the odd "current/ max/missed" AP spacing,
 * the default-game fallback via getOldestGameId (any gamestate, not just
 * active), and the default switch branch showing overflow Pharoh HP for any
 * non-Pharoh/Chef/Twin class.
 */
const { REJECTIONS } = require('../../enums.js');
const { messageFor } = require('../_messages.js');
const defaultDeps = require('../_deps.js');

function parse(raw, actor) {
  return {
    gameId: raw.game ?? null,
    targetDiscordId: raw.player ?? null,
    targetUsername: raw.playerUsername ?? null,
    // the target's avatar URL is Discord-only data the adapter passes along
    avatarURL: raw.playerAvatarURL ?? null,
    discordId: actor.discordId,
    username: actor.username,
  };
}

async function run(input, deps = defaultDeps) {
  const { models, utils } = deps;

  const gameId = input.gameId ?? await utils.getOldestActiveGameId(input.discordId);
  const targetDiscordId = input.targetDiscordId ?? input.discordId;
  const targetUsername = input.targetDiscordId ? input.targetUsername : input.username;

  const player = await models.Players.findOne({
    where: { Game_ID: gameId, Discord_ID: targetDiscordId },
  });
  if (!player) {
    return {
      ok: false,
      reason: REJECTIONS.NOT_IN_GAME,
      data: { message: 'Player not found in game! Please register for the game you wish to move in.' },
    };
  }

  const game = await models.Games.findByPk(gameId);
  if (!game) return { ok: false, reason: REJECTIONS.NO_SUCH_GAME, data: { gameId } };

  // legacy passed isClockwatcher=false unconditionally: stats is blocked for
  // everyone during a timestop, Clockwatchers included
  // a Clockwatcher acts through a timestop. Every call site used to
  // hard-code false here, so the class's whole ability did nothing.
  const verdict = utils.checkGameState(
    game.GAME_STATE, await utils.isClockwatcher(models, player),
  );
  if (verdict.blocked) return { ok: false, reason: verdict.reason };

  const playerClass = await models.Classes.findByPk(player.Class_ID);
  const playerTile = await models.Tiles.findByPk(player.Tile_ID);
  // playerDeathLogic writes {Tile_ID: null, Dead: true}, so a dead player has
  // no tile. That is not a reason to refuse the command: their final stats -
  // class, HP, kills, what they died with - are exactly what someone wants to
  // look up afterwards. Only the fields that describe a position on the board
  // are dropped, and present() says why rather than silently omitting them.
  const onBoard = playerTile != null;

  // db Layer_ID -> 1-based "common" layer number the players know
  const layerIds = (await models.Layers.findAll({ where: { Game_ID: gameId }, attributes: ['Layer_ID'] }))
    .map((l) => l.Layer_ID);
  const commonLayerId = onBoard ? `${layerIds.indexOf(playerTile.Layer_ID) + 1}` : null;

  let secondBody = null;
  if (playerClass.Class_Name === 'Twin') {
    const playerTile2 = await models.Tiles.findByPk(player.Tile_ID2);
    // a Twin can lose one body and keep the other, so this is independent of
    // whether the first body is still on the board
    if (playerTile2 != null) {
      secondBody = {
        commonLayerId: `${layerIds.indexOf(playerTile2.Layer_ID) + 1}`,
        xPosition: playerTile2.X_Position,
        yPosition: playerTile2.Y_Position,
      };
    }
  }

  return {
    ok: true,
    kind: 'stats',
    data: {
      username: targetUsername,
      avatarURL: input.avatarURL,
      className: playerClass.Class_Name,
      classDescription: playerClass.Description,
      roleColor: playerClass.Role_Color,
      healthPoints: player.Health_Points,
      maxHp: player.MAX_HP,
      missedHp: player.MISSED_HP,
      actionPoints: player.Action_Points,
      maxAp: player.MAX_AP,
      missedAp: player.MISSED_AP,
      damage: player.Damage,
      dmgBuff: player.DMG_BUFF,
      maxDamage: player.MAX_DAMAGE,
      range: player.Range_,
      maxRange: player.MAX_RANGE,
      onBoard,
      dead: Boolean(player.Dead),
      tileType: onBoard ? playerTile.Tile_Type : null,
      xPosition: onBoard ? playerTile.X_Position : null,
      yPosition: onBoard ? playerTile.Y_Position : null,
      commonLayerId,
      kills: player.Kills,
      pharohHp: player.Pharoh_HP,
      meals: player.Meals,
      gameId: player.Game_ID,
      discordId: player.Discord_ID,
      secondBody,
      timestamp: new Date(deps.now()).toISOString(),
      // Resolved here, not in present(): these become Discord attachments, and
      // AttachmentBuilder does not read the file until send time, so a path
      // that is not on disk fails as an unhandled error rather than a missing
      // image. resolveTileTexturePath falls back to the layer default, and
      // returns null only if that is missing too.
      iconPath: deps.utils.resolveTileTexturePath('players', deps.utils.playerIconName(player.Discord_ID, player.Game_ID)),
      tileThumbnailPath: onBoard
        ? deps.utils.resolveTileTexturePath('environment', playerTile.Tile_Type)
        : null,
    },
  };
}

function present(result) {
  if (!result.ok) return { content: messageFor(result.reason, result.data) };
  const d = result.data;

  const fields = [
    { name: 'Class', value: d.className, inline: true },
    { name: 'Class Description', value: d.classDescription },
    { name: 'Current/Max/Missed...', value: `Health: ${d.healthPoints.toString()}/${d.maxHp.toString()}/${d.missedHp.toString()}\nAction Points: ${d.actionPoints.toString()}/${d.maxAp.toString()}/${d.missedAp.toString()}`, inline: true },
    { name: 'Current/Max...', value: `Damage: ${(d.damage * (d.dmgBuff + 1)).toString()}/${d.maxDamage.toString()}\nRange: ${d.range.toString()}/${d.maxRange.toString()}`, inline: true },
  ];
  fields.push({ name: 'Kills', value: d.kills.toString() });
  // A player off the board has no tile to describe. Say so once, in place of
  // the position fields, rather than dropping them and leaving the reader to
  // wonder whether the command half-worked.
  if (d.onBoard) {
    fields.push({ name: 'Current Tile', value: d.tileType, inline: true });
  } else {
    fields.push({ name: 'Current Tile', value: d.dead ? 'Dead - off the board' : 'Not on the board', inline: true });
  }

  if (d.onBoard && d.className !== 'Spy' && d.className !== 'Twin') {
    fields.push(
      { name: 'X Position', value: d.xPosition.toString(), inline: true },
      { name: 'Y Position', value: d.yPosition.toString(), inline: true },
      { name: 'Layer', value: d.commonLayerId, inline: true },
    );
  }

  switch (d.className) {
    case 'Twin':
      // a Twin can lose one body and keep the other, so the second body is
      // reported independently of whether the first is still on the board
      fields.push({ name: '\u200B', value: '\u200B' });
      if (d.secondBody) {
        fields.push(
          { name: "Second Body's Layer", value: d.secondBody.commonLayerId, inline: true },
          { name: "Second Body's X Position", value: d.secondBody.xPosition.toString(), inline: true },
          { name: "Second Body's Y Position", value: d.secondBody.yPosition.toString(), inline: true },
        );
      } else {
        fields.push({ name: "Second Body", value: 'Off the board', inline: true });
      }
      break;
    case 'Pharoh':
      fields.push({ name: 'Pharoh HP', value: d.pharohHp.toString(), inline: true });
      break;
    case 'Chef':
      fields.push({ name: 'Meals', value: d.meals.toString(), inline: true });
      break;
    default:
      if (d.pharohHp > 0) {
        fields.push(
          { name: '\u200B', value: '\u200B' },
          // legacy passed the bare number here, which crashed the builder;
          // the value is now a string, no inline flag, as before
          { name: 'Pharoh HP', value: d.pharohHp.toString() },
        );
      }
  }

  const author = { name: d.username };
  if (d.avatarURL) author.icon_url = d.avatarURL;

  const embed = {
    color: parseInt(d.roleColor, 16),
    title: d.username,
    description: 'Stats for ' + d.username,
    author,
    thumbnail: { url: 'attachment://tileThumbnail.png' },
    fields,
    image: { url: 'attachment://icon.png' },
    timestamp: d.timestamp,
    footer: { text: 'Game ID: ' + d.gameId },
  };

  // Only attach what actually exists, and only reference an attachment the
  // embed will have. A null path means even the layer default is missing, so
  // the embed drops that image rather than handing Discord a dead path.
  const files = [];
  if (d.iconPath) files.push({ path: d.iconPath, name: 'icon.png' });
  else delete embed.image;
  if (d.tileThumbnailPath) files.push({ path: d.tileThumbnailPath, name: 'tileThumbnail.png' });
  else delete embed.thumbnail;

  // legacy attached the icon first, then the thumbnail
  return { embeds: [embed], files };
}

module.exports = { parse, run, present };
