// utils.js - Shared utility functions
const Canvas = require('canvas');
const path = require('path');
var GameData = require("../Decluttered Attempt 1/data.js");
const Classes = require("../Decluttered Attempt 1/data.js");

// Function to load a tile texture
async function loadTileTexture(layer, tileType) {
  // Create a unique key for the cache
  const cacheKey = `${tileType}`;
  
  // Check if tile is already cached
  if (global.tileCache[cacheKey]) {
    return global.tileCache[cacheKey];
  }

  // Path to tile textures folder (organized by layer)
  const tilePath = path.join(__dirname, `../tiles/enviorment/${tileType}.png`);
  console.log("[INFO] Loading tile texture:", tilePath);
  
  try {
    // Load the image
    const image = await Canvas.loadImage(tilePath);
    // Cache the texture
    global.tileCache[cacheKey] = image;
    return image;
  } catch (error) {
    console.error(`Failed to load tile texture ${tileType}:`, error);
    // Return a default texture or placeholder for the appropriate layer
    const defaultTile = await Canvas.loadImage("G:/LegacyBotDiscord/Decluttered Attempt 1/tiles/enviorment/default.png");
    return defaultTile;
  }
}

// Function to generate a layered grid image from multiple 2D arrays with different scales
async function generateLayeredGridFromArrays() {//(gridData, tileSize = 32) {
  // Extract grid dimensions from environment layer (base layer)
  // const environmentGrid = gridData[global.LAYERS.ENVIRONMENT] || [];
  // if (!environmentGrid.length) {
  //   throw new Error('Environment layer is required');
  // } 
  const tileSize = 100;
  // Base canvas dimensions (determined by the environment layer)
  const environmentGrid = [ ["Void", "Void", "Blank2", "Blank1", "Blank2", "Gateway", "Blank2", "Blank1", "Blank2", "Void", "Void"],
  ["Void", "Blank2", "Blank1", "Blank2", "Blank1", "Blank2", "Blank1", "Blank2", "Blank1", "Blank2", "Void"],
  ["Void", "Blank1", "Ice", "Ice", "Blank2", "Storm", "Blank2", "Fire", "Fire", "Blank1", "Void"],
  ["Void", "Blank2", "Ice", "Ice", "Blank1", "Storm", "Blank1", "Fire", "Fire", "Blank2", "Void"],
  ["Void", "Blank1", "Blank2", "Blank1", "Blank2", "Storm", "Blank2", "Blank1", "Blank2", "Blank1", "Void"],
  ["Void", "Blank2", "Storm", "Storm", "Storm", "Storm", "Storm", "Storm", "Storm", "Blank2", "Void"],
  ["Void", "Blank1", "Blank2", "Blank1", "Blank2", "Storm", "Blank2", "Blank1", "Blank2", "Blank1", "Void"],
  ["Void", "Blank2", "Fire", "Fire", "Blank1", "Storm", "Blank1", "Ice", "Ice", "Blank2", "Void"],
  ["Void", "Blank1", "Fire", "Fire", "Blank2", "Storm", "Blank2", "Ice", "Ice", "Blank1", "Void"],
  ["Void", "Blank2", "Blank1", "Blank2", "Blank1", "Blank2", "Blank1", "Blank2", "Blank1", "Blank2", "Void"],
  ["Void", "Void", "Blank2", "Blank1", "Blank2", "Gateway", "Blank2", "Blank1", "Blank2", "Void", "Void"] ]
  const baseGridHeight = environmentGrid.length;
  const baseGridWidth = environmentGrid[0].length;
  
  const canvasWidth = baseGridWidth * tileSize;
  const canvasHeight = baseGridHeight * tileSize;
  
  // Create a canvas
  const canvas = Canvas.createCanvas(canvasWidth, canvasHeight);
  const context = canvas.getContext('2d');
  
  // Fill background (optional)
  context.fillStyle = '#222222';
  context.fillRect(0, 0, canvasWidth, canvasHeight);
  
  // Process each layer in order (environment first, then mines, then players)
  const layerOrder = [environmentGrid]; //global.LAYERS.MINES, global.LAYERS.PLAYERS];
  
  for (const layer of layerOrder) {
    // if (!gridData[layer]) continue;
    
    // const layerGrid = gridData[layer].grid || gridData[layer];
    // const layerScale = gridData[layer].scale || 1;
    
    // Skip if the layer doesn't exist
    if (!layer.length) continue;
    
    // Calculate scaled tile size for this layer
    // const scaledTileSize = tileSize / layerScale;
    
    // Get the dimensions of this layer's grid
    const layerGridHeight = layer.length;
    const layerGridWidth = layer[0].length;
    
    // Draw each tile in the current layer
    for (let y = 0; y < layerGridHeight; y++) {
      for (let x = 0; x < layerGridWidth; x++) {
        const tileType = layer[y][x];
        console.log("[INFO] tileType: " + tileType);
        
        // Skip empty tiles (use -1 or null to indicate empty tile)
        if (tileType === -1 || tileType === null) continue;
        
        // Calculate the position on the canvas based on the scale
        const canvasX = (x * canvasWidth) / layerGridWidth;
        const canvasY = (y * canvasHeight) / layerGridHeight;
        
        // Load tile texture
        const tileImage = await loadTileTexture(layer, tileType);
        
        // Draw the tile with the scaled size
        context.drawImage(
          tileImage, 
          canvasX, 
          canvasY, 
          canvasWidth / layerGridWidth, 
          canvasHeight / layerGridHeight
        );
      }
    }
  }
  
  // Optionally add grid lines
  // if (gridData.showGrid) {
  //   context.strokeStyle = 'rgba(80, 80, 80, 0.5)';
    
  //   for (let y = 0; y <= baseGridHeight; y++) {
  //     context.beginPath();
  //     context.moveTo(0, y * tileSize);
  //     context.lineTo(canvasWidth, y * tileSize);
  //     context.stroke();
  //   }
    
  //   for (let x = 0; x <= baseGridWidth; x++) {
  //     context.beginPath();
  //     context.moveTo(x * tileSize, 0);
  //     context.lineTo(x * tileSize, canvasHeight);
  //     context.stroke();
  //   }
  // }
  
  return canvas.toBuffer();
}

// Function to parse layered grid data from a message
function parseLayeredGridData(content) {
  try {
    // For message commands
    if (typeof content === 'string') {
      // Remove command prefix and get the data part
      const dataText = content.substring(content.indexOf(' ') + 1);
      return JSON.parse(dataText);
    } 
    // For slash commands (already parsed)
    return content;
  } catch (error) {
    console.error('Failed to parse layered grid data:', error);
    throw new Error('Invalid grid format. Please use a valid JSON format with environment, mines, and players layers.');
  }
}

function findPlayerById(game, playerId) {
    for (players in GameData[game][1]) {
      if (GameData[game][1][players][0] == playerId) {
        return GameData[game][1][players];
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

function verifyTile(tile) {
  var tileTypes = ["Void", "Blank1", "Blank2", "Fire", "Ice", "Storm", "Gateway", "Bush", "Chest", "Heal", "lockedGateway", "Smoke", "Wall"];

  if (
    tileTypes.includes(tile[0]) 
    && tile[1].length == 4
    && typeof(tile[1][0]) == String
    && typeof(tile[1][1]) == String
    && typeof(tile[1][2]) == String
    && typeof(tile[1][3]) == String
    && typeof(tile[2]) == Boolean) {
    return true;
  }
  else if(!tileTypes.includes(tile[0])) {
    console.error("Invalid tile type: " + tile[0]);
    return false;
  }
  else if (tile[1].length != 4) {
    console.error("Invalid tile player array size: " + tile[1]);
    return false;
  }
  else if (typeof(tile[1][0]) != String || typeof(tile[1][1]) != String || typeof(tile[1][2]) != String || typeof(tile[1][3]) != String) {
    console.error("Invalid tile player array values: " + tile[1]);
    return false;
  }
  else if (typeof(tile[2]) != Boolean) {
    console.error("Invalid type for trapped? value: " + tile[2]);
    return false;
  }
  return false;
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

function addPlayerToTile(player, tile) {
  if (!verifyTile(tile)) {
    console.error("Invalid inputted tile: " + tile);
    return;
  }

  console.log("[INFO][VERBOSE] adding player: " + player[0] + " to tile: " + tile);
  tile[1].push(player[0]);
}

function removePlayerFromTile(player, tile) {
  //Bug Prevention
  if (!verifyTile(tile)) {
    console.error("Invalid inputted tile: " + tile);
    return;
  }
  if(!tile[1].includes(player[0])) {
    console.error("Player: " + player[0] + " not found in tile: " + tile);
    return;
  }
  if (player[0] == -1) {
    console.error("Player: " + player[0] + " not found in tile: " + tile);
    return;
  }

  console.log("[INFO][VERBOSE] removing player: " + player[0] + " from tile: " + tile);
  tile[1].splice(tile[1].indexOf(player[0]), 1);
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
  generateLayeredGridFromArrays,
  parseLayeredGridData
};