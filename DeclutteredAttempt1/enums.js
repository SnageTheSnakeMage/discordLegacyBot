const GAMESTATES = Object.freeze({
  ACTIVE: "ACTIVE",
  DEV_PAUSED: "DEV_PAUSED",
  OVER: "OVER",
  TIMESTOPPED: "TIMESTOPPED",
  FINALE: "FINALE",
  REGISTRATION: "REGISTRATION",
  INACTIVE: "INACTIVE",
  SANDBOX: "SANDBOX"
})


const ChaosEvents = Object.freeze({

  //DONE
  "Free Movement": "Give everyone one tile of free movement every AP distribution while this chaos event is in play.",
  "Scorchers Joy": "Everyone on a blank tile that isnt a lava diver or pyromainiac takes 1 Damage every AP distribution while this chaos event is in play.",
  "Winters Hollow": "The first movement after every AP distribution costs an additional tile of movement for everyone except for Snowmen while this chaos event is in play.",
  "Blockade": "Walls can not be damaged while this chaos event is in play, sniper's snipes go through walls still.",
  //TODO update gust implementation
  "Northern Gust": "move everyone two spaces up every AP distribution while this chaos event is in play(cannot move players onto ice,void, or wall tiles unless the player is a Cloudborn)",
  "Western Gust": "move everyone two spaces left every AP distribution while this chaos event is in play(cannot move players onto ice,void, or wall tiles unless the player is a Cloudborn)",
  "Eastern Gust": "move everyone two spaces right every AP distribution while this chaos event is in play(cannot move players onto ice,void, or wall tiles unless the player is a Cloudborn)",
  "Southern Gust": "move everyone two spaces down every AP distribution while this chaos event is in play(cannot move players onto ice,void, or wall tiles unless the player is a Cloudborn)",
  "Time Acceleration!" : "AP distribution happens three times where it should only happen once while this chaos event is in play",
  "Medkit Airdrop":"AP distribution gives 1 HP aswell, doctors and chefs get 2 HP instead while this chaos event is in play",
  "Leftovers" : "Killing someone gives you their missed AP while this chaos event is in play",
  "Double Trouble: Icy-Hot": "Everyone on a blank tile that isnt a lava diver or pyromainiac takes 1 Damage every AP distribution & Everyone that isnt a snowman has to pay an extra tile of movement the first time they move after every AP distribution while this chaos event is in play",
  "Corpse Explosion": "Killing someone deals damage to everyone in the surrounding tiles(includes the tile the victim was on)",
  "BOOOORRRINNNG":"No chaos",
  //TODO implement following chaos events and override command
  // "Scope Airdrop": "Everyone gets +2 Range while this chaos event is in play",
  // "RAGE!!":"Everyone deals max damage while this chaos event is in play",
  // "World Peace":"No one can use a damaging command while this chaos even is in play",
  // "1-UP!":"Everyone gets an extra life where if they die they respawn on a random tile with 1 HP, the amount of HP the respawn with goes for each AP distribution this chaos event is in play for. Pharoh's get overflow HP instead of an extra life",
  // "Throwback":"Dead can give living players 1 AP every 24hrs while this chaos event is in play",
  // "People Magnet": "Move everyone to a random layer",
  // "Double Trouble: Tornado Gust: "Move everyone two spaces up, then two spaces left, then two spaces down, then two spaces right every AP distribution while this chaos event is in play (Cannot move players onto ice,void, or wall tiles unless the player is a Cloudborn)",
  // "Double Trouble: EVERYTHING ACCELERATION": "AP distribution happens thrice and each one gives a tile(effectively three) of free movement while this chaos event is in play.",
  // "Double Trouble: Northern Hurricane": "Move everyone two(effectively six) spaces up every AP distribution & do everything in an AP distribution thrice instead of once while this chaos event is in play (Cannot move players onto ice,void, or wall tiles unless the player is a Cloudborn)",
  // "Double Trouble: Southern Hurricane": "Move everyone two(effectively six) spaces down every AP distribution & do everything in an AP distribution thrice instead of once while this chaos event is in play (Cannot move players onto ice,void, or wall tiles unless the player is a Cloudborn)",
  // "Double Trouble: Eastern Hurricane": "Move everyone two(effectively six)  spaces right every AP distribution & do everything in an AP distribution thrice instead of once while this chaos event is in play (Cannot move players onto ice,void, or wall tiles unless the player is a Cloudborn)",
  // "Double Trouble: Western Hurricane": "Move everyone two(effectively six) spaces left every AP distribution & do everything in an AP distribution thrice instead of once while this chaos event is in play (Cannot move players onto ice,void, or wall tiles unless the player is a Cloudborn)",
  // "Pacifists Reward": "What ever player(s) has the least kills gets 1 extra AP every AP distribution while this chaos event is in play",
  // "Killers Bounty": "What ever player(s) has the most kills gets 1 extra AP every AP distribution while this chaos event is in play",
  // "Inactives Punishment": "What ever player(s) has the most missed AP loses 1 HP every AP distribution while this chaos event is in play",
  // "Boogie Woogie": "Everyone's places are swapped when this chaos event enters play"
  // "Chaotic Award: Sightseer": "What ever player(s) has(have) the most range gets 12 AP when this chaos event enters play",
  // "Chaotic Award: Most Sturdy": "What ever player(s) has(have) the most HP gets 12 AP when this chaos event enters play",
  // "Chaotic Award: Deadliest": "What ever player(s) has(have) the most damage gets 12 AP when this chaos event enters play",
  // "Chaotic Award: Murderer": "What ever player(s) has(have) the most kills gets 12 AP when this chaos event enters play",
  // "Chaotic Award: Lottery": "A random player gets 12 AP when this chaos event enters play",

})


// Machine-readable rejection codes. run() returns these; player-facing text
// lives in commands/_messages.js. Tests assert on the code, never the prose.
const REJECTIONS = Object.freeze({
  // gamestate gate
  GAME_OVER: "GAME_OVER",
  GAME_PAUSED: "GAME_PAUSED",
  TIME_STOPPED: "TIME_STOPPED",
  GAME_IN_REGISTRATION: "GAME_IN_REGISTRATION",
  GAME_INACTIVE: "GAME_INACTIVE",
  GAME_NOT_IN_REGISTRATION: "GAME_NOT_IN_REGISTRATION",
  // actor
  NO_SUCH_GAME: "NO_SUCH_GAME",
  NOT_IN_GAME: "NOT_IN_GAME",
  PLAYER_DEAD: "PLAYER_DEAD",
  WRONG_CLASS: "WRONG_CLASS",
  NOT_DEV: "NOT_DEV",
  NOT_DEAD_OR_MEDIUM: "NOT_DEAD_OR_MEDIUM",
  ALREADY_REGISTERED: "ALREADY_REGISTERED",
  // a player row whose Tile_ID is null - playerDeathLogic writes
  // {Tile_ID: null, Dead: true}, so this is what a dead player looks like to
  // any command that reads their tile
  NOT_ON_BOARD: "NOT_ON_BOARD",
  NOT_SANDBOX: "NOT_SANDBOX",
  // target
  TARGET_NOT_IN_GAME: "TARGET_NOT_IN_GAME",
  TARGET_NOT_ON_TILE: "TARGET_NOT_ON_TILE",
  TARGET_NOT_DEAD: "TARGET_NOT_DEAD",
  NO_TARGET: "NO_TARGET",
  SAME_TILE: "SAME_TILE",
  // economy
  NOT_ENOUGH_AP: "NOT_ENOUGH_AP",
  NOT_ENOUGH_CHEST_AP: "NOT_ENOUGH_CHEST_AP",
  NOT_ENOUGH_MEALS: "NOT_ENOUGH_MEALS",
  NO_OVERRIDES: "NO_OVERRIDES",
  // board
  NO_SUCH_TILE: "NO_SUCH_TILE",
  NO_SUCH_LAYER: "NO_SUCH_LAYER",
  WRONG_TILE_TYPE: "WRONG_TILE_TYPE",
  TILE_OCCUPIED: "TILE_OCCUPIED",
  TILE_FULL: "TILE_FULL",
  OUT_OF_RANGE: "OUT_OF_RANGE",
  NOT_ON_GATEWAY: "NOT_ON_GATEWAY",
  NO_AVAILABLE_TILE: "NO_AVAILABLE_TILE",
  INVALID_PATH: "INVALID_PATH",
  INVALID_AMOUNT: "INVALID_AMOUNT",
  // board building (/create-board)
  NO_SUCH_PRESET: "NO_SUCH_PRESET",
  BOARD_EXISTS: "BOARD_EXISTS",
  BOARD_IN_USE: "BOARD_IN_USE",
})

module.exports = {
  GAMESTATES,
  ChaosEvents,
  REJECTIONS,
}