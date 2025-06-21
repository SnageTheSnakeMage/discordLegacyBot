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
//#endregion BOILERPLATE

//#reigon GLOBAL VARIABLES

var moveCost = 1;
var shootCost = 2;
var timestopped = false;
var fireDmg = 1;
var mineDmg = 1;

//#endregion

// Function to load a tile texture
async function loadTileTexture(layer, textureName) {
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
}

//turns the string into a proper path array
//[[direction, distance]]
//direction: left, right, up, down, nw, ne, sw, se
//distance: number
function inputPathToArray(inputPath){
  return inputPath.split(';').map(row => row.split(','));
}

async function verifyinputPath(inputPath, layer, startingTileX, startingTileY){
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
}

//adds an inital move to the path array
//initialMoveDirection = left, right, up, down, nw, ne, sw, se
//initialMoveDistance = number
//pathArray = return of inputPathToArray
//returns an array of di
function addStartToPathArray(initalMoveDirection, initalMoveDistance, pathArray){
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
}

async function commandResolutionErrorThrower() {
  delay(850000);
  throw "Command Resolution Error";
}

//turns a layer id that would be known to a player for a game into the actual layer's id in the database
async function commonLayerIDtoDbLayerID(game, inputtedLayerID){
    var gridID = await models.Grids.findOne({where: {Game_ID: game}}).Grid_ID
    var layersInGrid = await models.Layers.findAll({where: {Grid_ID: gridID}})
    return layersInGrid[inputtedLayerID-1]
}

// generates a layer from a game while checking what a player can see
async function GenerateGameGridImage(game, inputtedlayerID, playerID) {
  const tileSize = 208;

  // Get layer dimensions
  const layerData = commonLayerIDtoDbLayerID(game, inputtedlayerID);
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

  const player = await models.Players.findByPk(playerID);
  const playersTile = await models.Tiles.findByPk(player.Tile_ID);
  trapSight = player.Class_ID == 22 || player.Class_ID == 7 ? true : false;
  allLayerSight = player.Class_ID == 22 ? true : false;
  
  if(!allLayerSight) {
    if (inputtedlayerID != playersTile.Layer_ID) {
      throw "You can only view the layer you are currently on, unless you are an oracle";
    }
  }

  // Process each tile
  for (const currentTile of layerTiles) {
    // Get players on this tile
    const tilePlayers = await Promise.all([
      models.Players.findOne({where: {Player_ID: currentTile.Player1}}),
      models.Players.findOne({where: {Player_ID: currentTile.Player2}}), 
      models.Players.findOne({where: {Player_ID: currentTile.Player3}}), 
      models.Players.findOne({where: {Player_ID: currentTile.Player4}})
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
}

//
//   for (row in GameData[game][0][layer]) {
//     for(column in GameData[game][0][layer][0]) {
//       const tileType = GameData[game][0][layer][row][column][0];
//       const tilePlayers = GameData[game][0][layer][row][column][1];
//       const tileTrapped = GameData[game][0][layer][row][column][2];
//       const tileImage = await loadTileTexture("enviornment", tileType);
//       const canvasX = (column * canvasWidth) / baseGridWidth;
//       const canvasY = (row * canvasHeight) / baseGridHeight;
//       const enviornmentTileWidth = canvasWidth / GameData[game][0][layer][0].length;
//       const enviornmentTileHeight = canvasHeight / GameData[game][0][layer].length;
//       const playerTileWidth = enviornmentTileWidth / 2;
//       const playerTileHeight = enviornmentTileHeight / 2;

//       //draw the environment
//       context.drawImage(
//         tileImage,
//         canvasX,
//         canvasY,
//         enviornmentTileWidth,
//         enviornmentTileHeight,
//       )
//       //then the players
//       for (player in tilePlayers) {
//         const playerImage = await loadTileTexture("players", tilePlayers[player]);
//         var playerTilePositionX;
//         var playerTilePositionY;
//         console.log(`[INFO][VERBOSE] player: ${player}`);
//         switch (player) {
//           case "0":
//             playerTilePositionX = canvasX;
//             playerTilePositionY = canvasY;
//             break;
//           case "1":
//             playerTilePositionX = canvasX + playerTileWidth;
//             playerTilePositionY = canvasY;
//             break;
//           case "2":
//             playerTilePositionX = canvasX;
//             playerTilePositionY = canvasY + playerTileHeight;
//             break;
//           case "3":
//             playerTilePositionX = canvasX + playerTileWidth;
//             playerTilePositionY = canvasY + playerTileHeight;
//             break;
//         }
//         console.log(`[INFO][VERBOSE] player position: ${playerTilePositionX}, ${playerTilePositionY}`);
//         context.drawImage(
//           playerImage,
//           playerTilePositionX,
//           playerTilePositionY,
//           playerTileWidth,
//           playerTileHeight,
//         )
//       }
//       //then the mines
//       if (tileTrapped) {
//         const mineImage = await loadTileTexture("mines", "Mine");
//         context.drawImage(
//           mineImage,
//           canvasX,
//           canvasY,
//           enviornmentTileWidth,
//           enviornmentTileHeight,
//         )
//       }
//       if(verbose) {
//         console.log(`[INFO][VERBOSE] Canvas X: ${canvasX}`);
//         console.log(`[INFO][VERBOSE] Canvas Y: ${canvasY}`);
//         console.log(`[INFO][VERBOSE] Tile Trapped: ${GameData[game][0][layer][row][column][2]}`);
//         console.log(`[INFO][VERBOSE] Tile Image: ${tileType}`);
//         console.log(`[INFO][VERBOSE] Tile Players: ${GameData[game][0][layer][row][column][1]}`);
//         console.log(`[INFO][VERBOSE] Tile Type: ${GameData[game][0][layer][row][column][0]}`);
//         console.log(`[INFO][VERBOSE] Enviornment Tile Width: ${enviornmentTileWidth}`);
//         console.log(`[INFO][VERBOSE] Enviornment Tile Height: ${enviornmentTileHeight}`);
//         console.log(`[INFO][VERBOSE] Player Tile Width: ${playerTileWidth}`);
//         console.log(`[INFO][VERBOSE] Player Tile Height: ${playerTileHeight}`);
//         console.log("[INFO][VERBOSE] Finished processing row: " + row);
        
//       }
//     }
//   }
//   return canvas.toBuffer();
// }

// async function GenerateObscuredGameGridImage(game, layer) {
//   const tileSize = 400;

//   // Base canvas dimensions (determined by the environment layer)
//   const baseGridHeight = GameData[game][0][layer].length;
//   const baseGridWidth = GameData[game][0][layer][0].length;
  
//   const canvasWidth = baseGridWidth * tileSize;
//   const canvasHeight = baseGridHeight * tileSize;
  
//   // Create a canvas
//   const canvas = Canvas.createCanvas(canvasWidth, canvasHeight);
//   const context = canvas.getContext('2d');
  
//   // Fill background (optional)
//   context.fillStyle = '#222222';
//   context.fillRect(0, 0, canvasWidth, canvasHeight);

  
//   // Process each tile in the grid
  
//   for (x in GameData[game][0][layer]) {
//     for(y in GameData[game][0][layer][x]) {
//       const tileType = GameData[game][0][layer][x][y][0];
//       const tilePlayers = GameData[game][0][layer][x][y][1];
//       const tileImage = await loadTileTexture(layer, tileType);
//       //draw the environment
//       context.drawImage(
//         tileImage,
//         canvasWidth,
//         canvasHeight,
//         1,
//         1,
//       )
//       //then the players
//       for (player in tilePlayers) {
//         const playerImage = await loadTileTexture(layer, tilePlayers[player][0]);
//         context.drawImage(
//           playerImage,
//           canvasWidth,
//           canvasHeight,
//           0.25,
//           0.25,
//         )
//       }
//     }
//   }
//   return canvas.toBuffer();
// }

// function findPlayerById(game, playerId) {
//     for (player in GameData[game][1]) {
//       if (GameData[game][1][players][0] == playerId) {
//         return GameData[game][1][player];
//     }
//   }
//   console.error("Player with id " + playerId + " not found");
//   return null;
// }

// function getTile(game, layer, x, y) {
//   return GameData[game][0][layer][y][x];
// }

// function setTileType(game, layer, x, y, tileType) {
//   switch(tileType) {
//     case "Void":
//       GameData[game][0][layer][y][x][0] = "Void";
//       break;
//     case "Blank1":
//       GameData[game][0][layer][y][x][0] = "Blank1";
//       break;
//     case "Blank2":
//       GameData[game][0][layer][y][x][0] = "Blank2";
//       break;
//     case "Fire":
//       GameData[game][0][layer][y][x][0] = "Fire";
//       break;
//     case "Ice":
//       GameData[game][0][layer][y][x][0] = "Ice";
//       break;
//     case "Storm":
//       GameData[game][0][layer][y][x][0] = "Storm";
//       break;
//     case "Gateway":
//       GameData[game][0][layer][y][x][0] = "Gateway";
//       break;
//     case "Bush":
//       GameData[game][0][layer][y][x][0] = "Bush";
//       break;
//     case "Chest":
//       GameData[game][0][layer][y][x][0] = "Chest";
//       break;
//     case "Heal":
//       GameData[game][0][layer][y][x][0] = "Heal";
//       break;
//     case "lockedGateway":
//       GameData[game][0][layer][y][x][0] = "lockedGateway";
//       break;
//     case "Smoke":
//       GameData[game][0][layer][y][x][0] = "Smoke";
//       break;
//     case "Wall":
//       GameData[game][0][layer][y][x][0] = "Wall";
//       break;
//     default:
//       console.error("Invalid tile type: " + tileType);
//       break;
//   }
// }

// function getPlayersByTile(game, layer, x, y) {
//   var playersInTile = [];
//   for (players in getTile(game, layer, x, y)[1]) {
//     playersInTile.push(players);
//   }
//   return playersInTile;
// }

// function getPlayersByClass(game, classType) {

//   //Class type validation
//   var ClassNames = [];
//   for (let i = 0; i < Classes.length; i++) {
//     ClassNames.push(Classes[i][0]);
//   }
//   if (!ClassNames.includes(classType)) {
//     console.error("Invalid class type: " + classType);
//     return null;
//   }

//   //Get players
//   var playersWithClass = [];
//   for (player in GameData[game][1]) {
//     if (GameData[game][1][player][10] == classType) {
//       if (playersWithClass.length > 2){
//         console.error("Too many players with class: " + classType);
//       }
//       return playersWithClass;
//     }
//     else {
//       console.log("[INFO] tile: " + getTile(game, layer, x, y)[1][player] + "is empty");
//       return null;
//     }
//   }
// }

// function getDeadPlayers(game) {
//   var deadPlayers = [];
//   for (player in GameData[game][1]) {
//     if (GameData[game][1][player][11] == true) {
//       deadPlayers.push(player);
//     }
//   }
//   return deadPlayers;
// }

// function getPlayersByValue(game, valueIndex, value) {
//   var returnedPlayers = [];
//   for (player in GameData[game][1]) {
//     if (GameData[game][1][player][valueIndex] == value) {
//       returnedPlayers.push(player);
//     }
//   }
//   return returnedPlayers;
// }


// function verifyPlayer(player) {
//   if (
//     typeof(player[0]) == String
//     && typeof(player[1]) == Number
//     && typeof(player[2]) == Number
//     && typeof(player[3]) == Number
//     && typeof(player[4]) == Number
//     && typeof(player[5]) == Number
//     && typeof(player[6]) == Number
//     && typeof(player[7]) == Number
//     && typeof(player[8]) == Number
//     && typeof(player[9]) == Number
//     && typeof(player[10]) == Boolean
//     && typeof(player[11]) == Number)  
//     return true;
//   else
//     return false;
// }

// function getSpawnpointTile(game) {
//   var randomTile = getRandomTile(game);
//   console.log("[INFO] rolled tile: " + randomTile + " for a spawnpoint");
//   if (randomTile[1].length < 4) {
//     console.log("[INFO] tile: " + randomTile + " has 4 players and is full, rerolling...");
//     getSpawnpointTile(game);
//   }
//   else {
//     return randomTile;
//   };
// }
//
// function setPlayerStat(game, playerId, statIndex, value) {
//   var player = findPlayerById(game, playerId);
//   player[statIndex] = value;
// }
//

//adds a player to a game and downloads their playerIcon to be used for GenerateGameGridImagewithSight 
async function registerPlayer(game, playerId, playerIcon) {
    if(await models.Players.count({where: {Discord_ID: playerId}}) > 0) return;
    var SelectedClass = getRandomClass(game);
    var spawn = getSpawnpointTile(game)
    movePlayerToTile(player, spawn);
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
}

//for checking all the things that happen when a player moves onto an off of a tile, returns wether they player moved or not
async function moveFromTiletoTile(startTile, endTile, player) {
  console.log("[INFO][VERBOSE] Player: " + player.Player_ID + " moved from tile: " + startTile + " to tile: " + endTile);
  switch(startTile.Tile_Type) {
      //Player takes damage from leaving fire tile
      case "Fire":
        changeModelByPK(models.Players, "Player_ID", player.Player_ID, "Health_Points", player.Health_Points - fireDmg);
        break;
      //Player destroys smoke tile by moving off of it
      case "Smoke":
        revertTileToBlank(startTile);
        break;
      default:
        break;
  }
  switch(endTile.Tile_Type) {
    //Player takes damage from entering fire tile
      case "Fire":
        changeModelByPK(models.Players, "Player_ID", player.Player_ID, "Health_Points", player.Health_Points - fireDmg);
        break;
    //Player must be moved randomly from entering storm tile
    //Every time a Robot or Stormchaser moves onto a storm tile they...
      case "Storm":
        //Robot heals
        if(player.Class_ID == 19) {
          changeModelByPK(models.Players, "Player_ID", player.Player_ID, "Health_Points", player.Health_Points + 1);
        }
        //Stormchaser gains 1d4-2 AP
        if(player.Class_ID == 15) {
          changeModelByPK(models.Players, "Player_ID", player.Player_ID, "Action_Points", player.Action_Points + (getRandomInt(3) - 1));
        }
        //Player is moved in a random direction once
        movePlayerToRandomSurroundingTile(player.Player_ID, startTile.Layer_ID, startTile.X_Position, startTile.Y_Position);
        break;
      case "Void":
      case "Wall":
       //Check if player can move on these tiles  
        if(!player.Class_ID == models.Classes.findAll({
          where: {
            //all classes that can move on void and wall tiles
            Class_Name: "Cloudborn"
          }}).Class_ID) {
            changeModelByPK(models.Players, "Player_ID", player.Player_ID, "Tile_ID", startTile.Tile_ID);
            console.error("[ERROR] Player " + player.Discord_ID + " cannot move onto void or wall tiles");
            throw "[ERROR] Player " + player.Discord_ID + " cannot move onto void or wall tiles";
        }
        break;
      default:
        break;
  }
  
  if(endTile.Trapped) {
    //Damage player
    changeModelByPK(models.Players, "Player_ID", player.Player_ID, "Health_Points", player.Health_Points - mineDmg);
    changeModelByPK(models.Tiles, "Tile_ID", endTile.Tile_ID, "Trapped", false);
  }
}

//turns a given tile into a its corresponding blank tile to preserve the checkerboard pattern
function revertTileToBlank(startTile){

    if(startTile.X_Position + startTile.Y_Position % 2 == 0) {
      models.Tiles.update({Tile_Type: "Blank1"}, {where: {Layer_ID: startTile.Layer_ID, X_Position: startTile.X_Position, Y_Position: startTile.Y_Position}});
     return;
    }
    else{
     models.Tiles.update({Tile_Type: "Blank2"}, {where: {Layer_ID: startTile.Layer_ID, X_Position: startTile.X_Position, Y_Position: startTile.Y_Position}});
     return;
    }
}

function movePlayerToRandomSurroundingTile(playerId, layer, x, y) {
  var randomDirection = getRandomInt(7);
  var player = models.Players.findByPk(playerId);
  var tile = models.Tiles.findAll({where: {Layer_ID: layer, X_Position: x, Y_Position: y}});
  var newTile;
  switch(randomDirection) {
    case 0:
      // West
      newTile = models.Tiles.findAll({where: {Layer_ID: layer, X_Position: x - 1, Y_Position: y}});
      moveFromTiletoTile(tile, layer, x - 1, y);
      movePlayerToTile(playerId, layer, x - 1, y);
      break;
    case 1:
      // Southwest
      movePlayerToTile(playerId, layer, x - 1, y + 1);
      break;
    case 2:
      // South
      movePlayerToTile(playerId, layer, x, y + 1);
      break;
    case 3:
      // Southeast
      movePlayerToTile(playerId, layer, x + 1, y + 1);
      break;
    case 4:
      // East
      movePlayerToTile(playerId, layer, x + 1, y);
      break;
    case 5:
      // Northeast
      movePlayerToTile(playerId, layer, x + 1, y - 1);
      break;
    case 6:
      // North
      movePlayerToTile(playerId, layer, x, y - 1);
      break;
    case 7:
      // Northwest
      movePlayerToTile(playerId, layer, x - 1, y - 1);
      break;
    default:
      console.error("Invalid random direction from derived random number: " + randomDirection);
      break;
  }
}

function changeModelByPK(model, id_field, id, field, value) {
  model.update({field: value}, {where: {id_field: id}});
}

async function getRandomClass(game) {
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
}

function getSpawnpointTile(game) {
  var randomTile = models.Tiles.findByPk(getRandomTileId(game));
  console.log("[INFO] rolled tile: " + randomTile + " for a spawnpoint");
  playersInTile = [randomTile.Player_1, randomTile.Player_2, randomTile.Player_3, randomTile.Player_4];
  if ( !playersInTile.includes(null) || 
      randomTile.Tile_Type == "Void" ||
      randomTile.Tile_Type == "Fire" ||
      randomTile.Tile_Type == "Ice" ||
      randomTile.Tile_Type == "Storm" ||
      randomTile.Tile_Type == "Wall" ) {
    console.log("[INFO]  rerolling spawnpoint...");
    getSpawnpointTile(game);
  }
  else {
    return randomTile;
  };
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function movePlayerToTile(playerId, layer, x, y) {
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
}

//turns a path([[direction, distance]]) into an array of [[x, y]] of each tile where the direction changes
// mainly used for generating a cordinate array for getTileCordinatesOfPath
//path takes in a result of inputPathToArray
//startingTile takes in an array of [x, y] of where the path starts
function pathToTiles(startingTile, path) {

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
}

//the same as getTileCordinatesOfLine but for paths
//startingTile takes in an array of [x, y] of where the path starts
//path takes in a result of inputPathToArray
//returns an array of arrays of [x, y] cordinates that the path goes through
function getTileCordinatesOfPath(startingTile, path) {
  var tiles = pathToTiles(startingTile, path);
  var returnedTiles
  for (tile in tiles) {
    returnedTiles.push(getTileCordinatesOfLine(tiles[tile], tiles[tile + 1]));
  }
  return returnedTiles
}

//returns the rounded x and y cordinates of tiles found on a line if it was drown from tileCord1 to tileCord2
//tileCord1 and tileCord2 are arrays of [x, y]
//includes tileCord1 and tileCord2 in the returned array of tiles on the line
function getTileCordinatesOfLine(tileCord1, tileCord2) {
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
}

async function getOldestActiveGameId(playerID) {
  var players = await models.Players.findAll({where: {Discord_ID: playerID}, attributes: ["Game_ID"]});
  var games = await models.Games.findAll({where: {
    GAME_STATE: "Active",
    Game_ID: {
      [Op.or]: players
  }}});
  //set oldestGameId to newest Id
  var oldestGameId = games.length;
  for (var i = 0; i < games.length; i++) {
    //if a game id is lower its older so we swap it out
    if (games[i].Game_ID < oldestGameId) {
      oldestGameId = games[i].GAME_ID;
    }
  }
  return oldestGameId;
}

//gets the direction one would go in if they started at point1 facing point 2 and walked forwards
function getDirection(point1, point2) {
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
}

async function removePlayerFromTile(playerId, layer, x, y) {
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
}

function getRandomInt(max) {
  return Math.round(Math.random() * max);
}

async function getRandomTileId(game) {
  return getRandomInt(await models.Tiles.count({where: {Game_ID: game}}));
}

module.exports = {
  loadTileTexture,
  getTileCordinatesOfLine,
  getDirection,
  removePlayerFromTile,
  registerPlayer,
  getRandomInt,
  getRandomTile: getRandomTileId,
  GenerateGameGridImage,
  addPlayerToTile: movePlayerToTile,
  getSpawnpointTile,
  getRandomClass,
  moveFromTiletoTile,
  commandResolutionErrorThrower,
  verifyinputPath,
  buildCompletePathArray: addStartToPathArray,
  getOldestActiveGameId,
  getTileCordinatesOfPath,
  inputPathToArray,
  moveCost,
  shootCost,
  timestopped,
};