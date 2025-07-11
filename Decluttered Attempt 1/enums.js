const GAMESTATES = Object.freeze({
  ACTIVE: "ACTIVE",
  DEV_PAUSED: "DEV_PAUSED",
  OVER: "OVER",
  TIMESTOPPED: "TIMESTOPPED",
  FINALE: "FINALE",
  REGISTRATION: "REGISTRATION",
  INACTIVE: "Inactive",
})

const ChaosEvents = Object.freeze({
  //TODO implement chaos events and override command

  //DONE
  "Free Movement": "Along with AP distribution everyone gets 1 free movement",
  "Scorchers Joy": "Everyone on a blank tile that isnt a lava diver or pyromainiac takes 1 Damage every AP distribution",
  "Winters Hollow": "-1 free movement(first move costs 1 move) every AP distribution except for Snowmen",
  "Blockade": "Walls can not be damaged while this chaos event is in play",
  "Northern Gust": "move everyone two spaces up every AP distribution",
  "Western Gust": "move everyone two spaces left every AP distribution",
  "Eastern Gust": "move everyone two spaces right every AP distribution",
  "Southern Gust": "move everyone two spaces down every AP distribution",
  "Frenzy!" : "Give triple ap during ap distribution",
  "Medkit Airdrop":"AP distribution gives 1 HP aswell, doctors and chefs get 2 HP instead",
  "Leftovers" : "Killing someone gives you their missed AP while this chaos event is in play",
  //TODO
  // "Blood Boil": "Killing someone deals damage to everyone in the surrounding tiles(includes the tile the victim was on)",
  // "Scope Airdrop": "Everyone gets +2 Range while this chaos event is in play",
  // "RAGE!!":"Everyone deals max damage while this chaos event is in play",
  // "World Peace":"No one can use a damaging command while this chaos even is in play",
  // "1-UP!":"Everyone gets an extra life where if they die they respawn on a random tile with 1 HP",
  // "BOOOORRRINNNG":"No chaos",
  // "Throwback":"Dead can give living players 1 AP every 24hrs while this chaos event is in play",
  // "People Magnet": "Move everyone to a random layer",
})

module.exports = {
  GAMESTATES
}