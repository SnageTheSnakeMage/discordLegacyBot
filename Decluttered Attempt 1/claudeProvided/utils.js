// utils.js - Shared utility functions
const Canvas = require('canvas');
const path = require('path');
var GameData = require("G:/LegacyBotDiscord/Decluttered Attempt 1/data.js").GameData;
const Classes = require("G:/LegacyBotDiscord/Decluttered Attempt 1/data.js").Classes;

// Function to load a tile texture
async function loadTileTexture(layer, textureName) {
  // Create a unique key for the cache
  const cacheKey = `${textureName}`;
  
  // Check if tile is already cached
  if (global.tileCache[cacheKey]) {
    return global.tileCache[cacheKey];
  }

  // Path to tile textures folder (organized by layer)
  const tilePath = path.join(__dirname, `../tiles/${layer}/${textureName}.png`);
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
    const defaultTile = await Canvas.loadImage(`G:/LegacyBotDiscord/Decluttered Attempt 1/tiles/${layer}/default.png`);
    return defaultTile;
  }
}

// Function to generate a layered grid image from multiple 2D arrays with different scales
async function GenerateGameGridImage(game, layer) {
  const tileSize = 400;

  // Base canvas dimensions (determined by the environment layer)
  const baseGridHeight = GameData[game][0][layer].length;
  const baseGridWidth = GameData[game][0][layer][0].length;
  
  const canvasWidth = baseGridWidth * tileSize;
  const canvasHeight = baseGridHeight * tileSize;
  
  // Create a canvas
  const canvas = Canvas.createCanvas(canvasWidth, canvasHeight);
  const context = canvas.getContext('2d');
  
  // Fill background (optional)
  context.fillStyle = '#222222';
  context.fillRect(0, 0, canvasWidth, canvasHeight);

  
  // Process each tile in the grid
  
  for (x in GameData[game][0][layer]) {
    for(y in GameData[game][0][layer][x]) {
      const tileType = GameData[game][0][layer][x][y][0];
      const tilePlayers = GameData[game][0][layer][x][y][1];
      const tileTrapped = GameData[game][0][layer][x][y][2];
      const tileImage = await loadTileTexture("enviornment", tileType);
      //draw the environment
      context.drawImage(
        tileImage,
        canvasWidth,
        canvasHeight,
        1,
        1,
      )
      //then the players
      for (player in tilePlayers) {
        const playerImage = await loadTileTexture("players", tilePlayers[player][0]);
        context.drawImage(
          playerImage,
          canvasWidth,
          canvasHeight,
          0.25,
          0.25,
        )
      }
      //then the mines
      if (tileTrapped) {
        const mineImage = await loadTileTexture("mines", "Mine");
        context.drawImage(
          mineImage,
          canvasWidth,
          canvasHeight,
          1,
          1,
        )
      }
    }
  }
  return canvas.toBuffer();
}

async function GenerateObscuredGameGridImage(game, layer) {
  const tileSize = 400;

  // Base canvas dimensions (determined by the environment layer)
  const baseGridHeight = GameData[game][0][layer].length;
  const baseGridWidth = GameData[game][0][layer][0].length;
  
  const canvasWidth = baseGridWidth * tileSize;
  const canvasHeight = baseGridHeight * tileSize;
  
  // Create a canvas
  const canvas = Canvas.createCanvas(canvasWidth, canvasHeight);
  const context = canvas.getContext('2d');
  
  // Fill background (optional)
  context.fillStyle = '#222222';
  context.fillRect(0, 0, canvasWidth, canvasHeight);

  
  // Process each tile in the grid
  
  for (x in GameData[game][0][layer]) {
    for(y in GameData[game][0][layer][x]) {
      const tileType = GameData[game][0][layer][x][y][0];
      const tilePlayers = GameData[game][0][layer][x][y][1];
      const tileImage = await loadTileTexture(layer, tileType);
      //draw the environment
      context.drawImage(
        tileImage,
        canvasWidth,
        canvasHeight,
        1,
        1,
      )
      //then the players
      for (player in tilePlayers) {
        const playerImage = await loadTileTexture(layer, tilePlayers[player][0]);
        context.drawImage(
          playerImage,
          canvasWidth,
          canvasHeight,
          0.25,
          0.25,
        )
      }
    }
  }
  return canvas.toBuffer();
}

function findPlayerById(game, playerId) {
    for (player in GameData[game][1]) {
      if (GameData[game][1][players][0] == playerId) {
        return GameData[game][1][player];
    }
  }
  console.error("Player with id " + playerId + " not found");
  return null;
}

function getTile(game, layer, x, y) {
  return GameData[game][0][layer][y][x];
}

function setTileType(game, layer, x, y, tileType) {
  switch(tileType) {
    case "Void":
      GameData[game][0][layer][y][x][0] = "Void";
      break;
    case "Blank1":
      GameData[game][0][layer][y][x][0] = "Blank1";
      break;
    case "Blank2":
      GameData[game][0][layer][y][x][0] = "Blank2";
      break;
    case "Fire":
      GameData[game][0][layer][y][x][0] = "Fire";
      break;
    case "Ice":
      GameData[game][0][layer][y][x][0] = "Ice";
      break;
    case "Storm":
      GameData[game][0][layer][y][x][0] = "Storm";
      break;
    case "Gateway":
      GameData[game][0][layer][y][x][0] = "Gateway";
      break;
    case "Bush":
      GameData[game][0][layer][y][x][0] = "Bush";
      break;
    case "Chest":
      GameData[game][0][layer][y][x][0] = "Chest";
      break;
    case "Heal":
      GameData[game][0][layer][y][x][0] = "Heal";
      break;
    case "lockedGateway":
      GameData[game][0][layer][y][x][0] = "lockedGateway";
      break;
    case "Smoke":
      GameData[game][0][layer][y][x][0] = "Smoke";
      break;
    case "Wall":
      GameData[game][0][layer][y][x][0] = "Wall";
      break;
    default:
      console.error("Invalid tile type: " + tileType);
      break;
  }
}

function getPlayersByTile(game, layer, x, y) {
  var playersInTile = [];
  for (players in getTile(game, layer, x, y)[1]) {
    playersInTile.push(players);
  }
  return playersInTile;
}

function getPlayersByClass(game, classType) {

  //Class type validation
  var ClassNames = [];
  for (let i = 0; i < Classes.length; i++) {
    ClassNames.push(Classes[i][0]);
  }
  if (!ClassNames.includes(classType)) {
    console.error("Invalid class type: " + classType);
    return null;
  }

  //Get players
  var playersWithClass = [];
  for (player in GameData[game][1]) {
    if (GameData[game][1][player][10] == classType) {
      if (playersWithClass.length > 2){
        console.error("Too many players with class: " + classType);
      }
      return playersWithClass;
    }
    else {
      console.log("[INFO] tile: " + getTile(game, layer, x, y)[1][player] + "is empty");
      return null;
    }
  }
}

function getDeadPlayers(game) {
  var deadPlayers = [];
  for (player in GameData[game][1]) {
    if (GameData[game][1][player][11] == true) {
      deadPlayers.push(player);
    }
  }
  return deadPlayers;
}

function getPlayersByValue(game, valueIndex, value) {
  var returnedPlayers = [];
  for (player in GameData[game][1]) {
    if (GameData[game][1][player][valueIndex] == value) {
      returnedPlayers.push(player);
    }
  }
  return returnedPlayers;
}


function verifyPlayer(player) {
  if (
    typeof(player[0]) == String
    && typeof(player[1]) == Number
    && typeof(player[2]) == Number
    && typeof(player[3]) == Number
    && typeof(player[4]) == Number
    && typeof(player[5]) == Number
    && typeof(player[6]) == Number
    && typeof(player[7]) == Number
    && typeof(player[8]) == Number
    && typeof(player[9]) == Number
    && typeof(player[10]) == Boolean
    && typeof(player[11]) == Number)  
    return true;
  else
    return false;
}

function getSpawnpointTile(game) {
  var randomTile = getRandomTile(game);
  console.log("[INFO] rolled tile: " + randomTile + " for a spawnpoint");
  if (randomTile[1].length < 4) {
    console.log("[INFO] tile: " + randomTile + " has 4 players and is full, rerolling...");
    getSpawnpointTile(game);
  }
  else {
    return randomTile;
  };
}

function registerPlayer(game, playerId) {
    var player = [playerId, 0, 12, 6, 12, 1, 6, 1, 2, -1, false, 0, 0, 4, 4, 12];
    var randomClass = getRandomInt(Classes.length);

    player[9] = randomClass;
    for (var i = 1; i < 9; i++) {
    player[i] = Classes[randomClass][i];
    }
    spawn = getSpawnpointTile(game)
    GameData[game][1].push(player);
    addPlayerToTile(player, spawn);
    console.log("[INFO] registering player: " + playerId + " with random class: " + randomClass + " and spawning at tile: " + spawn);
    return;
}

function setPlayerStat(game, playerId, statIndex, value) {
  var player = findPlayerById(game, playerId);
  player[statIndex] = value;
}

function addPlayerToTile(player, game, layer, x, y) {
  console.log("[INFO][VERBOSE] adding player: " + player + " to tile: " + tile);
  if(GameData[game][0][layer][y][x][1].length < 4) {
    GameData[game][0][layer][y][x][1].push(player);
  }
}

//returns the rounded x and y cordinates of tiles found on a line if it was drown from tileCord1 to tileCord2
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

function removePlayerFromTile(player, game, layer, x, y) {
  console.log("[INFO][VERBOSE] removing player: " + player[0] + " from tile: " + tile);
  GameData[game][0][layer][y][x][1].splice(tile[1].indexOf(player[0]), 1);
}

function getRandomInt(max) {
  return Math.round((Math.random()) * max);
}

function getRandomTile(game) {
  var randomLayer = getRandomInt(GameData[game][0].length);
  var randomX = getRandomInt(GameData[game][0][randomLayer][0].length);
  var randomY = getRandomInt(GameData[game][0][randomLayer].length);
  return getTile(game, randomLayer, randomX, randomY);
}

module.exports = {
  loadTileTexture,
  GenerateGameGridImage,
  GenerateObscuredGameGridImage,
  getTile,
  getTileCordinatesOfLine,
  getDirection,
  removePlayerFromTile,
  setPlayerStat,
  registerPlayer,
  verifyPlayer,
  getPlayersByValue,
  getDeadPlayers,
  setTileType,
  getPlayersByTile,
  getPlayersByClass,
  getRandomInt,
  getRandomTile,
};