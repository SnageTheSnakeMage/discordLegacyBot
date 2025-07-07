// utils.js - Shared utility functions


  //#region BOILERPLATE
const Canvas = require('canvas');
const path = require('path');
const verbose = true;
const initModels = require("G:/LegacyBotDiscord/Decluttered Attempt 1/database/Models/init-models.js");
const { Sequelize, where, Op } = require('sequelize');
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: 'G:/LegacyBotDiscord/Decluttered Attempt 1/database/database'
});
const fs = require('fs');
var models = initModels(sequelize);
var GAMESTATES = require('G:/LegacyBotDiscord/Decluttered Attempt 1/enums.js').GAMESTATES;
//#endregion BOILERPLATE
module.exports = {
  models,
  GAMESTATES,
// Function to load a tile texture

timeCheck(client){
  //TODO
  //start apcheckinterval for each active game
  models.Games.findAll({where: {GAME_STATE: {[Op.or]: [GAMESTATES.ACTIVE, GAMESTATES.TIMESTOPPED, GAMESTATES.FINALE ]}}}).then((games) => {
    games.forEach((game) => {
      this.startAPCheckInterval(game);
    })
  })
  //chaos council polls for all active games
},

buildChaosCouncilPoll(lastEvent){
  //TODO
  //this should build a poll with 3 options
  //2 randomly rolled events
  //& the current event
  //the bot should vote for the last option to set it as default
  //the bot should end the poll early if ap is distributed
  //if an override is used the bot should use that result instead of the poll result
},

 startAPCheckInterval(game){
  //every 30 seconds check if AP needs to be distributed if your behind distribute it multiple times for each interval you are behind on
  setInterval( async() => {
    //how often AP is distributed for the game in milliseconds
    var apInterval = game.AP_INTERVAL_MIN * 60000
    //how long it has been since the last AP distribution in milliseconds
    var lastDistrib = game.lastAPDistributionTimestampInMS - Date.now();

    if(lastDistrib < apInterval){
      //amount of times ap should have been distributed
      var times = Math.floor(lastDistrib / apInterval);
      await this.distributeAP(game, times);
      game.lastAPDistributionTimestampInMS = Date.now();
    }

  }, 30000)
},

async distributeAP(game, times){
  lavaDiverClass = await models.Classes.findOne({where: {Class_Name: "Lava Diver"}});
  //get all alive players in the game and give them as much AP as the game gives per interval multiplied by times
  await models.Players.findAll({where: {Game_ID: game.Game_ID}}).then((players) => {
    players.forEach((player) => {
      models.Players.update({AP: player.AP + game.APAmount * times}, {where: {Game_ID: game.Game_ID, Player_ID: player.Player_ID}});
    });
  });
  //also damage any players that are on the same tile as a lava diver and arent lava divers themselves
  //first get all the lava divers
  models.Players.findAll({where: {Game_ID: game.Game_ID, Class_ID: lavaDiverClass.Class_ID}}).then((allLavaDivers) => {
    //then get all the players on the same tile as a lava diver
    for(diver in allLavaDivers){
      models.Tiles.findAll({where: {Game_ID: game.Game_ID, Layer_ID: allLavaDivers[diver].Layer_ID, X: allLavaDivers[diver].X, Y: allLavaDivers[diver].Y}}).then((tiles) => {
        tiles.forEach((tile) => {
          //then damage all the non lava diver players on the same tile
          models.Players.findAll({where: {Game_ID: game.Game_ID, Tile_ID: tile.Tile_ID, Class_ID: { [Op.ne]: lavaDiverClass.Class_ID }}}).then((players) => {
            players.forEach((player) => {
                models.Players.update({Health_Points: player.Health_Points - 1}, {where: {Game_ID: game.Game_ID, Player_ID: player.Player_ID}});
            });
          });
        });
      });
    }
  })
  //TODO implement: tick down immutables countdown
  //TODO implement: tick down clockwatcher timestop if the game is timestopped
  //TODO implement: give AP to gluttons again
  //TODO implement: give chefs their cook uses
},

async loadTileTexture(layer, textureName) {
  // Create a unique key for the cache
  const cacheKey = `${textureName}`;
  
  // Check if tile is already cached
  if (global.tileCache[cacheKey]) {
    return global.tileCache[cacheKey];
  }

  if(textureName == null) {
    if(verbose) console.log("[INFO][VERBOSE] No texture name provided, using transparent texture.");
    textureName = 'transparent';
  }

  // Path to tile textures folder (organized by layer)
  const tilePath =  "G:/LegacyBotDiscord/Decluttered Attempt 1/tiles/" + layer + "/" + textureName + ".png";
  console.log("[INFO][VERBOSE] Loading tile texture:", tilePath);
  
  try {
    // Load the image
    const image = await Canvas.loadImage(tilePath);
    // Cache the texture
    global.tileCache[cacheKey] = image;
    
    return image;
  } catch (error) {
    console.error(`[ERROR][VERBOSE] Utils.loadTileTexture: Failed to load tile texture ${textureName}:`, error);
    // Return a default texture or placeholder for the appropriate layer  
    const defaultTile = await Canvas.loadImage("G:/LegacyBotDiscord/Decluttered Attempt 1/tiles/" + layer + "/default.png");
    return defaultTile;
  }
},

//turns the string into a proper path array
//[[direction, distance]]
//direction: left, right, up, down, nw, ne, sw, se
//distance: number
 inputPathToArray(inputPath){
  return inputPath.split(';').map(row => row.split(','));
},

async  verifyinputPath(inputPath, layer, startingTileX, startingTileY){
  regex =  /^((?:left|right|up|down|ne|nw|se|sw),\d+;)+$/;
  result = regex.test(inputPath);

  if(result){
    path = inputPathToArray(inputPath);
    var destination = [startingTileX, startingTileY];
    for (run in path){
      switch(path[run][0]){
        case "left":
          destination = [startingTileX - parseInt(path[run][1]), startingTileY];
          break;
        case "right":
          destination = [startingTileX + parseInt(path[run][1]), startingTileY];
          break;
        case "up":
          destination = [startingTileX, startingTileY - parseInt(path[run][1])];
          break;
        case "down":
          destination = [startingTileX, startingTileY + parseInt(path[run][1])];
          break;
        case "nw":
          destination = [startingTileX - parseInt(path[run][1]), startingTileY - parseInt(path[run][1])];
          break;
        case "ne":
          destination = [startingTileX + parseInt(path[run][1]), startingTileY - parseInt(path[run][1])];
          break;
        case "sw":
          destination = [startingTileX - parseInt(path[run][1]), startingTileY + parseInt(path[run][1])];
          break;
        case "se":
          destination = [startingTileX + parseInt(path[run][1]), startingTileY + parseInt(path[run][1])];
          break;
        default:
          throw "Invalid input path, your are using a direction that isnt: left,right,up,down,nw,ne,sw, or se";
      }
    }
  await models.Layers.findByPk(layer).then((curLayer) => {
    if(curLayer.X_Bound < destination[0] || curLayer.Y_Bound < destination[1]) result = false;
   })
  }
  if(!result){
    throw "Invalid input path, make sure your path uses a direction(left,right,up,down,nw,ne,sw,se) then a comma(,) and a number within the bounds of the layer separated & ended by a semicolon(;). Also make sure it doesnt take you off the layer you are currently on.";
  }
  return true;
},

//adds an inital move to the path array
//initialMoveDirection = left, right, up, down, nw, ne, sw, se
//initialMoveDistance = number
//pathArray = return of inputPathToArray
//returns an array of directions and distances
 addStartToPathArray(initalMoveDirection, initalMoveDistance, pathArray){
  switch (initalMoveDirection) {
    case "ne":
      initalMoveDirection = "northeast";
      break;
    case "nw":
      initalMoveDirection = "northwest";
      break;
    case "se":
      initalMoveDirection = "southeast";
      break;
    case "sw":
      initalMoveDirection = "southwest";
      break;
    case "left":
      initalMoveDirection = "west";
      break;
    case "right":
      initalMoveDirection = "east";
      break;
    case "up":
      initalMoveDirection = "north";
      break;
    case "down":
      initalMoveDirection = "south";
      break;
    default:
      throw "Invalid inital movement direction cannot parse into complete path array";
  }
  pathArray.unshift([initalMoveDirection, initalMoveDistance]);
  return pathArray;
},

async  commandResolutionErrorThrower() {
  delay(850000);
  throw "Command Resolution Error";
},


//turns a layer id that would be known to a player for a game into the actual layer's id in the database
async commonLayerIDtoDbLayerID(gameId, inputtedLayerID){
    var gridID = await models.Grids.findOne({where: {Game_ID: gameId}}).Grid_ID
    var layersInGrid = await models.Layers.findAll({where: {Grid_ID: gridID}})
    return layersInGrid[inputtedLayerID-1]
},

//removes a class from a player
//is a function due to weird edge cases
async classRemoval(player, excorist){
  //if the player is a twin and we are removing their class get rid of their second body and give the exorcist a kill
  var playerClass = await models.Players.findByPk(player.Class_ID)
  var avgClass = await models.Classes.findOne({where: {Class_Name: "Average"}})
  switch(playerClass.Class_Name){
    case "Twin":
      await models.Players.update({Class_ID: avgClass.Class_ID, Health_Points2: 0, Damage2: 0, Tile_ID2: null, Free_Move2: 0, Range2: 0}, {where: {Player_ID: player.Player_ID}});
      await models.Players.update({Kills: excorist.Kills + 1}, {where: {Player_ID: excorist.Player_ID}});
      break;
    case "Cloudborn":
      //get the players current tile
      var playerTile = await models.Tiles.findByPk(player.Tile_ID)
      //remove class
      await models.Players.update({Class_ID: avgClass.Class_ID}, {where: {Player_ID: player.Player_ID}});
      //move player onto a surrounding tile if they are on an ice, void, or wall tile
      if(playerTile.Tile_Type == "Ice" || playerTile.Tile_Type == "Void" || playerTile.Tile_Type == "Wall" || playerTile.Tile_Type == "Wall_Damaged"){
        this.movePlayerToRandomSurroundingTile(player.Player_ID, playerTile.Layer_ID, playerTile.X_Position, playerTile.Y_Position);
      }
    case "Hitman":
      await models.Players.update({Class_ID: avgClass.Class_ID, Hitman_Target: null}, {where: {Player_ID: player.Player_ID}});
      break;
    case "Pharaoh":
      await models.Players.update({Class_ID: avgClass.Class_ID, PharaohHP: 0}, {where: {Player_ID: player.Player_ID}});
      break;
    case "Robot":
      await models.Players.update({Class_ID: avgClass.Class_ID, MAX_HP: player.MAX_HP - 2}, {where: {Player_ID: player.Player_ID}});
      break;
    case "Minesweeper":
      await models.Players.update({Class_ID: avgClass.Class_ID}, {where: {Player_ID: player.Player_Id}});
      await models.Tiles.update({trapped: false, trapper: null}, {where: {trapper: player.Player_ID}});
      break;
    case "Medium":
      if(player.ccOverrides >= 2){
        await models.Players.update({Class_ID: avgClass.Class_ID, ccOverrides: player.ccOverrides - 1}, {where: {Player_ID: player.Player_Id}});
      }
      break;
    case "Glutton":
      await models.Players.update({Class_ID: avgClass.Class_ID, Action_Points: player.Action_Points + 2}, {where: {Player_ID: player.Player_Id}});
      break;
    case "Hoarder":
      await models.Players.update({Class_ID: avgClass.Class_ID, Action_Points: player.Action_Points - 6, Range_: player.Range_ + 1}, {where: {Player_ID: player.Player_Id}});
      break;
    case "Protagonist":
      await models.Players.update({Class_ID: avgClass.Class_ID, Action_Points: player.Action_Points - 4, Health_Points: player.Health_Points + 2, MAX_AP: player.MAX_AP - 4, MAX_HP: player.MAX_HP - 4, Range_: player.Range_ - 4, Damage: player.Damage - 2}, {where: {Player_ID: player.Player_Id}});
      break;
    default:
      await models.Players.update({Class_ID: avgClass.Class_ID}, {where: {Player_ID: player.Player_Id}});
      break;
  }
},

async  dbLayerIDtoCommonLayerID(game, dbLayerID){ 
  var gridID = await models.Grids.findOne({where: {Game_ID: game}}).Grid_ID
  var layersInGrid = await models.Layers.findAll({where: {Grid_ID: gridID}})
  return layersInGrid.indexOf(dbLayerID)+1
  
},

// generates a layer from a game while checking what a player can see
async  GenerateGameGridImage(gameId, inputtedlayerID, playerID) {
  const tileSize = 208;

  // Get layer dimensions
  const layerData = commonLayerIDtoDbLayerID(gameId, inputtedlayerID);
  const baseGridHeight = layerData.Y_Bound;
  const baseGridWidth = layerData.X_Bound;
  
  const canvasWidth = baseGridWidth * tileSize;
  const canvasHeight = baseGridHeight * tileSize;
  
  // Create canvas
  const canvas = Canvas.createCanvas(canvasWidth, canvasHeight);
  const context = canvas.getContext('2d');
  
  // Fill background
  context.fillStyle = '#222222';
  context.fillRect(0, 0, canvasWidth, canvasHeight);

  // Get all tiles for this layer
  const layerTiles = await models.Tiles.findAll({where: {Layer_ID: layer}});

  if(playerID != null) {
    const player = await models.Players.findByPk(playerID);
    const playersTile = await models.Tiles.findByPk(player.Tile_ID);
    trapSight = await models.Classes.findOne({
      where: {
        Class_Name: {
          [Op.or]: [
            "Oracle", "Minesweeper"
          ]
        },
        Class_ID: player.Class_ID
      }}) != null ? true : false;
    allLayerSight = await models.Classes.findOne({
      where: {
        Class_Name: {
          [Op.or]: [
            "Oracle"
          ]
        },
        Class_ID: player.Class_ID
      }}) != null ? true : false;
    //if a player is dead give them trapSight and allLayerSight
    if(player.Dead) {
      allLayerSight = true;
      trapSight = true;
    }
    if(!allLayerSight) {
      if (inputtedlayerID != playersTile.Layer_ID) {
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
    // Get players on this tile
    const tilePlayers = await Promise.all([
      models.Tiles.findOne({where: {Player_ID: currentTile.Player1}}),
      models.Tiles.findOne({where: {Player_ID: currentTile.Player2}}), 
      models.Tiles.findOne({where: {Player_ID: currentTile.Player3}}), 
      models.Tiles.findOne({where: {Player_ID: currentTile.Player4}})
    ]);

    // Load environment tile image
    const tileImage = await loadTileTexture("environment", currentTile.Tile_Type);
    
    // Calculate canvas position
    const canvasX = ((currentTile.X_Position - 1)* tileSize);
    const canvasY = ((currentTile.Y_Position - 1)* tileSize);
    const playerTileWidth = tileSize / 2;
    const playerTileHeight = tileSize / 2;

    // Draw the environment tile
    context.drawImage(tileImage, canvasX, canvasY, tileSize, tileSize);

    // Draw players
    for (let playerIndex = 0; playerIndex < tilePlayers.length; playerIndex++) {
      const player = tilePlayers[playerIndex];
      if (player === null) continue;
      if(player.Class_ID == await models.Classes.findOne({where: {Class_Name: "Spy"}}).Class_ID && !allLayerSight) continue;

      const playerImage = await loadTileTexture("players", player.Discord_ID);
      let playerTilePositionX = canvasX;
      let playerTilePositionY = canvasY;

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

      context.drawImage(
        playerImage,
        playerTilePositionX,
        playerTilePositionY,
        playerTileWidth,
        playerTileHeight
      );
    }

    // Draw mines if tile is trapped
    if (currentTile.trapped && player.Class_ID == 22) {
      const mineImage = await loadTileTexture("mines", "Mine");
      context.drawImage(mineImage, canvasX, canvasY, tileSize, tileSize);
    }
  }

  // CRITICAL: Return the canvas buffer!
  return canvas.toBuffer();
},

//adds a player to a game and downloads their playerIcon to be used for GenerateGameGridImagewithSight 
async  registerPlayer(game, playerId, playerIcon) {
    if(await models.Players.count({where: {Discord_ID: playerId}}) > 0) return;
    var SelectedClass = getRandomClass(game);
    var spawn = getSpawnpointTile(game)
    this.setPlayerToTile(player, spawn);
    const player = models.Players.create({
      Class_ID: SelectedClass.Class_ID,
      Game_ID: game,
      Action_Points: SelectedClass.Start_AP,
      MAX_AP: SelectedClass.Start_MAX_AP,
      MISSED_AP: 0,
      Health_Points: SelectedClass.Start_HP,
      MAX_HP: SelectedClass.Start_MAX_HP,
      Range_: SelectedClass.Start_Range_,
      MAX_RANGE: SelectedClass.Start_MAX_Range,
      Damage: SelectedClass.Start_Damage,
      MAX_DAMAGE: SelectedClass.Start_MAX_Damage,
      Tile_ID: spawn.Tile_ID,
      Discord_ID: playerId,
      Trapped: false
    });
     fs.writeFileSync("G:/LegacyBotDiscord/Decluttered Attempt 1/tiles/players/" + playerId + ".png", playerIcon);
    console.log("[INFO] registering player: " + playerId + " with random class: " + SelectedClass.Class_Name + " and spawning at tile: " + spawn +  " for spawn");
    return;
},

async  getUpgradePrice(stat, playerId, amount) {
  const player = await models.Players.findByPk(playerId);
  var initalCost = 0;
  var returnedCost = 0;
  switch(stat) {
    case "Health_Points":
      initalCost = player.HP_COST;
    case "Range_":
      initalCost = player.RANGE_COST;
    case "Damage":
      initalCost = player.DAMAGE_COST;
  }

  // +1 Range (4 -> 5 -> 7 -> 10 AP)
// +1 HP (4 -> 5 -> 7 -> 10 AP)
// +1 Damage (12 -> 14 -> 16 AP)

    if(stat == "Range_" || stat == "Health_Points") {
      switch(initalCost) {
        case 4:
          returnedCost = getHPAndRangePriceScaled(amount);
        case 5:
          returnedCost = getHPAndRangePriceScaled(amount + 1) - 4;
        case 7:
          returnedCost = getHPAndRangePriceScaled(amount + 2) - (4 + 5);
        case 10:
          returnedCost = getHPAndRangePriceScaled(amount + 3) - (4 + 5 + 7);
        default:
          throw new Error("Incorrect initial range and/or health cost for player");
      }
    }

    if(initalCost == 12 && stat == "Damage") {
      switch(initalCost){
        case 12:
          returnedCost = getDamagePriceScaled(amount);
        case 14:
          returnedCost = getDamagePriceScaled(amount + 1) - 12;
        case 16:
          returnedCost = getDamagePriceScaled(amount + 2) - (12 + 14);
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

//for checking all the things that happen when a player moves onto an off of a tile, returns wether they player moved or not
async moveFromTiletoTile(startTile, endTile, player) {
  console.log("[INFO][VERBOSE] Player: " + player.Player_ID + " moved from tile: " + startTile + " to tile: " + endTile);
  switch(startTile.Tile_Type) {
      //Player takes damage from leaving fire tile
      case "Fire":
        await this.changeModelByPK(models.Players, "Player_ID", player.Player_ID, "Health_Points", player.Health_Points - fireDmg);
        await this.playerDeathLogic(null, player);
        break;
      //Player destroys smoke tile by moving off of it
      case "Smoke":
        await this.revertTileToBlank(startTile);
        break;
      default:
        break;
  }
  switch(endTile.Tile_Type) {
    //Player takes damage from entering fire tile
      case "Fire":
        await this.changeModelByPK(models.Players, "Player_ID", player.Player_ID, "Health_Points", player.Health_Points - fireDmg);
        await this.playerDeathLogic(null, player);
        break;
    //Player must be moved randomly from entering storm tile
    //Every time a Robot or Stormchaser moves onto a storm tile they...
      case "Storm":
        //Robot heals
        if(player.Class_ID == 19) {
          await this.changeModelByPK(models.Players, "Player_ID", player.Player_ID, "Health_Points", player.Health_Points + 1);
        }
        //Stormchaser gains 1d4-2 AP
        if(player.Class_ID == 15) {
          await this.changeModelByPK(models.Players, "Player_ID", player.Player_ID, "Action_Points", player.Action_Points + (getRandomInt(3) - 1));
        }
        //Player is moved in a random direction once
        await this.movePlayerToRandomSurroundingTile(player.Player_ID, startTile.Layer_ID, startTile.X_Position, startTile.Y_Position);
        break;
      case "Void":
      case "Wall":
      case "Wall_Damaged":
       //Check if player can move on these tiles  
        if(!player.Class_ID == models.Classes.findAll({
          where: {
            //all classes that can move on void wall, and wall damaged tiles
            Class_Name: "Cloudborn"
          }}).Class_ID) {
            await this.changeModelByPK(models.Players, "Player_ID", player.Player_ID, "Tile_ID", startTile.Tile_ID);
            console.error("[ERROR] Player " + player.Discord_ID + " cannot move onto void, wall or wall damaged tiles");
            throw "[ERROR] Player " + player.Discord_ID + " cannot move onto void wall or wall damaged tiles";
        }
        break;
      default:
        break;
  }
  
  if(endTile.Trapped) {
    //Get trapper
    const trapper = await models.Players.findByPk(endTile.trapper);
    if(!trapper) {
      throw new Error("Mine without trapper found. Please contact snage.");
    }
    //Damage player
    changeModelByPK(models.Players, "Player_ID", player.Player_ID, "Health_Points", player.Health_Points - mineDmg);
    playerDeathLogic(trapper, player);
    //Remove trap
    await models.Tiles.update({Trapped: false, trapper: null}, {where: {Tile_ID: endTile.Tile_ID}});
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

 async  movePlayerToRandomSurroundingTile(playerId, layer, x, y) {
  var randomDirection = getRandomInt(7);
  var player = models.Players.findByPk(playerId);
  var playerClass = await models.Classes.findByPk(player.Class_ID);
  var tile = models.Tiles.findAll({where: {Layer_ID: layer, X_Position: x, Y_Position: y}});
  var newTile;
  switch(randomDirection) {
    case 0:
      // West
      newTile = models.Tiles.findAll({where: {Layer_ID: layer, X_Position: x - 1, Y_Position: y}});
      this.moveFromTiletoTile(tile, layer, x - 1, y);
      this.setPlayerToTile(playerId, layer, x - 1, y);
      break;
    case 1:
      // Southwest
      newTile = models.Tiles.findAll({where: {Layer_ID: layer, X_Position: x - 1, Y_Position: y + 1}});
      moveFromTiletoTile(tile, layer, x - 1, y + 1);
      this.setPlayerToTile(playerId, layer, x - 1, y + 1);
      break;
    case 2:
      // South
      newTile = models.Tiles.findAll({where: {Layer_ID: layer, X_Position: x, Y_Position: y + 1}});
      moveFromTiletoTile(tile, layer, x, y + 1);
      this.setPlayerToTile(playerId, layer, x, y + 1);
      break;
    case 3:
      // Southeast
      newTile = models.Tiles.findAll({where: {Layer_ID: layer, X_Position: x + 1, Y_Position: y + 1}});
      moveFromTiletoTile(tile, layer, x + 1, y + 1);
      this.setPlayerToTile(playerId, layer, x + 1, y + 1);
      break;
    case 4:
      // East
      newTile = models.Tiles.findAll({where: {Layer_ID: layer, X_Position: x + 1, Y_Position: y}});
      moveFromTiletoTile(tile, layer, x + 1, y);
      this.setPlayerToTile(playerId, layer, x + 1, y);
      break;
    case 5:
      // Northeast
      newTile = models.Tiles.findAll({where: {Layer_ID: layer, X_Position: x + 1, Y_Position: y - 1}});
      moveFromTiletoTile(tile, layer, x + 1, y - 1);
      this.setPlayerToTile(playerId, layer, x + 1, y - 1);
      break;
    case 6:
      // North
      newTile = models.Tiles.findAll({where: {Layer_ID: layer, X_Position: x, Y_Position: y - 1}});
      moveFromTiletoTile(tile, layer, x, y - 1);
      this.setPlayerToTile(playerId, layer, x, y - 1);
      break;
    case 7:
      // Northwest
      newTile = models.Tiles.findAll({where: {Layer_ID: layer, X_Position: x - 1, Y_Position: y - 1}});
      moveFromTiletoTile(tile, layer, x - 1, y - 1);
      this.setPlayerToTile(playerId, layer, x - 1, y - 1);
      break;
    default:
      console.error("Invalid random direction from derived random number: " + randomDirection);
      break;
  }
  //make sure the storm tile doesnt put them on a tile they usually couldnt move onto
  if(playerClass.Class_Name != "Cloudborn"){
    if(newTile.Tile_Type == "Wall" || newTile.Tile_Type == "Wall_Damaged" || newTile.Tile_Type == "Void") {
      this.movePlayerToRandomSurroundingTile(playerId, layer, x, y);
    }
  }
},

async changeModelByPK(model, id_field, id, field, value) {
  await model.update({field: value}, {where: {id_field: id}});
},

async  getRandomClass(game) {
  var randomClassID = getRandomInt(await models.Classes.count());
  var randomClass = await models.Classes.findByPk(randomClassID);
  await models.Players.findAll({where: {Game_ID: game, Class_ID: randomClass}}).then((players) => {
    if (players.length < 2 || randomClass.Class_Name == "Average") {
      return randomClass;
    }
    else {
      getRandomClass(game);
      console.log("[INFO] rerolling class...");
    }
  });
},

 getSpawnpointTile(game) {
  var randomTile = models.Tiles.findByPk(getRandomTileId(game));
  console.log("[INFO] rolled tile: " + randomTile + " for a spawnpoint");
  playersInTile = [randomTile.Player_1, randomTile.Player_2, randomTile.Player_3, randomTile.Player_4];
  if ( !playersInTile.includes(null) || 
      randomTile.Tile_Type == "Void" ||
      randomTile.Tile_Type == "Fire" ||
      randomTile.Tile_Type == "Ice" ||
      randomTile.Tile_Type == "Storm" ||
      randomTile.Tile_Type == "Wall" ||
      randomTile.Tile_Type == "Wall_Damaged" ) {
    console.log("[INFO]  rerolling spawnpoint...");
    getSpawnpointTile(game);
  }
  else {
    return randomTile;
  };
},

 delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
},

async  setPlayerToTile(playerId, layer, x, y) {
  var currentPlayer = await models.Players.findByPk(playerId)
  var currentTile = await models.Tiles.findByPk(currentPlayer.Tile_ID);
  removePlayerFromTile(playerId, currentTile.Layer_ID, currentTile.X_Position, currentTile.Y_Position);
  await models.Tiles.findOne({where: {Layer: layer, X_Position: x, Y_Position: y}}).then((tile) => {
    if(tile.Player_1 == null) {
      tile.Player_1 = playerId;
    }
    else if(tile.Player_2 == null) {
      tile.Player_2 = playerId;
    }
    else if(tile.Player_3 == null) {
      tile.Player_3 = playerId;
    }
    else if(tile.Player_4 == null) {
      tile.Player_4 = playerId;
    }
    else {
      throw "tile is full";
    }
    tile.save();
  });
},

//turns a path([[direction, distance]]) into an array of [[x, y]] of each tile where the direction changes
// mainly used for generating a cordinate array for getTileCordinatesOfPath
//path takes in a result of inputPathToArray
//startingTile takes in an array of [x, y] of where the path starts
 pathToTiles(startingTile, path) {

  var tiles = [];
  //add the starting tile
  tiles.push([startingTile.X_Position, startingTile.Y_Position]);
  for (run in path){
    //find where the next tile is and add its cordinates to the array
    //case "direction":
    //  destination = [x +/- distance, y +/- distance];
    //  break;
    //tiles.push(destination);
      switch(path[run][0]){
        case "left":
          destination = [startingTile.X_Position - parseInt(path[run][1]), startingTile.Y_Position];
          break;
        case "right":
          destination = [startingTile.X_Position + parseInt(path[run][1]), startingTile.Y_Position];
          break;
        case "up":
          destination = [startingTile.X_Position, startingTile.Y_Position - parseInt(path[run][1])];
          break;
        case "down":
          destination = [startingTile.X_Position, startingTile.Y_Position + parseInt(path[run][1])];
          break;
        case "nw":
          destination = [startingTile.X_Position - parseInt(path[run][1]), startingTile.Y_Position - parseInt(path[run][1])];
          break;
        case "ne":
          destination = [startingTile.X_Position + parseInt(path[run][1]), startingTile.Y_Position - parseInt(path[run][1])];
          break;
        case "sw":
          destination = [startingTile.X_Position - parseInt(path[run][1]), startingTile.Y_Position + parseInt(path[run][1])];
          break;
        case "se":
          destination = [startingTile.X_Position + parseInt(path[run][1]), startingTile.Y_Position + parseInt(path[run][1])];
          break;
        default:
          throw "[ERROR][pathToTiles][SITUATIONAL] Invalid input path, your are using a direction that isnt: left,right,up,down,nw,ne,sw, or se";
      }
      tiles.push(destination);
    }
  return tiles
},

//the same as getTileCordinatesOfLine but for paths
//startingTile takes in an array of [x, y] of where the path starts
//path takes in a result of inputPathToArray
//returns an array of arrays of [x, y] cordinates that the path goes through
 getTileCordinatesOfPath(startingTile, path) {
  var tiles = pathToTiles(startingTile, path);
  var returnedTiles
  for (tile in tiles) {
    returnedTiles.push(getTileCordinatesOfLine(tiles[tile], tiles[tile + 1]));
  }
  return returnedTiles
},

//returns the rounded x and y cordinates of tiles found on a line if it was drown from tileCord1 to tileCord2
//tileCord1 and tileCord2 are arrays of [x, y]
//includes tileCord1 and tileCord2 in the returned array of tiles on the line
 getTileCordinatesOfLine(tileCord1, tileCord2) {
  var returnedTiles = [tileCord1];
  var slope = (tileCord1[1] - tileCord2[1] / tileCord1[0] - tileCord2[0]);
  var x = tileCord1[0];
  var y = tileCord1[1];
  var direction = getDirection(tileCord1, tileCord2)

  while([x, y] != tileCord2) {
    switch (direction) {
      case "north":
        x = tileCord1[0];
        y++;
        break;
      case "south":
        x = tileCord1[0];
        y--;
        break;
      case "east": case "northeast": case "southeast":
        x++;
        y = Math.round(slope * (x - tileCord2[0]) + tileCord2[1]);
        break;
      case "west": case"northwest": case "southwest":
        x--;
        y = Math.round(slope * (x - tileCord2[0]) + tileCord2[1]);
      break;
    }
    returnedTiles.push([x, y]);
  }
  return returnedTiles;
},

async  getOldestActiveGameId(playerID) {
  if (playerID) {
    var players = await models.Players.findAll({where: {Discord_ID: playerID}, attributes: ["Game_ID"]});
  var games = await models.Games.findAll({where: {
    GAME_STATE: {
      [Op.or]: [GAMESTATES.ACTIVE, GAMESTATES.TIMESTOPPED, GAMESTATES.FINALE]
    },
    Game_ID: players}});
  }
  else {
    var games = await models.Games.findAll({where: {
      GAME_STATE: {
        [Op.or]: [GAMESTATES.ACTIVE, GAMESTATES.TIMESTOPPED]
      }}});
  }
  //set oldestGameId to newest Id
  var oldestGameId = games.length;
  for (var i = 0; i < games.length; i++) {
    //if a game id is lower its older so we swap it out
    if (games[i].Game_ID < oldestGameId) {
      oldestGameId = games[i].GAME_ID;
    }
  }
  return oldestGameId;
},

async  getOldestGamestateGameId(playerID, gamestate) {
    if (playerID) {
    var players = await models.Players.findAll({where: {Discord_ID: playerID}, attributes: ["Game_ID"]});
    var games = await models.Games.findAll({where: {
      GAME_STATE: gamestate,
      Game_ID: players}});
    }
  else {
    var games = await models.Games.findAll({where: {
        GAME_STATE: gamestate
      }});
  }
  //set oldestGameId to newest Id
  var oldestGameId = games.length;
  for (var i = 0; i < games.length; i++) {
    //if a game id is lower its older so we swap it out
    if (games[i].Game_ID < oldestGameId) {
      oldestGameId = games[i].GAME_ID;
    }
  }
  return oldestGameId;
},

//takes in two players and checks if the second one is dead
//if so it updates the second players dead boolean, take them off the board, and the first players kill count
//killer is nullable for cases where the environment killed the player, like a fire tile
async  playerDeathLogic(killer, victim) {
  //TODO: finish this and implement it anywhere hp is decreased

  //get classes
  killer ? killerClass = await models.Classes.findByPk(killer.Class_ID) : killerClass = null;
  victimClass = await models.Classes.findByPk(victim.Class_ID);

  //check if the victim is dead and there isnt a class with weird death logic involved
  if (victim.Health_Points <= 0 
    && victim.PharohHP <= 0 
    && victimClass.Class_Name != "Twin" 
    && killerClass.Class_Name != "Hitman"
    && killerClass.Class_Name != "Cannibal" ) {
    await models.Players.update({Dead: true}, {where: {Player_ID: victim.Player_ID}});
    await models.Players.update({Tile_ID: null}, {where: {Player_ID: victim.Player_ID}});
    await models.Players.update({Kills: killer.Kills + 1}, {where: {Player_ID: killer.Player_ID}});
  }

  //Weird death case #0 if the victim goes to 0 hp but has some revive hp revive them on a random tile with their pharaoh hp as their health and reset their pharaoh hp
  //this still counts as a kill
  if(victim.Health_Points <= 0 && victim.PharohHP > 0)
  {
    await models.Players.update({Tile_ID: this.getSpawnpointTile(victim.Game_ID), Health_Points: victim.PharohHP, PharaohHP: 0}, {where: {Player_ID: victim.Player_ID}});
    await models.Players.update({Kills: killer.Kills + 1}, {where: {Player_ID: killer.Player_ID}});
  }

  //Weird death case #1 twins have two bodies and both have to be dead in order for the player to die      
  //We need to make sure to remove both twins tiles and only one if only 1 twin dies
  //WARN: ONLY HANDLES THE VICTIM SIDE OF THE DEATH
  if(victimClass.Class_Name == "Twin"){
    //Both twins are at 0 hp and the player doesnt have any pharoh hp so run the normal death logic and remove both twins tiles
    if(victim.Health_Points <= 0 
      && victim.Health_Points2 <= 0 
      && victim.PharohHP <= 0 )
    {
      await models.Players.update({Dead: true}, {where: {Player_ID: victim.Player_ID}});
      await models.Players.update({Tile_ID: null}, {where: {Player_ID: victim.Player_ID}});
      await models.Players.update({Tile_ID2: null}, {where: {Player_ID: victim.Player_ID}});
    }
    //Both twins are at 0 hp but the player has some pharaoh hp so revive them on a random tile with their pharaoh hp as their health and reset their pharaoh hp
    if(victim.Health_Points <= 0 
      && victim.Health_Points2 <= 0 
      && victim.PharohHP > 0 )
    {
      await models.Players.update({Tile_ID: this.getSpawnpointTile(victim.Game_ID), Health_Points: victim.PharohHP, PharaohHP: 0}, {where: {Player_ID: victim.Player_ID}});
    }
    //One twin is at 0 hp but the player has some pharaoh hp so revive the dead clone on a random tile with their pharaoh hp as their health and reset their pharaoh hp
    if(victim.Health_Points <= 0 && victim.Health_Points2 > 0 && victim.PharohHP > 0)
    {
      await models.Players.update({Tile_ID2: this.getSpawnpointTile(victim.Game_ID), Health_Points2: victim.PharaohHP, PharaohHP: 0}, {where: {Player_ID: victim.Player_ID}});
    }
    if(victim.Health_Points > 0 && victim.Health_Points2 <= 0 && victim.PharohHP > 0)
    {
      await models.Players.update({Tile_ID: this.getSpawnpointTile(victim.Game_ID), Health_Points: victim.PharaohHP, PharaohHP: 0}, {where: {Player_ID: victim.Player_ID2}});
    }
    //One twin is at 0 hp so kill it but dont mark the player as dead
    if(victim.Health_Points <= 0 && victim.Health_Points2 > 0){
      await models.Players.update({Tile_ID2: null}, {where: {Player_ID: victim.Player_ID}});
    }
    if(victim.Health_Points > 0 && victim.Health_Points2 <= 0){
      await models.Players.update({Tile_ID: null}, {where: {Player_ID: victim.Player_ID2}});
    }
  }
  else if(victim.Health_Points <= 0){
      await models.Players.update({Dead: true}, {where: {Player_ID: victim.Player_ID}});
      await models.Players.update({Tile_ID: null}, {where: {Player_ID: victim.Player_ID}});
    }
//TODO fix this logic
  if(victim.Health_Points <= 0){
    switch(killerClass.Class_Name){
      //Weird death case #2 hitman gets 4AP for every kill, do normal death logic but also update the hitman's AP
      case "Hitman":
        if(killer.Hitman_Target == victim.Player_ID ){
          await models.Players.update({Kills: killer.Kills + 1, Action_Points: killer.Action_Points + 4}, {where: {Player_ID: killer.Player_ID}});
        }
        else if(victim.Health_Points <= 0){
          await models.Players.update({Kills: killer.Kills + 1}, {where: {Player_ID: killer.Player_ID}});
        }
        break;
      //Weird death case #3 cannibal gets 1AP for every kill, 6AP if the victim has max ap, do normal death logic but also update the cannibal's AP
      case "Cannibal":
        if(victim.Action_Points == victim.MAX_AP){
          await models.Players.update({Kills: killer.Kills + 1, Action_Points: killer.Action_Points + 6}, {where: {Player_ID: killer.Player_ID}});
        }else {
          await models.Players.update({Kills: killer.Kills + 1, Action_Points: killer.Action_Points + 1}, {where: {Player_ID: killer.Player_ID}});
        }
        break;
      default:
        //Should only run if there is no killer
        return;
    }
  }
},

//gets the direction one would go in if they started at point1 facing point 2 and walked forwards
 getDirection(point1, point2) {
  xDiff = point1[0] - point2[0];
  yDiff = point1[1] - point2[1];
  returnedDirection = null;
  switch (yDiff) {
    //y1 = y2
    case 0:
      returnedDirection += ""
      switch (xDiff) {
        // x1 = x2
        case 0:
          console.error("[ERROR] Utils.getDirection: Same points, no direction");
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
      returnedDirection + "south";
      switch (xDiff) {
        // x1 = x2
        case 0:
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
      break;
    //y1 < y2
    case (yDiff < 0):
      returnedDirection += "north";
      switch (xDiff) {
        // x1 = x2
        case 0:
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
      break;
  }
},

async  removePlayerFromTile(playerId, layer, x, y) {
  await models.Tiles.findOne({where: {Layer: layer, X: x, Y: y}}).then((tile) => {
      if(tile.Player_1 == playerId) {
        tile.Player_1 = null;
      }
      if(tile.Player_2 == playerId) {
        tile.Player_2 = null;
      }
      if(tile.Player_3 == playerId) {
        tile.Player_3 = null;
      }
      if(tile.Player_4 == playerId) {
        tile.Player_4 = null;
      }
      tile.save();
  });
},

 getRandomInt(max) {
  return Math.round(Math.random() * max);
},

async  getRandomTileId(game) {
  return getRandomInt(await models.Tiles.count({where: {Game_ID: game}}));
},

//Claude Provided Move Command Function Refactors
async  validateAndParseMoveCommandInput(interaction) {
  // Gather all inputs with clear defaults
  const gameId = interaction.options.getInteger('game') || await getOldestActiveGameId();
  const direction = interaction.options.getString('direction');
  const distance = interaction.options.getInteger('distance');
  const bodyToMove = interaction.options.getInteger('body') || 1; // Default to body 1
  const inputtedPath = interaction.options.getString('path');
  
  // Find the player in the database
  const player = await models.Players.findOne({
    where: {
      Game_ID: gameId,
      Discord_ID: interaction.user.id,
    }
  });
  
  if (!player) {
    throw new Error("Player not found in game! Please register for the game you wish to move in.");
  }
  
  // Determine which tile to move (handles Twin class properly)
  const currentTileId = bodyToMove === 2 ? player.Tile_ID_2 : player.Tile_ID;
  const currentTile = await models.Tiles.findByPk(currentTileId);
  
  if (!currentTile) {
    throw new Error("Current tile not found! Please register, or ask a Dev about why you're not on the board");
  }
  
  // Validate path format if provided
  if (inputtedPath) {
    await verifyinputPath(inputtedPath, currentTile.Layer_ID, currentTile.X_Position, currentTile.Y_Position);
  }

  
  
  return {
    player,
    currentTile,
    direction,
    distance,
    customPath: inputtedPath,
    gameId
  };
},

async  calculateMovement(moveRequest) {
  const { currentTile, direction, distance, customPath } = moveRequest;
  
  // Start from current position
  let newX = currentTile.X_Position;
  let newY = currentTile.Y_Position;
  
  // Calculate movement path
  let movementPath;
  
  if (customPath) {
    // Use custom path - this needs the utils functions to be working
    const pathArray = utils.inputPathToArray(customPath);
    const completePathArray = utils.buildCompletePathArray(direction, distance, pathArray);
    movementPath = utils.getTileCordinatesOfPath([newX, newY], completePathArray);
  } else {
    // Use simple directional movement
    const directionMap = {
      'west': [-distance, 0],
      'east': [distance, 0],
      'north': [0, distance],
      'south': [0, -distance],
      'northeast': [distance, distance],
      'northwest': [-distance, distance],
      'southeast': [distance, -distance],
      'southwest': [-distance, -distance]
    };
    
    const [deltaX, deltaY] = directionMap[direction];
    newX += deltaX;
    newY += deltaY;
    
    // Create a simple path for consistency
    movementPath = utils.getTileCordinatesOfLine([currentTile.X_Position, currentTile.Y_Position], [newX, newY]);
  }
  
  // Check bounds
  const currentLayer = await models.Layers.findByPk(currentTile.Layer_ID);
  newX = Math.min(currentLayer.X_Bound, Math.max(1, newX));
  newY = Math.min(currentLayer.Y_Bound, Math.max(1, newY));
  
  return {
    startTile: currentTile,
    endPosition: { x: newX, y: newY },
    movementPath,
    layer: currentLayer
  };
},

//returns a string if any special case happens
//otherwise returns nothing
async hotPotatoSwap(player1, player2, player1Username, player2Username) {
  const newClass = await models.Classes.findByPk(player2.Class_ID);
  
  switch(newClass.Class_Name) {
    case "Twin":
      await models.Players.update({Tile_ID_2: player2.Tile_ID, Health_Points2: player2.Health_Points2, Damage2: player2.Damage2, Range_2: player2.Range_2}, {where: {Player_ID: player1.Player_ID}});
      await models.Players.update({Tile_ID_2: null, Health_Points2: null, Damage2: null, Range_2: null}, {where: {Player_ID: player2.Player_ID}});
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
