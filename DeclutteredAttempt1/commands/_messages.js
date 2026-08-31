/**
 * Player-facing text for every REJECTIONS code. All wording lives here so a
 * copy edit touches one file and no test. messageFor(reason, data) formats
 * the text; data carries the parameterization (class names, amounts, ...).
 *
 * This file must never import discord.js.
 */
const { REJECTIONS } = require('../enums.js');

const MESSAGES = {
  [REJECTIONS.GAME_OVER]: () => "Game is over! only the dev can use commands for this game at this time.\n Please register on a new game.",
  [REJECTIONS.GAME_PAUSED]: () => "Game is paused! only the dev can use commands for this game at this time.",
  [REJECTIONS.TIME_STOPPED]: () => "Time is stopped! only Clockwatchers can use commands at this time.",
  [REJECTIONS.GAME_IN_REGISTRATION]: () => "Game is in registration phase! only the dev can use commands for this game at this time.\n Please wait for the game to start.",
  [REJECTIONS.GAME_NOT_IN_REGISTRATION]: () => "This game is not accepting registrations right now.",

  [REJECTIONS.NO_SUCH_GAME]: (d) => `Could not find game${d && d.gameId != null ? ` #${d.gameId}` : ""}!`,
  [REJECTIONS.NOT_IN_GAME]: () => "Player not found in game!, please register for the game you wish to play in.",
  [REJECTIONS.PLAYER_DEAD]: () => "Dead players can't use this command.",
  [REJECTIONS.WRONG_CLASS]: (d) => `You are not a ${d && d.className ? d.className : "member of the right class"}!`,
  [REJECTIONS.NOT_DEV]: () => "Only the dev can use this command.",
  [REJECTIONS.NOT_DEAD_OR_MEDIUM]: () => "Only Dead or Medium can override a chaos council poll!",
  [REJECTIONS.ALREADY_REGISTERED]: () => "You are already registered for this game!",

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
  [REJECTIONS.WRONG_TILE_TYPE]: (d) => (d && d.message) || "You can't do that to this tile!",
  [REJECTIONS.TILE_OCCUPIED]: () => "There is a player on that tile!",
  [REJECTIONS.TILE_FULL]: () => "That tile is full!",
  [REJECTIONS.OUT_OF_RANGE]: (d) => `Your ${(d && d.role) || "target"} is not in range!`,
  [REJECTIONS.NOT_ON_GATEWAY]: () => "You must be on a Gateway tile or a Dimensional Hopper to use this command!",
  [REJECTIONS.NO_AVAILABLE_TILE]: (d) => (d && d.message) || "There are no available tiles to move to!",
  [REJECTIONS.INVALID_PATH]: (d) => (d && d.message) || "Invalid input path.",
  [REJECTIONS.INVALID_AMOUNT]: (d) => (d && d.message) || "That amount is not valid!",
};

function messageFor(reason, data) {
  // a command may carry its exact legacy wording in data.message; codes stay
  // stable while the prose stays byte-identical to what players saw before
  if (data && data.message) return data.message;
  const fmt = MESSAGES[reason];
  if (!fmt) return `Something went wrong! (unrecognised rejection: ${reason})`;
  return fmt(data);
}

module.exports = { messageFor, MESSAGES };
