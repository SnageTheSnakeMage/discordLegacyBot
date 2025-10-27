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

  //DONE
  "Free Movement": "Give everyone one tile of free movement every AP distribution while this chaos event is in play.",
  "Scorchers Joy": "Everyone on a blank tile that isnt a lava diver or pyromainiac takes 1 Damage every AP distribution while this chaos event is in play.",
  "Winters Hollow": "The first movement after every AP distribution while this chaos event is in play costs an additional tile of movement for everyone except for Snowmen",
  "Blockade": "Walls can not be damaged while this chaos event is in play, sniper's snipes go through walls still.",
  //TODO update gust implementation
  "Northern Gust": "move everyone two spaces up every AP distribution while this chaos event is in play(cannot move players onto ice,void, or wall tiles unless the player is a Cloudborn)",
  "Western Gust": "move everyone two spaces left every AP distribution while this chaos event is in play(cannot move players onto ice,void, or wall tiles unless the player is a Cloudborn)",
  "Eastern Gust": "move everyone two spaces right every AP distribution while this chaos event is in play(cannot move players onto ice,void, or wall tiles unless the player is a Cloudborn)",
  "Southern Gust": "move everyone two spaces down every AP distribution while this chaos event is in play(cannot move players onto ice,void, or wall tiles unless the player is a Cloudborn)",
  "Time Acceleration!" : "AP distribution happens three times where it should only happen once while this chaos event is in play",
  "Medkit Airdrop":"AP distribution gives 1 HP aswell, doctors and chefs get 2 HP instead",
  "Leftovers" : "Killing someone gives you their missed AP while this chaos event is in play",
  "BOOOORRRINNNG":"No chaos",
  //TODO implement following chaos events and override command
  // "Blood Boil": "Killing someone deals damage to everyone in the surrounding tiles(includes the tile the victim was on)",
  // "Scope Airdrop": "Everyone gets +2 Range while this chaos event is in play",
  // "RAGE!!":"Everyone deals max damage while this chaos event is in play",
  // "World Peace":"No one can use a damaging command while this chaos even is in play",
  // "1-UP!":"Everyone gets an extra life where if they die they respawn on a random tile with 1 HP, the amount of HP the respawn with goes for each AP distribution this chaos event is in play for. Pharoh's get overflow HP instead of an extra life",
  // "Throwback":"Dead can give living players 1 AP every 24hrs while this chaos event is in play",
  // "People Magnet": "Move everyone to a random layer",
  // "Double Trouble: Icy-Hot": "Everyone on a blank tile that isnt a lava diver or pyromainiac takes 1 Damage every AP distribution & Everyone that isnt a snowman has to pay an extra tile of movement the first time they move after every AP distribution while this chaos event is in play",
  // "Double Trouble: Tornado Gust: "Move everyone two spaces up, then two spaces left, then two spaces down, then two spaces right every AP distribution while this chaos event is in play (Cannot move players onto ice,void, or wall tiles unless the player is a Cloudborn)",
  // "Double Trouble: EVERYTHING ACCELERATION": "AP distribution happens thrice and each one gives a tile(effectively three) of free movement while this chaos event is in play.",
  // "Double Trouble: Northern Hurricane": "Move everyone two(effectively six) spaces up every AP distribution & do everything in an AP distribution thrice instead of once while this chaos event is in play (Cannot move players onto ice,void, or wall tiles unless the player is a Cloudborn)",
  // "Double Trouble: Southern Hurricane": "Move everyone two(effectively six) spaces down every AP distribution & do everything in an AP distribution thrice instead of once while this chaos event is in play (Cannot move players onto ice,void, or wall tiles unless the player is a Cloudborn)",
  // "Double Trouble: Eastern Hurricane": "Move everyone two(effectively six)  spaces right every AP distribution & do everything in an AP distribution thrice instead of once while this chaos event is in play (Cannot move players onto ice,void, or wall tiles unless the player is a Cloudborn)",
  // "Double Trouble: Western Hurricane": "Move everyone two(effectively six) spaces left every AP distribution & do everything in an AP distribution thrice instead of once while this chaos event is in play (Cannot move players onto ice,void, or wall tiles unless the player is a Cloudborn)",

})

module.exports = {
  GAMESTATES,
  ChaosEvents
}