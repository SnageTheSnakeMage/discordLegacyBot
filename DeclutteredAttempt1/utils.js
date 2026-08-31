// utils.js - Shared utility functions


  //#region BOILERPLATE
const Canvas = require('canvas');
const path = require('path');
const verbose = true;
const initModels = require("./database/init-models.js");
const { Sequelize, Op } = require('sequelize');
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: process.env.LEGACY_DB_STORAGE || './database/database.db',
  logging: process.env.LEGACY_DB_LOGGING === '1' ? console.log : false,
});
const fs = require('fs');
const { logger } = require('sequelize/lib/utils/logger');
var models = initModels(sequelize);
var GAMESTATES = require('./enums.js').GAMESTATES;
var REJECTIONS = require('./enums.js').REJECTIONS;
const ChaosEvents = require('./enums.js').ChaosEvents;
const APCHECKINTERVAL_SECONDS = 30;
var logger150 = globalThis.topLogger.child({file: 'utils.js'})
//#endregion BOILERPLATE
module.exports = {
  models,
  sequelize,
  GAMESTATES,
// Function to load a tile texture


async timeCheck(client){ 
  //start apcheckinterval for each active game
  const games = await models.Games.findAll({where: {GAME_STATE: {[Op.or]: [GAMESTATES.ACTIVE, GAMESTATES.TIMESTOPPED, GAMESTATES.FINALE ]}}});
  for (const game of games) {
    this.startAPCheckInterval(game, client);
  }
},

getRandomItemInCollection(collection) {
  // getRandomInt(max) is inclusive of max (Math.round), so index by length-1
  return collection[this.getRandomInt(collection.length - 1)];
},

buildChaosCouncilPoll(lastEventKey, game){
  var chaosEventNames = Object.keys(ChaosEvents);
  var randomEvent1 = this.getRandomItemInCollection(chaosEventNames);
  var randomEvent2 = this.getRandomItemInCollection(chaosEventNames);
  while(randomEvent1 == randomEvent2){
    randomEvent2 = this.getRandomItemInCollection(chaosEventNames);
  }
  return {
    question: {text: "Chaos Council Poll, Choose A Chaos Event"},
    answers: [
      {text: "previous event: "+ lastEventKey},
      {text: randomEvent1},
      {text: randomEvent2}
    ],
    duration: Math.round(game.AP_INTERVAL_MIN / 60)
  }
},

startAPCheckInterval(game, client){
  //every 30 seconds check if AP needs to be distributed if your behind distribute it multiple times for each interval you are behind on
  setInterval( async() => {
    logger150.debug({function: "startAPCheckInterval"},  "started an ap check interval!")
    //how often AP is distributed for the game in milliseconds
    var apInterval = game.AP_INTERVAL_MIN *  60000
    //how long it has been since the last AP distribution in milliseconds
    var lastDistrib = Date.now() - game.lastAPDistributionTimestampInMS;
    if(lastDistrib > apInterval){
      //amount of times ap should have been distributed
      var times = Math.floor(lastDistrib / apInterval);
      logger150.debug({function: "startAPCheckInterval"}, `calculated ${times.toString()} AP distributions (lastDitrib: ${lastDistrib}, apInterval: ${apInterval}, times: ${times})`)
      await this.distributeAP(game, times, client);
      if(times >= 1){await models.Games.update({lastAPDistributionTimestampInMS: Date.now()}, {where: {Game_ID: game.Game_ID}});}
    }
  }, APCHECKINTERVAL_SECONDS * 1000)
},

async distributeAP(game, times, client){
  var lavaDiverClass = await models.Classes.findOne({where: {Class_Name: "Lava Diver"}});
  var gluttonClass = await models.Classes.findOne({where: {Class_Name: "Glutton"}});
  var immutableClass = await models.Classes.findOne({where: {Class_Name: "Immutable"}});
  var chefClass = await models.Classes.findOne({where: {Class_Name: "Chef"}});
  var hitmanClass = await models.Classes.findOne({where: {Class_Name: "Hitman"}});
  var pyromainiacClass = await models.Classes.findOne({where: {Class_Name: "Pyromaniac"}});
  var snowmanClass = await models.Classes.findOne({where: {Class_Name: "Snowman"}});

  // var channel = await client.guild.channels.fetch(game.deadChatChannelId);
  // var poll = await channel.messages.fetch(game.currentChaosPollMsgId).poll;
  // game.currentChaosPollMsgId = null;
  // await models.Games.update({CURR_CC_EVENT: this.pollToResults(poll, game)}, {where: {Game_ID: game.Game_ID}});

  //   //find the player(s) with the most missed AP
  // if(playersWithMostMissedAP.length > 0 && game.CURR_CC_EVENT == "Inactives Punishment"){
  //   //find the player(s) with missed AP
  //   var Inactives = await models.Players.findAll({where: {Game_ID: game.Game_ID, MISSED_AP: { [Op.gt]: 0 }}});
  //   var mostMissedAP = 0;
  //   var playerIDsWithMostMissedAP = [];
  //   //find largest number of missed AP
  //   for(const inactive of Inactives){
  //     if(inactive.MISSED_AP > mostMissedAP){
  //       mostMissedAP = inactive.MISSED_AP;
  //     }
  //   }
  //   //get the IDs of the players with the most missed AP
  //   for(const inactive of Inactives){
  //     if(inactive.MISSED_AP == mostMissedAP){
  //       playerIDsWithMostMissedAP.push(inactive.Player_ID);
  //     }
  //   }
  // }
  //get all alive players in the game and give them as much AP as the game gives per interval multiplied by times
  const livingPlayers = await models.Players.findAll({where: {Game_ID: game.Game_ID, Dead: false}});
  for (const player of livingPlayers) {
      //give AP to everyone
      await models.Players.update({Action_Points: player.Action_Points + game.APAmount * times}, {where: {Game_ID: game.Game_ID, Player_ID: player.Player_ID}});
      //give AP to gluttons again
      if(player.Class_ID == gluttonClass.Class_ID){
        await models.Players.update({Action_Points: player.Action_Points + game.APAmount * times}, {where: {Game_ID: game.Game_ID, Player_ID: player.Player_ID}});        
      }
      //kill immutables if their doomsday is 0
      if(game.immutableDoomsday <= 0 && player.Class_ID == immutableClass.Class_ID){
        await models.Players.update({Dead: true, Tile_ID: null}, {where: {Game_ID: game.Game_ID, Player_ID: player.Player_ID}});
      }
      //give meals to chefs
      if(player.Class_ID == chefClass.Class_ID){
        await models.Players.update({Meals: player.Meals + 1}, {where: {Game_ID: game.Game_ID, Player_ID: player.Player_ID}});        
      }
      //give hitmen another target if they dont have one or if their target is dead
      if(player.Class_ID == hitmanClass.Class_ID && player.Hitman_Target == null || player.Hitman_Target != null && livingPlayers.find((p) => p.Player_ID == player.Hitman_Target).Dead == true){
        var randomPlayer = livingPlayers[this.getRandomInt(livingPlayers.length)];
        await models.Players.update({Hitman_Target: randomPlayer.Player_ID}, {where: {Game_ID: game.Game_ID, Player_ID: player.Player_ID}});
      }
      // // Chaos Council Event Logic That Triggers Every AP Distribution
      // switch(game.CURR_CC_EVENT) {
      // case "Free Movement":
      //   //give everyone 1 free movement
      //   await models.Players.update({Free_Movement: player.Free_Movement + 1}, {where: {Game_ID: game.Game_ID, Player_ID: player.Player_ID}});
      //   break;
      // case "Scorchers Joy":
      //   //everyone on a blank tile that isnt a lava diver or pyromainiac takes 1 Damage every AP distribution
      //   var tileType = await models.Tiles.findByPk(player.Tile_ID).Tile_Type;
      //   if(tileType == "Blank1" || tileType == "Blank2"){
      //     if(player.Class_ID != lavaDiverClass.Class_ID || player.Class_ID != pyromainiacClass.Class_ID){
      //         await models.Players.update({Health_Points: player.Health_Points - 1}, {where: {Game_ID: game.Game_ID, Player_ID: player.Player_ID}});
      //     }
      //   }
      //   break;
      // case "Winters Hollow":
      //   //give everyone -1 free movement unless they are a snowman
      //   if(player.Class_ID != snowmanClass.Class_ID){
      //     await models.Players.update({Free_Movement: player.Free_Movement - 1}, {where: {Game_ID: game.Game_ID, Player_ID: player.Player_ID}});
      //   }
      //   break;
      // case "Time Acceleration!":
      //   //give every AP two more times
      //   await models.Players.update({Action_Points: player.Action_Points + game.APAmount * times * 2}, {where: {Game_ID: game.Game_ID, Player_ID: player.Player_ID}});
      //   break;
      // case "Medkit Airdrop":
      //   //give everyone 1 HP
      //   await models.Players.update({Health_Points: player.Health_Points + 1}, {where: {Game_ID: game.Game_ID, Player_ID: player.Player_ID}});
      //   break;
      // case "Northern Gust":
      //   //move everyone two spaces up if possible
      //   //get tile
      //   currentTile = await models.Tiles.findByPk(player.Tile_ID);
      //   newTile = await models.Tiles.findOne({where: {Game_ID: game.Game_ID, Layer_ID: currentTile.Layer_ID, X: currentTile.X, Y: currentTile.Y - 2}});
      //   if(newTile != null){
      //     this.moveFromTiletoTile(currentTile, newTile, player);
      //   }
      //   break;
      // case "Western Gust":
      //   //move everyone two spaces left if possible
      //   //get tile
      //   currentTile = await models.Tiles.findByPk(player.Tile_ID);
      //   newTile = await models.Tiles.findOne({where: {Game_ID: game.Game_ID, Layer_ID: currentTile.Layer_ID, X: currentTile.X - 2, Y: currentTile.Y}});
      //   if(newTile != null){
      //     this.moveFromTiletoTile(currentTile, newTile, player);
      //   }
      //   break;
      // case "Eastern Gust":
      //   //move everyone two spaces right if possible
      //   //get tile
      //   currentTile = await models.Tiles.findByPk(player.Tile_ID);
      //   newTile = await models.Tiles.findOne({where: {Game_ID: game.Game_ID, Layer_ID: currentTile.Layer_ID, X: currentTile.X + 2, Y: currentTile.Y}});
      //   if(newTile != null){
      //     this.moveFromTiletoTile(currentTile, newTile, player);
      //   }
      //   break;
      // case "Southern Gust":
      //   //move everyone two spaces right if possible
      //   //get tile
      //   currentTile = await models.Tiles.findByPk(player.Tile_ID);
      //   //see where the player would move to
      //   var newTile = await models.Tiles.findOne({where: {Game_ID: game.Game_ID, Layer_ID: currentTile.Layer_ID, X: currentTile.X, Y: currentTile.Y + 2}});
      //   //if the player would move to a valid tile move them
      //   //check if the tile exists
      //   //check if the tile is a wall, ice, void, or wall damaged or if the player is a cloudborn
      //   if(newTile != null && (newTile.Tile_Type != "Wall" && newTile.Tile_Type != "Wall_Damaged" && newTile.Tile_Type != "Ice" && newTile.Tile_Type != "Void" || player.Class_ID == cloudbornClass.Class_ID)){
      //       //move the player to the new tile
      //       this.moveFromTiletoTile(currentTile, newTile, player);
      //   }
      //   //if the player would move to an invalid tile move them to the next valid tile
      //   else{
      //     newTile = await models.Tiles.findOne({where: {Game_ID: game.Game_ID, Layer_ID: currentTile.Layer_ID, X: currentTile.X, Y: currentTile.Y + 1}});
      //     if(newTile != null && (newTile.Tile_Type != "Wall" && newTile.Tile_Type != "Wall_Damaged" && newTile.Tile_Type != "Ice" && newTile.Tile_Type != "Void" || player.Class_ID == cloudbornClass.Class_ID)){
      //       this.moveFromTiletoTile(currentTile, newTile, player);
      //     }
      //   }
      //   break;
      // case "Double Trouble: Icy-Hot":
      //   //everyone on a blank tile that isnt a lava diver or pyromainiac takes 1 Damage every AP distribution
      //   var tileType = await models.Tiles.findByPk(player.Tile_ID).Tile_Type;
      //   if(tileType == "Blank1" || tileType == "Blank2"){
      //     if(player.Class_ID != lavaDiverClass.Class_ID || player.Class_ID != pyromainiacClass.Class_ID){
      //         await models.Players.update({Health_Points: player.Health_Points - 1}, {where: {Game_ID: game.Game_ID, Player_ID: player.Player_ID}});
      //     }
      //   }
      //   //give everyone -1 free movement unless they are a snowman
      //   if(player.Class_ID != snowmanClass.Class_ID){
      //     await models.Players.update({Free_Movement: player.Free_Movement - 1}, {where: {Game_ID: game.Game_ID, Player_ID: player.Player_ID}});
      //   }
      //   break;
      // case "Inactives Punishment":
      //   //damage the player if they are one of the players with the most missed AP
      //   if(playerIDsWithMostMissedAP.includes(player.Player_ID)){
      //     await models.Players.update({Health_Points: player.Health_Points - 1}, {where: {Game_ID: game.Game_ID, Player_ID: player.Player_ID}});
      //   }
      //   break;
      // }
  }
  //also damage any players that are on the same tile as a lava diver and arent lava divers themselves
  //first get all the lava divers
  const allLavaDivers = await models.Players.findAll({where: {Game_ID: game.Game_ID, Class_ID: lavaDiverClass.Class_ID}});
  for (const diver of allLavaDivers) {
    if (diver.Tile_ID == null) continue;
    //then get all the players on the same tile as a lava diver
    const playersSharingTile = await models.Players.findAll({where: {Game_ID: game.Game_ID, Tile_ID: diver.Tile_ID, Class_ID: { [Op.ne]: lavaDiverClass.Class_ID }}});
    //then damage all the non lava diver players on the same tile
    for (const player of playersSharingTile) {
      await models.Players.update({Health_Points: player.Health_Points - 1}, {where: {Game_ID: game.Game_ID, Player_ID: player.Player_ID}});
      await this.playerDeathLogic(diver, player);
    }
  }
  //tick down doomsday for immutables
  game.immutableDoomsday--;

  //tick down clockwatcher timestop if the game is timestopped
  if(game.GAME_STATE == GAMESTATES.TIMESTOPPED){
    game.timestopTurns--;
    if(game.timestopTurns == 0){
      game.GAME_STATE = GAMESTATES.ACTIVE;
    }
  }



  // const chaosCouncilChannel = client.channel.cache.get(game.deadChatChannelId);
  // chaosCouncilChannel.send(this.buildChaosCouncilPoll(game.CURR_CC_EVENT, game) )
  // .then(msg => {game.currentChaosPollMsgId = msg.id}).catch(console.error);
  await game.save();
},

//Returns the text of a discord polls most voted option
async pollToResults(poll, game) {
  var MostVotedAnswer = 0;
  if(game.overrider == null)
    for (answer in poll.answers) {
    if (answer.voteCount > MostVotedAnswer) {
      MostVotedAnswer = answer;
    }
    
  }
  if(game.overrider != null){
    for (answer in poll.answers) {
      if(await answer.fetchVoters({after: game.overrider, limit: 1})) MostVotedAnswer = answer;
    }
  }
  return MostVotedAnswer.text;;
},

async loadTileTexture(layer, textureName) {
  // Create a unique key for the cache
  const cacheKey = `${textureName}`;
  
  // Check if tile is already cached
  if (global.tileCache[cacheKey]) {
    return global.tileCache[cacheKey];
  }

  if(textureName == null) {
    if(verbose) logger150.debug({function: "loadTileTexture"}, "No texture name provided, using transparent texture.");
    textureName = 'transparent';
  }

  // Path to tile textures folder (organized by layer)
  const tilePath =  "./tiles/" + layer + "/" + textureName + ".png";
  logger150.debug({function: "loadTileTexture"}, "Loading tile texture:", tilePath);
  
  try {
    // Load the image
    const image = await Canvas.loadImage(tilePath);
    // Cache the texture
    global.tileCache[cacheKey] = image;
    
    return image;
  } catch (error) {
    logger150.error({function: "loadTileTexture"}, `Failed to load tile texture ${textureName}: ${error}`);
    // Return a default texture or placeholder for the appropriate layer  
    const defaultTile = await Canvas.loadImage("./tiles/" + layer + "/default.png");
    return defaultTile;
  }
},

async  commandResolutionErrorThrower() {
  delay(850000);
  throw "Command Resolution Error";
},




//removes a class from a player
//is a function due to weird edge cases
// takes in a player object for the victim & exorcist
async classRemoval(victim, excorist){
  var playerClass = await models.Classes.findByPk(victim.Class_ID)
  var avgClass = await models.Classes.findOne({where: {Class_Name: "Average"}})
  switch(playerClass.Class_Name){
    //if the player is a twin get rid of their second body and give the exorcist a kill
    case "Twin":
      //TODO make sure any given free movement is also given to the twins other body
      await models.Players.update({Class_ID: avgClass.Class_ID, Health_Points2: 0, Damage2: 0, Tile_ID2: null, Free_Move2: 0, Range2: 0}, {where: {Player_ID: victim.Player_ID}});
      await models.Players.update({Kills: excorist.Kills + 1}, {where: {Player_ID: excorist.Player_ID}});
      break;
    //if the player is a cloudborn make sure they aren't put on a tile they can't be on
    case "Cloudborn":
      //get the players current tile
      var playerTile = await models.Tiles.findByPk(victim.Tile_ID)
      //remove class
      await models.Players.update({Class_ID: avgClass.Class_ID}, {where: {Player_ID: victim.Player_ID}});
      //move player onto a surrounding tile if they are on an ice, void, or wall tile
      if(playerTile.Tile_Type == "Ice" || playerTile.Tile_Type == "Void" || playerTile.Tile_Type == "Wall" || playerTile.Tile_Type == "Wall_Damaged"){
        this.movePlayerToRandomSurroundingTile(victim.Player_ID, playerTile.Layer_ID, playerTile.X_Position, playerTile.Y_Position);
      }
    //if the player is a hitman remove their target
    case "Hitman":
      await models.Players.update({Class_ID: avgClass.Class_ID, Hitman_Target: null}, {where: {Player_ID: victim.Player_ID}});
      break;
    //if the player is a pharaoh take away of their revive HP and if any and give a kill to exorcist
    case "Pharaoh":
      await models.Players.update({Class_ID: avgClass.Class_ID, Pharoh_HP: 0}, {where: {Player_ID: victim.Player_ID}});
      if(victim.Pharoh_HP > 0){
        await models.Players.update({Kills: excorist.Kills + 1}, {where: {Player_ID: excorist.Player_ID}});
      }
      break;
    //if the player is a robot remove their extra Max HP
    case "Robot":
      await models.Players.update({Class_ID: avgClass.Class_ID, MAX_HP: victim.MAX_HP - 2}, {where: {Player_ID: victim.Player_ID}});
      break;
    //if the player is a minesweeper remove all of their mines
    case "Minesweeper":
      await models.Players.update({Class_ID: avgClass.Class_ID}, {where: {Player_ID: victim.Player_ID}});
      await models.Tiles.update({trapped: false, trapper: null}, {where: {trapper: victim.Player_ID}});
      break;
    //if the player is a medium and they haven't used their overrides take away their extra one
    case "Medium":
      if(victim.cCOverides >= 2){
        await models.Players.update({Class_ID: avgClass.Class_ID, cCOverides: victim.cCOverides - 1}, {where: {Player_ID: victim.Player_ID}});
      }
      break;
    //if the player is a glutton give them their lost 2 starting AP back
    case "Glutton":
      await models.Players.update({Class_ID: avgClass.Class_ID, Action_Points: victim.Action_Points + 2}, {where: {Player_ID: victim.Player_ID}});
      break;
    //if the player is a hoarder take away their extra starting AP and give them back their lost range
    case "Hoarder":
      await models.Players.update({Class_ID: avgClass.Class_ID, Action_Points: victim.Action_Points - 6, Range_: victim.Range_ + 1}, {where: {Player_ID: victim.Player_ID}});
      break;
    //if the player is a protagonist remove their extra starting AP and their extra potential/max stats and give them back their lost starting HP
    case "Protagonist":
      await models.Players.update({Class_ID: avgClass.Class_ID, Action_Points: victim.Action_Points - 4, Health_Points: victim.Health_Points + 2, MAX_AP: victim.MAX_AP - 4, MAX_HP: victim.MAX_HP - 4, MAX_RANGE: victim.MAX_RANGE - 4, MAX_DAMAGE: victim.MAX_DAMAGE - 2}, {where: {Player_ID: victim.Player_ID}});
      break;
    //elsewise just remove their class
    default:
      await models.Players.update({Class_ID: avgClass.Class_ID}, {where: {Player_ID: victim.Player_ID}});
      break;
  }
},



// generates a layer from a game while checking what a player can see
async  GenerateGameGridImage(gameId, databaseLayerID, playerID) {
  const tileSize = 208;
  logger150.trace({})
  const selectedLayer = await models.Layers.findByPk(layerDbId);
  logger150.debug({function: "GenerateGameGridImage"}, `selectedLayer:  + ${JSON.stringify(selectedLayer)} from database to generate`);
  const baseGridHeight = selectedLayer.Y_Bound;
  logger150.debug({function: "GenereateGameGridImage"}, `set baseGridHeight to ${baseGridHeight}`)
  const baseGridWidth = selectedLayer.X_Bound;
  logger150.debug({function: "GenereateGameGridImage"}, `set baseGridWidth to ${baseGridWidth}`)
  const canvasWidth = baseGridWidth * tileSize;
  const canvasHeight = baseGridHeight * tileSize;
  
  // Create canvas
  const canvas = Canvas.createCanvas(canvasWidth, canvasHeight);
  const context = canvas.getContext('2d');
  logger150.debug({function: "GenereateGameGridImage"}, `created canvas`)
  // Fill background
  context.fillStyle = '#222222';
  context.fillRect(0, 0, canvasWidth, canvasHeight);
  logger150.debug({function: "GenereateGameGridImage"}, `created canvas context`)
  // Get all tiles for this layer
  const layerTiles = await models.Tiles.findAll({where: {Layer_ID: layerDbId}});
  logger150.debug({function: "GenereateGameGridImage"}, `fetched the following tiles of the layer: ${JSON.stringify(layerTiles)}`)
  if(playerID != null) {
    const playerSeeing = await models.Players.findByPk(playerID);
    const playersTile = await models.Tiles.findByPk(playerSeeing.Tile_ID);
    trapSight = await models.Classes.findOne({
      where: {
        Class_Name: {
          [Op.or]: [
            "Oracle", "Minesweeper"
          ]
        },
        Class_ID: playerSeeing.Class_ID
      }}) != null ? true : false;
    allLayerSight = await models.Classes.findOne({
      where: {
        Class_Name: {
          [Op.or]: [
            "Oracle"
          ]
        },
        Class_ID: playerSeeing.Class_ID
      }}) != null ? true : false;
    //if a player is dead give them trapSight and allLayerSight
    if(playerSeeing.Dead) {
      allLayerSight = true;
      trapSight = true;
    }
    if(!allLayerSight) {
      if (layerDbId != playersTile.Layer_ID) {
        throw "You can only view the layer you are currently on, unless you are an oracle";
      }
    }
  }
  else {
    trapSight = true;
    allLayerSight = true;
  }

  // Process each tile
  for (const currentTile of layerTiles) {
    var tilePlayers = [];
    if(currentTile.Player1 != null || currentTile.Player2 != null || currentTile.Player3 != null || currentTile.Player4 != null) {
      // Get players on this tile
      tilePlayers = await Promise.all([
        await models.Players.findOne({where: {Player_ID: currentTile.Player1}}),
        await models.Players.findOne({where: {Player_ID: currentTile.Player2}}), 
        await models.Players.findOne({where: {Player_ID: currentTile.Player3}}), 
        await models.Players.findOne({where: {Player_ID: currentTile.Player4}})
      ]);
      logger150.debug({function: "GenerateGameGridImage"},"got players: " + JSON.stringify(tilePlayers) + " for tile: " + currentTile.Tile_ID);
    }


    // Load environment tile image
    const tileImage = await this.loadTileTexture("environment", currentTile.Tile_Type);
    
    // Calculate canvas position
    const canvasX = ((currentTile.X_Position - 1)* tileSize);
    const canvasY = ((currentTile.Y_Position - 1)* tileSize);
    const playerTileWidth = tileSize / 2;
    const playerTileHeight = tileSize / 2;

    // Draw the environment tile
    context.drawImage(tileImage, canvasX, canvasY, tileSize, tileSize);

    // Draw players
    for ( playerIndex in tilePlayers ) {
      const tilePlayer = tilePlayers[playerIndex];
      if (tilePlayer === null) continue;
      if(tilePlayer.Class_ID == (await models.Classes.findOne({where: {Class_Name: "Spy"}})).Class_ID && !allLayerSight) continue;
      const playerImage = await this.loadTileTexture("players", tilePlayer.Discord_ID + "_" + gameId);
      let playerTilePositionX = canvasX;
      let playerTilePositionY = canvasY;
      logger150.debug({function: "GenerateGameGridImage"}, "playerTileWidth: " + playerTileWidth + ", playerTileHeight: " + playerTileHeight);

      // Position players in quadrants
      switch (playerIndex) {
        case 0: // Top-left
          break;
        case 1: // Top-right
          playerTilePositionX += playerTileWidth;
          break;
        case 2: // Bottom-left
          playerTilePositionY += playerTileHeight;
          break;
        case 3: // Bottom-right
          playerTilePositionX += playerTileWidth;
          playerTilePositionY += playerTileHeight;
          break;
      }
      logger150.debug({function: "GenerateGameGridImage"}, "drawing player " + tilePlayer.Discord_ID + " at " + playerTilePositionX + ", " + playerTilePositionY)
      context.drawImage(
        playerImage,
        playerTilePositionX,
        playerTilePositionY,
        playerTileWidth,
        playerTileHeight
      );
    }

    // Draw mines if tile is trapped
    if (currentTile.trapped && (trapSight)) {
      const mineImage = await loadTileTexture("mines", "Mine");
      context.drawImage(mineImage, canvasX, canvasY, tileSize, tileSize);
    }
  }

  // CRITICAL: Return the canvas buffer!
  return canvas.toBuffer();
},

//adds a player to a game and downloads their playerIcon to be used for GenerateGameGridImagewithSight 
async  registerPlayer(gameId, playerId, playerIcon) {
    var game = await models.Games.findByPk(gameId);
    var SelectedClass = await this.getRandomClass(game);
    logger150.debug({function: "registerPlayer"},"selected class: " + JSON.stringify(SelectedClass));
    if(SelectedClass.Class_Name == "Twin"){
      var spawn1 = await this.getSpawnpointTile(gameId)
      var spawn2 = await this.getSpawnpointTile(gameId)
      var spawnSearchAttempts = 0
      while(spawn1.Tile_ID == spawn2.Tile_ID && spawnSearchAttempts < 20){ spawn2 = await this.getSpawnpointTile(gameId); spawnSearchAttempts++; }
      logger150.debug({function: "registerPlayer"},"Rolled same spawnpoint, spawn1: " + JSON.stringify(spawn1) + ", spawn2: " + JSON.stringify(spawn2));
      if(spawn1.Tile_ID == spawn2.Tile_ID) throw "Failed to generate spawnpoint for Twin, please try again so a new class may be selected for you.";
      await models.Players.create({
        Class_ID: SelectedClass.Class_ID,
        Game_ID: gameId,
        Action_Points: SelectedClass.Start_AP,
        MAX_AP: SelectedClass.Start_MAX_AP,
        MISSED_AP: 0,
        Health_Points: SelectedClass.Start_HP,
        MAX_HP: SelectedClass.Start_MAX_HP,
        Damage: SelectedClass.Start_Damage,
        MAX_DAMAGE: SelectedClass.Start_MAX_Damage,
        Range_: SelectedClass.Start_Range_,
        MAX_RANGE: SelectedClass.Start_MAX_Range_,
        Tile_ID: spawn1.Tile_ID,
        Discord_ID: playerId,
        Tile_ID2: spawn2.Tile_ID,
        Health_Points2: SelectedClass.Start_HP,
        Damage2: SelectedClass.Start_Damage,
        Range2: SelectedClass.Start_Range_,
      })
     var createdPlayer = await models.Players.findOne({where: {Game_ID: gameId, Discord_ID: playerId}});
      if(spawn1.Player1 == null) {
        await models.Tiles.update({Player1: createdPlayer.Player_ID}, {where: {Tile_ID: spawn1.Tile_ID}});
      }
      else if(spawn1.Player2 == null) {
        await models.Tiles.update({Player2: createdPlayer.Player_ID}, {where: {Tile_ID: spawn1.Tile_ID}});
      }
      else if(spawn1.Player3 == null) {
        await models.Tiles.update({Player3: createdPlayer.Player_ID}, {where: {Tile_ID: spawn1.Tile_ID}});
      }
      else if(spawn1.Player4 == null) {
        await models.Tiles.update({Player4: createdPlayer.Player_ID}, {where: {Tile_ID: spawn1.Tile_ID}});
      }
      if(spawn2.Player1 == null) {
        await models.Tiles.update({Player1: createdPlayer.Player_ID}, {where: {Tile_ID: spawn2.Tile_ID}});
      }
      else if(spawn2.Player2 == null) {
        await models.Tiles.update({Player2: createdPlayer.Player_ID}, {where: {Tile_ID: spawn2.Tile_ID}});
      }
      else if(spawn2.Player3 == null) {
        await models.Tiles.update({Player3: createdPlayer.Player_ID}, {where: {Tile_ID: spawn2.Tile_ID}});
      }
      else if(spawn2.Player4 == null) {
        await models.Tiles.update({Player4: createdPlayer.Player_ID}, {where: {Tile_ID: spawn2.Tile_ID}});
      }
      await this.downloadImageWithFetch(playerIcon.url, "./tiles/players/" + playerId + "_" + gameId + ".png");
      logger150.debug({function: "registerPlayer"}, "registered player to game: " + gameId + " with random class: Twin and spawning body 1 at tile: " + JSON.stringify(spawn1) + " and spawning body 2 at tile: " + JSON.stringify(spawn2));
      return;
    }
    var spawn = await this.getSpawnpointTile(gameId)
    await models.Players.create({
      Class_ID: SelectedClass.Class_ID,
      Game_ID: gameId,
      Action_Points: SelectedClass.Start_AP,
      MAX_AP: SelectedClass.Start_MAX_AP,
      MISSED_AP: 0,
      Health_Points: SelectedClass.Start_HP,
      MAX_HP: SelectedClass.Start_MAX_HP,
      Range_: SelectedClass.Start_Range_,
      MAX_RANGE: SelectedClass.Start_MAX_Range_,
      Damage: SelectedClass.Start_Damage,
      MAX_DAMAGE: SelectedClass.Start_MAX_Damage,
      Tile_ID: spawn.Tile_ID,
      Discord_ID: playerId,
    });
    var createdPlayer = await models.Players.findOne({where: {Game_ID: gameId, Discord_ID: playerId}});
    if(spawn.Player1 == null) {
      await models.Tiles.update({Player1: createdPlayer.Player_ID}, {where: {Tile_ID: spawn.Tile_ID}});
    }
    else if(spawn.Player2 == null) {
      await models.Tiles.update({Player2: createdPlayer.Player_ID}, {where: {Tile_ID: spawn.Tile_ID}});
    }
    else if(spawn.Player3 == null) {
      await models.Tiles.update({Player3: createdPlayer.Player_ID}, {where: {Tile_ID: spawn.Tile_ID}});
    }
    else if(spawn.Player4 == null) {
      await models.Tiles.update({Player4: createdPlayer.Player_ID}, {where: {Tile_ID: spawn.Tile_ID}});
    }
    else {
      throw "selected spawn tile is full somehow???";
    }
    
    await this.downloadImageWithFetch(playerIcon.url, "./tiles/players/" + playerId + ".png");
    logger150.debug({function: "registerPlayer"}, "registering player: " + playerId + " with random class: " + SelectedClass.Class_Name + " and spawning at tile: " + JSON.stringify(spawn) +  " for spawn");
    return;
},

async downloadImageWithFetch(url, filepath) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to download image: ${response.status}`);
    }
    
    const buffer = await response.arrayBuffer();
    fs.writeFileSync(filepath, Buffer.from(buffer));
},

async getUpgradePrice(stat, playerId, amount) {
  logger150.debug({function: "getUpgradePrice"}, "running getUpgradePrice with \n stat: " + stat + " playerId: " + playerId + " amount: " + amount);
  const player = await models.Players.findByPk(playerId);
  var initalCost = 0;
  var returnedCost = 0;
  switch(stat) {
    case "Health_Points":
      initalCost = player.HP_COST;
      break;
    case "Range_":
      initalCost = player.RANGE_COST;
      break;
    case "Damage":
      initalCost = player.DAMAGE_COST;
      break;
  }
  logger150.debug({function: "getUpgradePrice"}, "initalCost: " + initalCost);
  logger150.debug({function: "getUpgradePrice"}, "stat: " + stat);
  logger150.debug({function: "getUpgradePrice"}, "costs: " + player.RANGE_COST + "\n" + player.HP_COST + "\n" + player.DAMAGE_COST);
  // +1 Range (4 -> 5 -> 7 -> 10 AP)
// +1 HP (4 -> 5 -> 7 -> 10 AP)
// +1 Damage (12 -> 14 -> 16 AP)

    if(stat == "Range_" || stat == "Health_Points") {
      switch(initalCost) {
        case 4:
          returnedCost = this.getHPAndRangePriceScaled(amount);
          break;
        case 5:
          returnedCost = this.getHPAndRangePriceScaled(amount + 1) - 4;
          break;
        case 7:
          returnedCost = this.getHPAndRangePriceScaled(amount + 2) - (4 + 5);
          break;
        case 10:
          returnedCost = this.getHPAndRangePriceScaled(amount + 3) - (4 + 5 + 7);
          break;
        default:
          throw new Error("Incorrect initial range and/or health cost for player.\n Expected: 4, 5, 7, or 10\n Received: " + initalCost);
      }
    }

    if(initalCost == 12 && stat == "Damage") {
      switch(initalCost){
        case 12:
          returnedCost = getDamagePriceScaled(amount);
          break;
        case 14:
          returnedCost = getDamagePriceScaled(amount + 1) - 12;
          break;
        case 16:
          returnedCost = getDamagePriceScaled(amount + 2) - (12 + 14);
          break;
        default:
          throw new Error("Incorrect initial damage cost for player");
      }
    }
},

 getHPAndRangePriceScaled(amount) {
  switch(amount) {
    case 1:
        return 4;
    case 2:
        return 4 + 5;
    case 3:
        return 4 + 5 + 7;
    default:
      return 4 + 5 + 7 + (10 * amount - 3);
}
},

 getDamagePriceScaled(amount){
  switch(amount) {
    case 1:
        return 12;
    case 2:
        return 12 + 14;
    case 3:
        return 12 + 14 + 16;
    default:
      return 12 + 14 + 16 + (16 * amount - 3);
}
},



//turns a given tile into a its corresponding blank tile to preserve the checkerboard pattern
async  revertTileToBlank(startTile){

    if(startTile.X_Position + startTile.Y_Position % 2 == 0) {
      await models.Tiles.update({Tile_Type: "Blank1"}, {where: {Layer_ID: startTile.Layer_ID, X_Position: startTile.X_Position, Y_Position: startTile.Y_Position}});
     return;
    }
    else{
     await models.Tiles.update({Tile_Type: "Blank2"}, {where: {Layer_ID: startTile.Layer_ID, X_Position: startTile.X_Position, Y_Position: startTile.Y_Position}});
     return;
    }
},

async getRandomClass(game) {
  // Get a random class ID
  var randomClassID = this.getRandomInt(await models.Classes.count());
  var randomClass = await models.Classes.findByPk(randomClassID);
  logger150.debug({function: "getRandomClass"}, "rolled random class: " + randomClass.Class_Name);
  
  if (!game.classBlacklist) {
    game.classBlacklist = "";
  }
  
  // Find all players with this class
  const playersWithRolledClass = await models.Players.findAll({
    where: { Game_ID: game.Game_ID, Class_ID: randomClass.Class_ID }
  });
  
  // Check if we can use this class
  const isClassAvailable = 
    playersWithRolledClass.length < game.classDupelicateMax &&
    randomClass.Class_Name !== "Average" &&
    !game.classBlacklist.includes(randomClass.Class_Name);
  
  if (isClassAvailable) {
    return randomClass;  // Now this returns from the main function
  } else {
    logger150.debug({function: "getRandomClass"}, "class " + randomClass.Class_Name + " is not available, rerolling class...");
    return await this.getRandomClass(game);  // Properly await and return the recursive call
  }
},

 async getSpawnpointTile(gameId) {
  var layerIds = await models.Layers.findAll({
    where: {Game_ID: gameId}, 
    attributes: ["Layer_ID"]
  }).then(layerIds => layerIds.map(layerId => layerId.Layer_ID));
  
  logger150.debug({function: "getSpawnpointTile"}, "layerIds: " + JSON.stringify(layerIds));
  
  var possibleTiles = await models.Tiles.findAll({
    where: {
      Tile_Type: {[Op.notIn]: ["Void", "Fire", "Ice", "Storm", "Wall", "Wall_Damaged"]},
      Layer_ID: {[Op.in]: layerIds}  
    }
  });
  
  logger150.debug({function: "getSpawnpointTile"}, "possibleTiles: " + JSON.stringify(possibleTiles));
  var randomTile = possibleTiles[this.getRandomInt(possibleTiles.length - 1)];
  logger150.debug({function:"getSpawnpointTile"}, "rolled tile: " + JSON.stringify(randomTile) + " for a spawnpoint");
  var playersInTile = [randomTile.Player1, randomTile.Player2, randomTile.Player3, randomTile.Player4];
  if ( !playersInTile.includes(null) ) {
    logger150.debug({function: "getSpawnpointTile"}, "spawnpoint full, rerolling spawnpoint...");
    return await this.getSpawnpointTile(gameId);
  }
  else {
    return randomTile;
  };
},

//TODO MAKE SURE ALL INSTANCES OF A PLAYERS TILE BIENG SET WE ALSO SET A TILE.PLAYERX to THE PLAYERS ID
 delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
},

check(value, amount){
  switch(value){
    case "Health Points":
      break;
    case "MAX AP":
      break;
    case "":
      break;
    case "Action Points":
      break;
  }
},
//returns the rounded x and y cordinates of tiles found on a line if it was drown from tileCord1 to tileCord2
//tileCord1 and tileCord2 are arrays of [x, y]
//includes tileCord1 and tileCord2 in the returned array of tiles on the line
getTileCordinatesOfLine(tileCord1, tileCord2) {
  var returnedTiles = [tileCord1];
  var deltaX = tileCord2[0] - tileCord1[0];
  var deltaY = tileCord2[1] - tileCord1[1];
  var iteratorX = tileCord1[0];
  var iteratorY = tileCord1[1];
  var incrementX
  var incrementY
  var direction = this.getDirection(tileCord1, tileCord2)
  while([iteratorX, iteratorY] != tileCord2) {
    if(iteratorX == tileCord2[0] && iteratorY == tileCord2[1]) {
      logger150.debug({function: `getTileCordinatesOfLine`},`loop ran but the iterators are the same as the destination tile, exiting loop`)
      return returnedTiles;
    }
    switch (direction) {
      case "north":
        iteratorX = tileCord1[0];
        iteratorY--;
        logger150.debug({function:`getTileCordinatesOfLine`},`ran loop with direction: ${direction} and iterators: [${iteratorX},${iteratorY}]`)
        break;
      case "south":
        iteratorX = tileCord1[0];
        iteratorY++;
        logger150.debug({function:`getTileCordinatesOfLine`},`ran loop with direction: ${direction} and iterators: [${iteratorX},${iteratorY}]`)
        break;
      case "east": 
        iteratorX++;
        iteratorY = tileCord1[1] 
        logger150.debug({function:`getTileCordinatesOfLine`},`ran loop with direction: ${direction} and iterators: [${iteratorX},${iteratorY}]`)
        break;
      case "west": 
        iteratorX--;
        iteratorY = tileCord1[1]
        logger150.debug({function:`getTileCordinatesOfLine`},`ran loop with direction: ${direction} and iterators: [${iteratorX},${iteratorY}]`)
        break;
      case"northwest": 
      case "southwest": 
      case "southeast": 
      case "northeast":  
        if(Math.abs(deltaY) < Math.abs(deltaX)) {
          incrementX = Math.round(deltaX / Math.abs(deltaX));
          incrementY = Math.round(deltaY / Math.abs(deltaX));
          logger150.debug({function:`getTileCordinatesOfLine`},`ran loop with increments [${deltaX / Math.abs(deltaX)},${deltaY / Math.abs(deltaX)}]`)
          iteratorX += incrementX;
          iteratorY += incrementY; 
        }
        else {
          incrementX = Math.round(deltaX / Math.abs(deltaY));
          incrementY = Math.round(deltaY / Math.abs(deltaY));
          logger150.debug({function: `getTileCordinatesOfLine`},`ran loop with increments [${deltaX / Math.abs(deltaY)},${deltaY / Math.abs(deltaY)}]`)
          iteratorX += incrementX;
          iteratorY += incrementY;
        }
        deltaX = tileCord2[0] - iteratorX
        deltaY = tileCord2[1] - iteratorY
        logger150.debug({function:`getTileCordinatesOfLine`},`ran loop with direction: ${direction} and iterators: [${iteratorX},${iteratorY}]`)
        break;
      default:
        return returnedTiles
    }
    returnedTiles.push([iteratorX, iteratorY]);
  }
  return returnedTiles;
},

async getOldestGameId(playerDiscordID){
  if (playerDiscordID) {
    var playerGameID = await models.Players.findAll({where: {Discord_ID: playerDiscordID}, attributes: ["Game_ID"]});
    var games = await models.Games.findAll({where: {Game_ID: player}})
    var oldestGameId = games.length;
  for (var i = 0; i < games.length; i++) {
    //if a game id is lower its older so we swap it out
    if (games[i].Game_ID < oldestGameId) {
      oldestGameId = games[i].Game_ID;
    }
  }
  logger150.debug({function:"getOldestGameId"}, "found game id: "+ oldestGameId.toString())
  return oldestGameId;
  }
},

async  getOldestActiveGameId(playerDiscordID) {
  if (playerDiscordID) {
    logger150.debug({function: `getOldestActiveGameId`}, `game id was not inputted taking in player discord id: ${playerDiscordID}` +
       `and finding the oldest game they are in that is in gamestate: ACTIVE, TIMESTOPPED, or FINALE`)
    var players = await models.Players.findAll({where: {Discord_ID: playerDiscordID}, attributes: ["Game_ID"]});
  var games = await models.Games.findAll({where: {
    GAME_STATE: {
      [Op.or]: [GAMESTATES.ACTIVE, GAMESTATES.TIMESTOPPED, GAMESTATES.FINALE]
    },
    Game_ID: players}});
  }
  else {
    logger150.debug({function: `getOldestActiveGameId`}, `game id was not inputted, finding the oldest game they are in that is in gamestate: ACTIVE, TIMESTOPPED, or FINALE`)
    var games = await models.Games.findAll({where: {
      GAME_STATE: {
        [Op.or]: [GAMESTATES.ACTIVE, GAMESTATES.TIMESTOPPED, GAMESTATES.FINALE]
      }}});
  }
  logger150.debug({function: `getOldestActiveGameId`}, `found the following games: ${JSON.stringify(games)} determining which is the oldest via lowest Game_ID`)
  //set oldestGameId to newest Id
  var oldestGameId = games.length;
  for (var i = 0; i < games.length; i++) {
    //if a game id is lower its older so we swap it out
    if (games[i].Game_ID < oldestGameId) {
      logger150.debug({function: `getOldestActiveGameId`}, `Game_ID: ${games[i].Game_ID} is lower than ${oldestGameId} making it the newest oldest game id`)
      oldestGameId = games[i].Game_ID;
    }
  }
  logger150.debug({function: `getOldestActiveGameId`}, `oldest game was decided to have the id: ${oldestGameId}`)
  return oldestGameId;
},

//Pure gamestate gate. Decides whether the current gamestate blocks a normal
//command; never touches Discord. Player-facing wording for each reason lives
//in commands/_messages.js.
checkGameState(gamestate, isClockwatcher) {
  logger150.debug({function:"checkGameState"},  "gamestate: " + gamestate );
  switch(gamestate) {
    case GAMESTATES.OVER:
      return { blocked: true, reason: REJECTIONS.GAME_OVER };
    case GAMESTATES.DEV_PAUSED:
      return { blocked: true, reason: REJECTIONS.GAME_PAUSED };
    case GAMESTATES.TIMESTOPPED:
      if(!isClockwatcher){
        return { blocked: true, reason: REJECTIONS.TIME_STOPPED };
      }
      return { blocked: false };
    case GAMESTATES.REGISTRATION:
    case GAMESTATES.ACTIVE:
    case GAMESTATES.INACTIVE:
    case GAMESTATES.SANDBOX:
    case GAMESTATES.FINALE:
      return { blocked: false };
    default:
      logger150.debug({function:"checkGameState"}, 'threw an error because gamestate was: ' + gamestate );
      throw "Gamestate out of enum, gamestate: " + gamestate + "."
  }
},

//Transitional bridge with the old checkGameState behaviour: decide, reply,
//return a boolean. Commands not yet converted to the parse/run/present shape
//call this; each conversion replaces it with the pure checkGameState above,
//and the bridge is deleted once no callers remain.
async checkGameStateAndReply(gamestate, isClockwatcher, interaction) {
  let verdict;
  try {
    verdict = this.checkGameState(gamestate, isClockwatcher);
  } catch (err) {
    await interaction.editReply({ content: "Gamestate out of enum, gamestate: " + gamestate + "."});
    throw err;
  }
  if (!verdict.blocked) return false;
  const messages = {
    [REJECTIONS.GAME_OVER]: "Game is over! only the dev can use commands for this game at this time.\n Please register on a new game.",
    [REJECTIONS.GAME_PAUSED]: "Game is paused! only the dev can use commands for this game at this time.",
    [REJECTIONS.TIME_STOPPED]: "Time is stopped! only Clockwatchers can use commands at this time.",
  };
  await interaction.editReply({ content: messages[verdict.reason], ephemeral: true });
  return true;
},

async getOldestGameId(playerDiscordID) {
    if (playerDiscordID) {
    var gameIdsFromPlayer = await models.Players.findAll({where: {Discord_ID: playerDiscordID}, attributes: ["Game_ID"]}).then(gameIdsFromPlayer => gameIdsFromPlayer.map(gameIdFromPlayer => gameIdFromPlayer.Game_ID));
    //.then(layerIds => layerIds.map(layerId => layerId.Layer_ID))
    logger150.debug({function: "getOldestGameId"}, "Found Game Ids by Player:" + JSON.stringify(gameIdsFromPlayer));
    var games = await models.Games.findAll({where: {Game_ID: {[Op.in]: gameIdsFromPlayer}}});
    logger150.debug({function: "getOldestGameId"}, "Found Games by Player & Gamestate:" + JSON.stringify(games));
    var oldestGameId = games[games.length - 1].Game_ID + 1;
  for (var game in games) {
    //if a game id is lower its older so we swap it out
    if (games[game].Game_ID < oldestGameId) {
      oldestGameId = games[game].Game_ID;
    }
  }
  return oldestGameId;
  }
  else{
    throw "missing playerDiscordID";
  }
},

async  getOldestGamestateGameId(playerDiscordID, gamestate) {
  if (playerDiscordID) {
    var gameIdsFromPlayer = await models.Players.findAll({where: {Discord_ID: playerDiscordID}, attributes: ["Game_ID"]});
    var games = await models.Games.findAll({where: {
    GAME_STATE: gamestate,
    Game_ID: gameIdsFromPlayer}});
    logger150.debug({function: "getOldestGamestateGameId"}, "Found Games by Player & Gamestate:" + JSON.stringify(games));
  }
  else {
    var games = await models.Games.findAll({where: {
        GAME_STATE: gamestate
      }});
    logger150.debug({function: "getOldestGamestateGameId"}, "Found Games by Gamestate:" + JSON.stringify(games));
  }

  return games[games.length - 1].Game_ID;
},

async ChaosEventDeathCheck(gameId, killer, victim) {
  var game = await models.Games.findByPk(gameId);
  switch(game.CURR_CC_EVENT) {
    case "Leftovers":
      await models.Players.update({Action_Points: Math.min(killer.Action_Points + victim.MISSED_AP, killer.MAX_AP)}, {where: {Player_ID: killer.Player_ID}});
      break;
    case "Corpse Explosion":
      var playersToHurt = [] 
      var surroundingSquares = await this.getSurroundingTiles(victim.Player_ID, victim.Tile_ID)
      for (const tile of surroundingSquares) {
        if (tile == null) continue;
        playersToHurt.push(...await this.getAllPlayersOnTile(null, tile))
      }
      for (const player of playersToHurt) {
        if(player.Player_ID != victim.Player_ID){
          await models.Players.update({Health_Points: player.Health_Points - 1}, {where:{Player_ID: player.Player_ID}})
          await this.playerDeathLogic(killer,player)
        }
      }
  }
},

//returns the Players rows standing on the given tile, takes in either a tileID or a tile object
//returns an empty array when the tile cannot be found or is empty
async getAllPlayersOnTile(tileID, tile) {
  if(tileID != null) {
    tile = await models.Tiles.findByPk(tileID)
  }
  if(tile == null) {
    logger150.error({function: "getAllPlayersOnTile"}, "could not find tile")
    return []
  }
  var playerIdsOnTile = [tile.Player1, tile.Player2, tile.Player3, tile.Player4].filter((playerId) => playerId != null)
  if(playerIdsOnTile.length == 0) {
    return []
  }
  return await models.Players.findAll({where: {Player_ID: {[Op.in]: playerIdsOnTile}}})
},

//TODO Should be called whenever we change a players Tile_ID or a Tiles Player1,Player2,Player3, or Player4 will keep this in utils as chaos events will use it
async setPlayerToTile(playerId, layer, x, y) {
  var currentPlayer = await models.Players.findByPk(playerId)
  var currentTile = await models.Tiles.findByPk(currentPlayer.Tile_ID);
  await this.removePlayerFromTile(playerId, currentTile.Layer_ID, currentTile.X_Position, currentTile.Y_Position);
  const tile = await models.Tiles.findOne({where: {Layer_ID: layer, X_Position: x, Y_Position: y}});
  if(tile.Player1 == null) {
    tile.Player1 = playerId;
  }
  else if(tile.Player2 == null) {
    tile.Player2 = playerId;
  }
  else if(tile.Player3 == null) {
    tile.Player3 = playerId;
  }
  else if(tile.Player4 == null) {
    tile.Player4 = playerId;
  }
  else {
    throw "tile is full";
  }
  await tile.save();
  await models.Players.update({Tile_ID: tile.Tile_ID}, {where: {Player_ID: playerId}});
},

//takes in two players and checks if the second one is dead
//if so it updates the second players dead boolean, 
// takes them off the board, 
// and increases the first players kill count
//killer is nullable for cases where the environment killed the player, like a fire tile
async playerDeathLogic(killer, victim) {
  //get classes
  const killerClass = killer ? await models.Classes.findByPk(killer.Class_ID) : null;
  const victimClass = await models.Classes.findByPk(victim.Class_ID);
  //check if the victim is dead and there isnt a class with weird death logic involved
  if (victim.Health_Points <= 0 
    && victim.Pharoh_HP <= 0 
    && victimClass.Class_Name != "Twin" 
    && killerClass.Class_Name != "Hitman"
    && killerClass.Class_Name != "Cannibal"
    && killerClass.Class_Name != "Minesweeper"
    && killer != null) {
    //TODO ensure any changes to Tile_ID cascade to the tile itself aswell with either
    // a Tiles db call 
    // or a utils removePlayerFromTile call
    var victimTile = await models.Tiles.findByPk(victim.Tile_ID)
    await this.removePlayerFromTile(victim.Player_ID, victimTile.Layer_ID, victimTile.X_Position, victimTile.Y_Position)
    await models.Players.update({Tile_ID: null, Dead: true}, {where: {Player_ID: victim.Player_ID}});
    await this.ChaosEventDeathCheck(victim.Game_ID, killer, victim);
    await models.Players.update({Kills: killer.Kills + 1}, {where: {Player_ID: killer.Player_ID}});
    return
  }

  //Weird death case #0 if the victim goes to 0 hp but has some revive hp revive them on a random tile with their pharaoh hp as their health and reset their pharaoh hp
  //this still counts as a kill
  if(victim.Health_Points <= 0 && victim.Pharoh_HP > 0)
  {
    await models.Players.update({Tile_ID: (await this.getSpawnpointTile(victim.Game_ID)).Tile_ID, Health_Points: victim.Pharoh_HP, Pharoh_HP: 0}, {where: {Player_ID: victim.Player_ID}});
    await models.Players.update({Kills: killer.Kills + 1}, {where: {Player_ID: killer.Player_ID}});
    await this.ChaosEventDeathCheck(victim.Game_ID, killer, victim);
    return
  }

  //Weird death case #1 twins have two bodies and both have to be dead in order for the player to die      
  //We need to make sure to remove both twins tiles and only one if only 1 twin dies
  //WARN: ONLY HANDLES THE VICTIM SIDE OF THE DEATH
  if(victimClass.Class_Name == "Twin"){
    //Both twins are at 0 hp and the player doesnt have any pharoh hp so run the normal death logic and remove both twins tiles
    if(victim.Health_Points <= 0 
      && victim.Health_Points2 <= 0 
      && victim.Pharoh_HP <= 0 )
    {
      await models.Players.update({Dead: true}, {where: {Player_ID: victim.Player_ID}});
      await models.Players.update({Tile_ID: null}, {where: {Player_ID: victim.Player_ID}});
      await models.Players.update({Tile_ID2: null}, {where: {Player_ID: victim.Player_ID}});
    }
    //Both twins are at 0 hp but the player has some pharaoh hp so revive them on a random tile with their pharaoh hp as their health and reset their pharaoh hp
    if(victim.Health_Points <= 0 
      && victim.Health_Points2 <= 0 
      && victim.Pharoh_HP > 0 )
    {
      await models.Players.update({Tile_ID: (await this.getSpawnpointTile(victim.Game_ID)).Tile_ID, Health_Points: victim.Pharoh_HP, Pharoh_HP: 0}, {where: {Player_ID: victim.Player_ID}});
    }
    //One twin is at 0 hp but the player has some pharaoh hp so revive the dead clone on a random tile with their pharaoh hp as their health and reset their pharaoh hp
    if(victim.Health_Points <= 0 && victim.Health_Points2 > 0 && victim.Pharoh_HP > 0)
    {
      await models.Players.update({Tile_ID2: (await this.getSpawnpointTile(victim.Game_ID)).Tile_ID, Health_Points2: victim.Pharoh_HP, Pharoh_HP: 0}, {where: {Player_ID: victim.Player_ID}});
    }
    if(victim.Health_Points > 0 && victim.Health_Points2 <= 0 && victim.Pharoh_HP > 0)
    {
      await models.Players.update({Tile_ID: (await this.getSpawnpointTile(victim.Game_ID)).Tile_ID, Health_Points: victim.Pharoh_HP, Pharoh_HP: 0}, {where: {Player_ID: victim.Player_ID}});
    }
    //One twin is at 0 hp so kill it but dont mark the player as dead
    if(victim.Health_Points <= 0 && victim.Health_Points2 > 0){
      await models.Players.update({Tile_ID2: null}, {where: {Player_ID: victim.Player_ID}});
    }
    if(victim.Health_Points > 0 && victim.Health_Points2 <= 0){
      await models.Players.update({Tile_ID: null}, {where: {Player_ID: victim.Player_ID}});
    }
  }
  //kill the victim if they have 0 hp arent a twin and dont have pharaoh hp
  else if(victim.Health_Points <= 0){
      await models.Players.update({Dead: true}, {where: {Player_ID: victim.Player_ID}});
      await models.Players.update({Tile_ID: null}, {where: {Player_ID: victim.Player_ID}});
  }

  if(victim.Health_Points <= 0){
    switch(killerClass.Class_Name){
      //Weird death case #2 hitman gets 4AP for every killed target, do normal death logic but also update the hitman's AP
      case "Hitman":
        if(killer.Hitman_Target == victim.Player_ID ){
          await models.Players.update({Kills: killer.Kills + 1, Action_Points: killer.Action_Points + 4}, {where: {Player_ID: killer.Player_ID}});
          await this.ChaosEventDeathCheck(victim.Game_ID, killer, victim);
          return
        }
        else if(victim.Health_Points <= 0){
          await models.Players.update({Kills: killer.Kills + 1}, {where: {Player_ID: killer.Player_ID}});
          await this.ChaosEventDeathCheck(victim.Game_ID, killer, victim);
          return
        }
        break;
      //Weird death case #3 cannibal gets 1AP for every kill, 6AP if the victim has max ap, do normal death logic but also update the cannibal's AP
      case "Cannibal":
        if(victim.Action_Points == victim.MAX_AP){
          await models.Players.update({Kills: killer.Kills + 1, Action_Points: killer.Action_Points + 6}, {where: {Player_ID: killer.Player_ID}});
          await this.ChaosEventDeathCheck(victim.Game_ID, killer, victim);
          return
        }else {
          await models.Players.update({Kills: killer.Kills + 1, Action_Points: killer.Action_Points + 1}, {where: {Player_ID: killer.Player_ID}});
          await this.ChaosEventDeathCheck(victim.Game_ID, killer, victim);
          return
        }
      //Weird death case #4 minesweeper needs their mines destroyed, do normal death logic but also destroy their mines
        case "Minesweeper":
          await models.Players.update({Kills: killer.Kills + 1}, {where: {Player_ID: killer.Player_ID}});
          await models.Tiles.update({trapped: false, trapper: null}, {where: {trapper: victim.Player_ID}});
          await this.ChaosEventDeathCheck(victim.Game_ID, killer, victim);
          return;
      default:
        //Should only run if there is no killer
        return;
    }
  }
},

//accepts either a player or a tile
//returns an array of tiles index in the following order
// 0: the tile itself, 1: the tile below it
// then going clockwise with 8 bieng the tile to the bottom right
//includes diagonals
async getSurroundingTiles(playerId, tileId) {
  var player = await models.Players.findByPk(playerId);
  var tile = tileId ? await models.Tiles.findByPk(tileId) : await models.Tiles.findByPk(player.Tile_ID)
  var surroundingTiles = [];
  surroundingTiles.push(tile);
  surroundingTiles.push(await models.Tiles.findOne({where: {Layer_ID: tile.Layer_ID, X_Position: tile.X_Position, Y_Position: tile.Y_Position + 1}}));
  surroundingTiles.push(await models.Tiles.findOne({where: {Layer_ID: tile.Layer_ID, X_Position: tile.X_Position - 1, Y_Position: tile.Y_Position + 1}}));
  surroundingTiles.push(await models.Tiles.findOne({where: {Layer_ID: tile.Layer_ID, X_Position: tile.X_Position - 1, Y_Position: tile.Y_Position}}));
  surroundingTiles.push(await models.Tiles.findOne({where: {Layer_ID: tile.Layer_ID, X_Position: tile.X_Position - 1, Y_Position: tile.Y_Position - 1}}));
  surroundingTiles.push(await models.Tiles.findOne({where: {Layer_ID: tile.Layer_ID, X_Position: tile.X_Position, Y_Position: tile.Y_Position - 1}}));
  surroundingTiles.push(await models.Tiles.findOne({where: {Layer_ID: tile.Layer_ID, X_Position: tile.X_Position + 1, Y_Position: tile.Y_Position - 1}}));
  surroundingTiles.push(await models.Tiles.findOne({where: {Layer_ID: tile.Layer_ID, X_Position: tile.X_Position + 1, Y_Position: tile.Y_Position}}));
  surroundingTiles.push(await models.Tiles.findOne({where: {Layer_ID: tile.Layer_ID, X_Position: tile.X_Position + 1, Y_Position: tile.Y_Position + 1}}));
  return surroundingTiles
},

//accepts either a player or a tile
//returns an array of tiles index in the following order
// 0: the tile itself, 1: the tile below it
// then going clockwise with 4 bieng the tile to the right
async getSurroundingOrthoginalTiles(playerId, tileId) {
  var player = await models.Players.findByPk(playerId);
  var tile = tileId ? await models.Tiles.findByPk(tileId) : await models.Tiles.findByPk(player.Tile_ID)
  var surroundingTiles = [];
  surroundingTiles.push(tile);
  surroundingTiles.push(await models.Tiles.findOne({where: {Layer_ID: tile.Layer_ID, X_Position: tile.X_Position, Y_Position: tile.Y_Position + 1}}));
  surroundingTiles.push(await models.Tiles.findOne({where: {Layer_ID: tile.Layer_ID, X_Position: tile.X_Position + 1, Y_Position: tile.Y_Position}}));
  surroundingTiles.push(await models.Tiles.findOne({where: {Layer_ID: tile.Layer_ID, X_Position: tile.X_Position, Y_Position: tile.Y_Position - 1}}));
  surroundingTiles.push(await models.Tiles.findOne({where: {Layer_ID: tile.Layer_ID, X_Position: tile.X_Position - 1, Y_Position: tile.Y_Position}}));
  return surroundingTiles
},

//gets the direction one would go in if they started at point1 facing point 2 and walked forwards
getDirection(point1, point2) {
  var xDiff = point1[0] - point2[0];
  var yDiff = point1[1] - point2[1];
  var returnedDirection = "";
  switch (true) {
    //y1 = y2
    case yDiff === 0:
      returnedDirection += ""
      switch (true) {
        // x1 = x2
        case xDiff === 0:
          logger150.error({function: "getDirection"}, "Same points, no direction");
          return null;
        // x1 > x2
        case (xDiff > 0):
          returnedDirection += "west";
          return returnedDirection;
        // x1 < x2
        case (xDiff < 0):
          returnedDirection += "east";
          return returnedDirection;
      }
      break;
    //y1 > y2
    case (yDiff > 0):
      returnedDirection += "north";
      switch (true) {
        // x1 = x2
        case xDiff === 0:
          return returnedDirection;
        // x1 > x2
        case (xDiff > 0):
          returnedDirection += "west";
          return returnedDirection;
        // x1 < x2
        case (xDiff < 0):
          returnedDirection += "east";
          return returnedDirection;
      }
      return returnedDirection
      break;
    //y1 < y2
    case (yDiff < 0):
      returnedDirection += "south";
      switch (true) {
        // x1 = x2
        case xDiff === 0:
          return returnedDirection;
        // x1 > x2
        case (xDiff > 0):
          returnedDirection += "west";
          return returnedDirection;
        // x1 < x2
        case (xDiff < 0):
          returnedDirection += "east";
          return returnedDirection;
      }
      return returnedDirection
      break;
  }
},

async  removePlayerFromTile(playerId, layer, x, y) {
  const tile = await models.Tiles.findOne({where: {Layer_ID: layer, X_Position: x, Y_Position: y}});
  if(tile.Player1 == playerId) {
    tile.Player1 = null;
  }
  if(tile.Player2 == playerId) {
    tile.Player2 = null;
  }
  if(tile.Player3 == playerId) {
    tile.Player3 = null;
  }
  if(tile.Player4 == playerId) {
    tile.Player4 = null;
  }
  await tile.save();
},

 getRandomInt(max) {
  return Math.round(Math.random() * max);
},

//returns a string if any special case happens
//otherwise returns nothing
async hotPotatoSwap(player1, player2, player1Username, player2Username) {
  const newClass = await models.Classes.findByPk(player2.Class_ID);
  
  switch(newClass.Class_Name) {
    case "Twin":
      await models.Players.update({Tile_ID2: player2.Tile_ID, Health_Points2: player2.Health_Points2, Damage2: player2.Damage2, Range2: player2.Range2}, {where: {Player_ID: player1.Player_ID}});
      await models.Players.update({Tile_ID2: null, Health_Points2: null, Damage2: null, Range2: null}, {where: {Player_ID: player2.Player_ID}});
      return "" + player1Username + " took " + player2Username + "'s twin body!";
    case "Hitman":
      await models.Players.update({Hitman_Target: player2.Hitman_Target}, {where: {Player_ID: player1.Player_ID}});
      await models.Players.update({Hitman_Target: null}, {where: {Player_ID: player2.Player_ID}});
      return "" + player1Username + " took " + player2Username + "'s target!";
    case "Protagonist":
      await models.Players.update({MAX_AP: player1.MAX_AP + 4, MAX_HP: player1.MAX_HP + 4, MAX_RANGE: player1.MAX_RANGE + 4, MAX_DAMAGE: player1.MAX_DAMAGE + 3}, {where: {Player_ID: player1.Player_ID}});
      await models.Players.update({MAX_AP: player2.MAX_AP - 4, MAX_HP: player2.MAX_HP - 4, MAX_RANGE: player2.MAX_RANGE - 4, MAX_DAMAGE: player2.MAX_DAMAGE - 3}, {where: {Player_ID: player2.Player_ID}});
      return "" + player1Username + " took " + player2Username + "'s potentional!";
    case "Glutton":
      await models.Players.update({MAX_AP: player1.MAX_AP - 2, MAX_HP: player1.MAX_HP - 2, MAX_RANGE: player1.MAX_RANGE - 2, MAX_DAMAGE: player1.MAX_DAMAGE - 1}, {where: {Player_ID: player1.Player_ID}});
      await models.Players.update({MAX_AP: player2.MAX_AP + 2, MAX_HP: player2.MAX_HP + 2, MAX_RANGE: player2.MAX_RANGE + 2, MAX_DAMAGE: player2.MAX_DAMAGE + 1}, {where: {Player_ID: player2.Player_ID}});
      return "" + player1Username + " took " + player2Username + "'s sloth & greed!";
    case "Robot":
      await models.Players.update({MAX_HP: player1.MAX_HP + 2}, {where: {Player_ID: player1.Player_ID}});
      await models.Players.update({MAX_HP: player2.MAX_HP - 2}, {where: {Player_ID: player2.Player_ID}});
      return "" + player1Username + " took " + player2Username + "'s robust robot body!";
    case "Cannibal":
      await models.Players.update({MAX_AP: player1.MAX_AP - 2}, {where: {Player_ID: player1.Player_ID}});
      await models.Players.update({MAX_AP: player2.MAX_AP + 2}, {where: {Player_ID: player2.Player_ID}});
      return "" + player1Username + " took " + player2Username + "'s cannibalism!";
    default:
      break;
  }

}
}
