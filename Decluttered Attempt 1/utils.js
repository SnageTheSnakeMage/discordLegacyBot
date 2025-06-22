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
//returns an array of directions and distances
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
    allLayerSight =await models.Classes.findOne({
      where: {
        Class_Name: {
          [Op.or]: [
            "Oracle"
          ]
        },
        Class_ID: player.Class_ID
      }}) != null ? true : false;
    
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
}

//adds a player to a game and downloads their playerIcon to be used for GenerateGameGridImagewithSight 
async function registerPlayer(game, playerId, playerIcon) {
    if(await models.Players.count({where: {Discord_ID: playerId}}) > 0) return;
    var SelectedClass = getRandomClass(game);
    var spawn = getSpawnpointTile(game)
    setPlayerToTile(player, spawn);
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
      setPlayerToTile(playerId, layer, x - 1, y);
      break;
    case 1:
      // Southwest
      setPlayerToTile(playerId, layer, x - 1, y + 1);
      break;
    case 2:
      // South
      setPlayerToTile(playerId, layer, x, y + 1);
      break;
    case 3:
      // Southeast
      setPlayerToTile(playerId, layer, x + 1, y + 1);
      break;
    case 4:
      // East
      setPlayerToTile(playerId, layer, x + 1, y);
      break;
    case 5:
      // Northeast
      setPlayerToTile(playerId, layer, x + 1, y - 1);
      break;
    case 6:
      // North
      setPlayerToTile(playerId, layer, x, y - 1);
      break;
    case 7:
      // Northwest
      setPlayerToTile(playerId, layer, x - 1, y - 1);
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

async function setPlayerToTile(playerId, layer, x, y) {
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
  if (playerID) {
    var players = await models.Players.findAll({where: {Discord_ID: playerID}, attributes: ["Game_ID"]});
  var games = await models.Games.findAll({where: {
    GAME_STATE: {
      [Op.or]: [GAMESTATES.ACTIVE, GAMESTATES.TIMESTOPPED]
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
}

async function getOldestGamestateGameId(playerID, gamestate) {
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


//Claude Provided Move Command Function Refactors
async function validateAndParseMoveCommandInput(interaction) {
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
}

async function calculateMovement(moveRequest) {
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
  addPlayerToTile: setPlayerToTile,
  getSpawnpointTile,
  getRandomClass,
  moveFromTiletoTile,
  commandResolutionErrorThrower,
  verifyinputPath,
  addStartToPathArray,
  getOldestActiveGameId,
  getTileCordinatesOfPath,
  inputPathToArray,
  validateAndParseMoveCommandInput,
  calculateMovement,
  getOldestGamestateGameId,
  GAMESTATES,
  models,
};