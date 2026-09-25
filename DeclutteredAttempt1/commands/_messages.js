/**
 * Player-facing text for every REJECTIONS code. All wording lives here so a
 * copy edit touches one file and no test. messageFor(reason, data) formats
 * the text; data carries the parameterization (class names, amounts, ...).
 *
 * NOTICES below is the same idea for text that is NOT a rejection: a command
 * that succeeded but has nothing to say. Those still need words, because
 * Discord rejects an empty message and the whole command then fails into
 * "There was an error while executing this command!".
 *
 * This file must never import discord.js.
 */
const { REJECTIONS } = require('../enums.js');

/**
 * Discord's hard limit on message content. It lives here rather than in
 * _adapter.js because logic files need it too (databaseCall budgets its JSON
 * block against it) and a logic file may not import _adapter.js - that is the
 * one file allowed to require discord.js. One definition, both layers.
 */
const MAX_CONTENT = 2000;

const MESSAGES = {
  // No "only the dev can use commands" here: the gate has no idea who the dev
  // is (DEV_ID is read in the adapters), so these three used to promise an
  // exemption that does not exist and left the dev reading it too - issue
  // #166. Developer Commands do not call this gate at all, which is where the
  // dev's actual freedom to act on a paused game comes from.
  [REJECTIONS.GAME_OVER]: () => "Game is over!\n Please register on a new game.",
  [REJECTIONS.GAME_PAUSED]: () => "Game is paused! No one can use commands for this game until it is unpaused.",
  [REJECTIONS.TIME_STOPPED]: () => "Time is stopped! only Clockwatchers can use commands at this time.",
  [REJECTIONS.GAME_IN_REGISTRATION]: () => "Game is in registration phase!\n Please wait for the game to start.",
  [REJECTIONS.GAME_INACTIVE]: () => "This game isn't active!",
  [REJECTIONS.GAME_NOT_IN_REGISTRATION]: () => "This game is not accepting registrations right now.",

  [REJECTIONS.NO_SUCH_GAME]: (d) => `Could not find game${d && d.gameId != null ? ` #${d.gameId}` : ""}!`,
  [REJECTIONS.NOT_IN_GAME]: () => "Player not found in game!, please register for the game you wish to play in.",
  [REJECTIONS.PLAYER_DEAD]: () => "Dead players can't use this command.",
  [REJECTIONS.WRONG_CLASS]: (d) => `You are not a ${d && d.className ? d.className : "member of the right class"}!`,
  [REJECTIONS.NOT_DEV]: () => "Only the dev can use this command.",
  [REJECTIONS.NOT_DEAD_OR_MEDIUM]: () => "Only Dead or Medium can override a chaos council poll!",
  [REJECTIONS.ALREADY_REGISTERED]: () => "You are already registered for this game!",
  [REJECTIONS.NOT_ON_BOARD]: (d) => ((d && d.role)
    ? `The ${d.role} is not on the board - a dead player has no tile.`
    : "You are not on the board - a dead player has no tile."),
  [REJECTIONS.NOT_SANDBOX]: (d) => `/sandbox only works on a game in the SANDBOX gamestate${d && d.gamestate ? ` - game ${d.gameId} is ${d.gamestate}` : ""}.`,

  [REJECTIONS.TARGET_NOT_IN_GAME]: (d) => `The ${(d && d.role) || "target"} is not in the game!`,
  [REJECTIONS.TARGET_NOT_ON_TILE]: (d) => `The ${(d && d.role) || "target"} is not on the tile provided!`,
  [REJECTIONS.TARGET_NOT_DEAD]: () => "The resurrectee is not dead!",
  [REJECTIONS.NO_TARGET]: () => "Could not find target player!",
  [REJECTIONS.SAME_TILE]: () => "The player and victim are on the same tile!",

  [REJECTIONS.NOT_ENOUGH_AP]: (d) => `You dont have enough AP${d && d.action ? ` to ${d.action}` : ""}!`,
  [REJECTIONS.NOT_ENOUGH_CHEST_AP]: () => "There is not enough AP in the chest!",
  [REJECTIONS.NOT_ENOUGH_MEALS]: () => "You don't have enough ingriedients for a meal! Wait until next AP distribution",
  [REJECTIONS.NO_OVERRIDES]: () => "You don't have any overrides left!",

  [REJECTIONS.NO_SUCH_TILE]: (d) => (d && d.action ? `Could not find tile to ${d.action} at the given coordinates.` : "That tile is not on the board!"),
  [REJECTIONS.NO_SUCH_LAYER]: () => "That layer does not exist in this game!",
  [REJECTIONS.NOT_ORACLE]: () => "You can only look at the layer you are standing on! Only an Oracle can look at another layer.",
  [REJECTIONS.WRONG_TILE_TYPE]: (d) => (d && d.message) || "You can't do that to this tile!",
  [REJECTIONS.TILE_OCCUPIED]: () => "There is a player on that tile!",
  [REJECTIONS.TILE_FULL]: () => "That tile is full!",
  [REJECTIONS.OUT_OF_RANGE]: (d) => `Your ${(d && d.role) || "target"} is not in range!`,
  [REJECTIONS.NOT_ON_GATEWAY]: () => "You must be on a Gateway tile or a Dimensional Hopper to use this command!",
  [REJECTIONS.NO_AVAILABLE_TILE]: (d) => (d && d.message) || "There are no available tiles to move to!",
  [REJECTIONS.INVALID_PATH]: (d) => (d && d.message) || "Invalid input path.",
  [REJECTIONS.INVALID_AMOUNT]: (d) => (d && d.message) || "That amount is not valid!",

  [REJECTIONS.NO_SUCH_PRESET]: (d) => `No board preset called "${(d && d.preset) || ""}". Available: ${(d && d.available && d.available.join(", ")) || "none"}`,
  [REJECTIONS.BOARD_EXISTS]: (d) => `Game ${(d && d.gameId) ?? "?"} already has ${(d && d.layerCount) ?? "some"} layers. Pass replace:true to rebuild its board.`,
  [REJECTIONS.BOARD_IN_USE]: (d) => `${(d && d.playerCount) ?? "Some"} players are standing on this game's board - move or remove them before replacing it.`,
};

/**
 * Canned text for successful-but-empty results, keyed by NOTICES key. Edit the
 * wording here; nothing asserts on the prose, only on the key.
 */
const NOTICES = {
  NO_GAMES: (d) => ((d && d.gamestate && d.gamestate !== 'ALL')
    ? `No games are in ${d.gamestate} right now. Try /listgames gamestate:All to see every game.`
    : "There are no games yet! Ask the dev to run /create-game."),
};

/** Text for a NOTICES key. Unknown keys get a visible placeholder, never ''. */
function noticeFor(key, data) {
  const fmt = NOTICES[key];
  if (!fmt) return `Something went wrong! (unrecognised notice: ${key})`;
  return fmt(data);
}

function messageFor(reason, data) {
  // a command may carry its exact legacy wording in data.message; codes stay
  // stable while the prose stays byte-identical to what players saw before
  if (data && data.message) return data.message;
  const fmt = MESSAGES[reason];
  if (!fmt) return `Something went wrong! (unrecognised rejection: ${reason})`;
  return fmt(data);
}

module.exports = { messageFor, MESSAGES, noticeFor, NOTICES, MAX_CONTENT };
