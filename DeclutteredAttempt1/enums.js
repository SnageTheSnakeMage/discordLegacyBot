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

//Higher priority
//TODO: add twin functionality to Tile movement check in utils(Line 827)
//TODO update gust implementation

//Medium priority
//task has been current place at Index@Line 68
//TODO fix logging and make proper logs and errors

//Lower Priority
//TODO MAKE SURE ALL INSTANCES OF A PLAYERS TILE BIENG SET WE ALSO SET A TILE.PLAYERX to THE PLAYERS ID
//TODO make sure there are no PlayerID in db calls
//TODO check each function that is async is bieng called with await
//TODO ensure any changes to Tile_ID cascade to the tile itself aswell with either
    // a Tiles db call 
    // or a utils removePlayerFromTile call
//TODO Check all DB calls to make sure they are using the right names for variables

//TODO NERF ROBOT, make movement cost 2 for robot
//TODO EDIT LAVA DIVER DESCRIPTION
//TODO REWRITE LAVA DIVER AP DISTRIB DAMAGE IN UTILS(line 227)
//TODO ADD SPEEDSTER CLASS
//TODO:FINISH PUNISH CLASS IMPLEMENTATION
        //TODO: finish punish command
        //TODO: add punish class to DB
        //TODO: review class code to make sure 39 classes do not break anything
        //TODO: review punish command to ensure leftover shoot command code doesnt not cause bugs
        //TODO: write down steps and review what it takes to make a new class
//TODO make poll handler in utils & finished override command

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

module.exports = {
  GAMESTATES,
  ChaosEvents
}