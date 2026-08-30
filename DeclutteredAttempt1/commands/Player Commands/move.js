const { SlashCommandBuilder } = require('discord.js');
const utils = require('../../utils');
var models = utils.models;
module.exports = {
  data: new SlashCommandBuilder()
    .setName('move')
    .setDescription('moves a player <distance> tiles in <direction>')
    .addStringOption(option =>
      option.setName('direction')
        .setDescription('which direction you are moving')
        .setRequired(true)
        .addChoices(
          { name: "left", value: "east" },
          { name: "right", value: "west" },
          { name: "up", value: "north" },
          { name: "down", value: "south" },
          { name: "nw", value: "northwest" },
          { name: "ne", value: "northeast" },
          { name: "sw", value: "southwest" },
          { name: "se", value: "southeast" }))
    .addIntegerOption(option =>
      option.setName('distance')
        .setDescription('how many tiles you move')
        .setRequired(true)
        .setMinValue(0))
    .addStringOption(option =>
          option.setName('path')
            .setDescription('a list of DIRections and DISTances Ex: "dir,dist;dir,dist;...", required to move on an ice tile')
            .setRequired(false))
    .addIntegerOption(option =>
      option.setName('body')
        .setDescription('(FOR TWIN CLASS) Which body you are trying to see, defaults to 1')
        .setMaxValue(2)
        .setMinValue(1)
        .setRequired(false))
    .addIntegerOption(option =>
      option.setName('game')
        .setDescription('which game, defaults to oldest active game')
        .setRequired(false)),
    

  async execute(interaction) {
    const logger200 = globalThis.CommandExecutionLogger.child({file: 'move.js'})
    await interaction.deferReply();
    try{

      //#region Verification
      if(!interaction.options.getInteger('game')) {
        var gameId = await utils.getOldestActiveGameId(interaction.user.id);
      }
      else {
        var gameId = interaction.options.getInteger('game');
      }

      const game = await models.Games.findByPk(gameId);

      const player = await models.Players.findOne({
        where: {
          Game_ID: gameId,
          Discord_ID: interaction.user.id,
        }
      });
     if (!player) {
        return interaction.editReply({ content: "Player not found in game!, please register for the game you wish to move in." });
      }
      const playerClass = await models.Classes.findByPk(player.Class_ID);

      const originalTile = await models.Tiles.findByPk(player.Tile_ID)
      if(interaction.options.getString('path') != null) {
        var verifiedPath = await this.verifyInputPath(interaction.options.getString('path'), originalTile.Layer_ID, originalTile.X_Position, originalTile.Y_Position);
      }

      // Determine which body to move (for Twin class)
      const bodyToMove = interaction.options.getInteger('body');

      if (bodyToMove === 2) {
        originalTile = await models.Tiles.findByPk(player.Tile_ID2);
      } else {
        originalTile = await models.Tiles.findByPk(player.Tile_ID);
      }

      if (!originalTile) {
        return interaction.editReply({ 
          content: "Current tile not found! please register, or ask a Dev about why your not on the board" 
        });
      }
      
      if(player.Dead){
        await interaction.editReply({ content: "Dead players can't use this command."});
        return
        }
      //#endregion Verification
      //#region Variables
      var iceTileDeduction = 0;
      const distance = interaction.options.getInteger('distance');

      let newX = originalTile.X_Position;
      let newY = originalTile.Y_Position;
      const direction = interaction.options.getString('direction');

      //Check if player is moving onto an ice tile at any time in their path or run
      //Also used to count the amount of tiles the player is moving for the movement cost calculation
      //Also used to find which tiles should be checked when doing the tile to tile movement updating
      var iceChecklistAndTileList

      var response = "";
      var lastStringAddedToResponse = "";
      var amountOfRepeats = 0;
      //#endregion Variables
      //Check Gamestate
      //TODO make sure all utils.checkGameState actually pass wether or not the player is a clockwatcher.
      if(await utils.checkGameState(game.GAME_STATE, playerClass.Class_Name == "Clockwatcher", interaction)){
        return
      }

      //#region Calculation of New Position
      if(interaction.options.getString('path') != null){
         for (run in this.verifyInputPath(direction, distance, this.inputPathToArray(interaction.options.getString('path')))) {
          this.calculateMovement(direction,distance,originalTile,player)
        }
      }
      else {
        this.calculateMovement(direction,distance,originalTile,player)
      }
      
      // Ensure coordinates don't go above max
      var currentLayer = await models.Layers.findByPk(originalTile.Layer_ID);
      newX = Math.min(currentLayer.X_Bound, newX);
      newY = Math.min(currentLayer.Y_Bound, newY);
//#endregion Calculation of New Position
      

      //iceChecklist represents all the cordinates of the tiles a player is moving onto
      interaction.options.getString('path') == null ? 
      iceChecklistAndTileList = utils.getTileCordinatesOfLine([originalTile.X_Position, originalTile.Y_Position], [newX, newY]) 
      : iceChecklistAndTileList = this.getTileCordinatesOfPath([originalTile.X_Position, originalTile.Y_Position], this.verifyInputPath(direction, distance, this.inputPathToArray(interaction.options.getString('path'))));
      for (cord in iceChecklistAndTileList) {
        var tile = await models.Tiles.findOne({
          where: {
            X_Position: iceChecklistAndTileList[cord][0],
            Y_Position: iceChecklistAndTileList[cord][1]
          }
        });
        if(tile.Tile_Type == "Ice") {
          iceTileDeduction++;
        }
        if(cord == iceChecklistAndTileList.length && tile.Tile_Type == "Ice" && playerClass.Class_Name != "Snowman") {
          throw "Cannot end a movement on an ice tile, please either provide a path that moves off the ice, or move onto a non-ice tile.";
        }
      }
      var spentAP
      if(playerClass.Class_Name == "Glutton") {
        spentAP = (2 * game.moveCost) * (iceChecklistAndTileList.length - (iceTileDeduction + player.Free_Move));
      }
      else {
        spentAP = game.moveCost * (iceChecklistAndTileList.length - (iceTileDeduction + player.Free_Move));
      }

      // Check if player has enough action points
      if (player.Action_Points < spentAP) {
        throw "Player does not enough action points for movement requested.";
      }


      try {
        for (cord in iceChecklistAndTileList) {
          var cur_Tile = await models.Tiles.findOne({where: {X_Position: iceChecklistAndTileList[cord][0], Y_Position: iceChecklistAndTileList[cord][1], Layer_ID: originalTile.Layer_ID}});
          var nxt_Tile = await models.Tiles.findOne({where: {X_Position: iceChecklistAndTileList[cord + 1][0], Y_Position: iceChecklistAndTileList[cord + 1][1], Layer_ID: originalTile.Layer_ID}});
          if(lastStringAddedToResponse != `You moved from a ${cur_Tile.Tile_Type} tile to a ${nxt_Tile.Tile_Type} tile! \n`){
            if(nxt_Tile.trapped){
              response += `You moved from a ${cur_Tile.Tile_Type} tile to a ${nxt_Tile.Tile_Type} tile IT WAS TRAPPED took ${game.mineDmg}! \n`
            }
            else{
              response += `You moved from a ${cur_Tile.Tile_Type} tile to a ${nxt_Tile.Tile_Type} tile! \n`;
            }
            lastStringAddedToResponse = `You moved from a ${cur_Tile.Tile_Type} tile to a ${nxt_Tile.Tile_Type} tile! \n`;
            amountOfRepeats = 1;
          }
          else{
            response += `x${amountOfRepeats + 1} \n`;
          }
          // for some reason holds the trapped tile damage logic
          this.moveFromTiletoTile(cur_Tile, nxt_Tile, player, bodyToMove == 2, game);
        }

        // Add player to new tile
        await this.setPlayerToTile(
          player.Player_ID, 
          originalTile.Layer_ID, 
          newX, 
          newY
        );

        // Deduct action points & update free movement
        await models.Players.update(
          { Action_Points: player.Action_Points - spentAP, Free_Move: Math.min(player.Free_Move - (iceChecklistAndTileList.length - (iceTileDeduction + player.Free_Move)), 0) } , 
          {where: {
           Discord_ID: interaction.user.id,
            Player_ID: player.Player_ID,
            Game_ID: gameId
          }}
        );

        //finalize and send the response
        await interaction.editReply({ 
          content: response
        });

        //if player is a spy delete their action logs after 3 seconds
        if(playerClass.Class_Name == "Spy") {
          await utils.delay(3000);
          await interaction.deleteReply();
        }

      } catch (error) {
        logger200.error({function: "execute"}, `Error moving player: ${error}`);
        await interaction.editReply({ 
          content: response + error.message 
        });
      }
  }
  catch (error) {
    logger200.error({function: "execute"}, `Error executing move command: ${error}`);
    await interaction.reply({ 
      content: `Error: ${error.message}`, 
      ephemeral: true 
    });
  }},

  async calculateMovement(direction, distance, originalTile, player){
    var newX = originalTile.X_Position
    var newY = originalTile.Y_Position
    switch (direction) {
      case 'west':
        newX -= distance;
        var endTile = await models.Tiles.findOne({where: {X_Position: newX, Y_Position: originalTile.Y_Position, Layer_ID: originalTile.Layer_ID}})
        
        break;
      case 'east':
        newX += distance;
        var endTile = await models.Tiles.findOne({where: {X_Position: newX, Y_Position: originalTile.Y_Position, Layer_ID: originalTile.Layer_ID}})
        
        break;
      case 'north':
        newY += distance;
        var endTile = await models.Tiles.findOne({where: {X_Position: originalTile.X_Position, Y_Position: newY, Layer_ID: originalTile.Layer_ID}})
        
        break;
      case 'south':
        newY -= distance;
        var endTile = await models.Tiles.findOne({where: {X_Position: originalTile.X_Position, Y_Position: newY, Layer_ID: originalTile.Layer_ID}})
        
        break;
      case 'northeast':
        newX += distance;
        newY += distance;
        var endTile = await models.Tiles.findOne({where: {X_Position: newX, Y_Position: newY, Layer_ID: originalTile.Layer_ID}})
        
        break;
      case 'northwest':
        newX -= distance;
        newY += distance;
        var endTile = await models.Tiles.findOne({where: {X_Position: newX, Y_Position: newY, Layer_ID: originalTile.Layer_ID}})
        
        break;
      case 'southeast':
        newX += distance;
        newY -= distance;
        var endTile = await models.Tiles.findOne({where: {X_Position: newX, Y_Position: newY, Layer_ID: originalTile.Layer_ID}})
        
        break;
      case 'southwest':
        newX -= distance;
        newY -= distance;
        var endTile = await models.Tiles.findOne({where: {X_Position: newX, Y_Position: newY, Layer_ID: originalTile.Layer_ID}})
        
        break;
      default:
        throw "Invalid direction, contact snage as this should not be possible.";
    }
    this.moveFromTiletoTile(originalTile,endTile,player.Player_ID, bodyToMove == 2)
  },

  async movePlayerToRandomSurroundingTile(playerId, layer, x, y) {
    var randomDirection = this.getRandomInt(7);
    var player = await models.Players.findByPk(playerId);
    var playerClass = await models.Classes.findByPk(player.Class_ID);
    var tile = await models.Tiles.findAll({where: {Layer_ID: layer, X_Position: x, Y_Position: y}});
    var newTile;
    switch(randomDirection) {
      case 0:
        // West
        newTile = await models.Tiles.findAll({where: {Layer_ID: layer, X_Position: x - 1, Y_Position: y}});
        this.moveFromTiletoTile(tile, layer, x - 1, y);
        break;
      case 1:
        // Southwest
        newTile = await models.Tiles.findAll({where: {Layer_ID: layer, X_Position: x - 1, Y_Position: y + 1}});
       this.moveFromTiletoTile(tile, layer, x - 1, y + 1);
        break;
      case 2:
        // South
        newTile = await models.Tiles.findAll({where: {Layer_ID: layer, X_Position: x, Y_Position: y + 1}});
       this.moveFromTiletoTile(tile, layer, x, y + 1);
        break;
      case 3:
        // Southeast
        newTile = await models.Tiles.findAll({where: {Layer_ID: layer, X_Position: x + 1, Y_Position: y + 1}});
       this.moveFromTiletoTile(tile, layer, x + 1, y + 1);
        break;
      case 4:
        // East
        newTile = await models.Tiles.findAll({where: {Layer_ID: layer, X_Position: x + 1, Y_Position: y}});
       this.moveFromTiletoTile(tile, layer, x + 1, y);
        break;
      case 5:
        // Northeast
        newTile = await models.Tiles.findAll({where: {Layer_ID: layer, X_Position: x + 1, Y_Position: y - 1}});
       this.moveFromTiletoTile(tile, layer, x + 1, y - 1);
        break;
      case 6:
        // North
        newTile = await models.Tiles.findAll({where: {Layer_ID: layer, X_Position: x, Y_Position: y - 1}});
       this.moveFromTiletoTile(tile, layer, x, y - 1);
        break;
      case 7:
        // Northwest
        newTile = await models.Tiles.findAll({where: {Layer_ID: layer, X_Position: x - 1, Y_Position: y - 1}});
       this.moveFromTiletoTile(tile, layer, x - 1, y - 1);
        break;
      default:
        logger200.error({function: "movePlayerToRandomSurroundingTile"}, "Invalid random direction from derived random number: " + randomDirection);
        break;
    }
    //make sure the storm tile doesnt put them on a tile they usually couldnt move onto
    if(playerClass.Class_Name != "Cloudborn"){
      if(newTile.Tile_Type == "Wall" || newTile.Tile_Type == "Wall_Damaged" || newTile.Tile_Type == "Void" || newTile.Tile_Type == "Ice") {
        this.movePlayerToRandomSurroundingTile(playerId, layer, x, y);
      }
    }
  },
  //for checking all the things that happen when a player moves onto an off of a tile,
//  returns wether they player moved or not
// secondBody is nullable boolean
async moveFromTiletoTile(startTile, endTile, player, secondBody, game) {
  const logger200 = globalThis.CommandExecutionLogger.child({file: 'move.js', function: "moveFromTiletoTile"})
  if(game == null){
    game = await models.Games.findByPk(player.Game_ID)
  }
  if(secondBody == null || !secondBody){
      switch(startTile.Tile_Type) {
        //Player takes damage from leaving fire tile
        case "Fire":
          await models.Players.update({Health_Points: player.Health_Points - game.fireDmg},{ where: {Player_ID: player.Player_ID}})
          await utils.playerDeathLogic(null, player);
          break;
        //Player destroys smoke tile by moving off of it
        case "Smoke":
          await utils.revertTileToBlank(startTile);
          break;
        default:
          break;
    }
    switch(endTile.Tile_Type) {
      //Player takes damage from entering fire tile
        case "Fire":
          await models.Players.update({Health_Points: player.Health_Points - game.fireDmg},{ where: {Player_ID: player.Player_ID}})
          await utils.playerDeathLogic(null, player);
          break;
      //Player must be moved randomly from entering storm tile
      //Every time a Stormchaser moves onto a storm tile they...
      //Every time a Robot moves onto a storm tile they...
        case "Storm":
          //Robot gainst 1 HP
          if(player.Class_ID == 19){
            await models.Players.update({Health_Points: player.Health_Points + 1}, {where: {Player_ID: player.Player_ID}})
          }
          //Stormchaser gains 1d4-2 AP
          if(player.Class_ID == 15) {
            await models.Players.update({Action_Points: player.Action_Points + (utils.getRandomInt(3) - 1)},{ where: {Player_ID: player.Player_ID}})
          }
          //Player is moved in a random direction once
          await this.movePlayerToRandomSurroundingTile(player.Player_ID, startTile.Layer_ID, startTile.X_Position, startTile.Y_Position);
          break;
        case "Void":
        case "Wall":
        case "Wall_Damaged":
        //Check if player can move on these tiles(Currently they MUST be a clowdborn in order to) 
          if(!player.Class_ID == 6) {
              logger200.error("Player " + player.Discord_ID + " cannot move onto void, wall or wall damaged tiles");
              throw "[ERROR] Player " + player.Discord_ID + " cannot move onto void wall or wall damaged tiles";
          }
          break;
        default:
          break;
    }
    
    if(endTile.trapped) {
      //Get trapper
      const trapper = await models.Players.findByPk(endTile.trapper);
      if(!trapper) {
        logger200.error(`Player: ${player} stepped on Tile: ${endTile} which was trapped but did not have a trapper`)
        throw new Error("Mine without trapper found. Please contact snage.");
      }
      var mineDmg = game.mineDmg
      logger200.debug(`getting amount of damage to deal from stepping on a mine, got: ${mineDmg}`)
      //Damage player
      logger200.debug(`damaging player: ${player} and setting their HP to ${player.Health_Points - mineDmg}`)
      await models.Players.update({Health_Points: player.Health_Points - mineDmg}, {where: {Player_ID: player.Player_ID}});
      await utils.playerDeathLogic(trapper, player);
      //Remove trap
      logger200.debug(`removing trapped status and trapper player foriegn key from tile ${endTile.Tile_ID}`)
      await models.Tiles.update({trapped: false, trapper: null}, {where: {Tile_ID: endTile.Tile_ID}});
    }
  }
  else{
    switch(startTile.Tile_Type) {
      //Player takes damage from leaving fire tile
      case "Fire":
        await models.Players.update({Health_Points2: player.Health_Points2 - fireDmg},{ where: {Player_ID: player.Player_ID}})
        await utils.playerDeathLogic(null, player);
        break;
      //Player destroys smoke tile by moving off of it
      case "Smoke":
        await utils.revertTileToBlank(startTile);
        break;
      default:
        break;
  }
  switch(endTile.Tile_Type) {
    //Player takes damage from entering fire tile
      case "Fire":
        await models.Players.update({Health_Points2: player.Health_Points2 - fireDmg},{ where: {Player_ID: player.Player_ID}})
        await utils.playerDeathLogic(null, player);
        break;
    //Player must be moved randomly from entering storm tile
    //Every time a Stormchaser moves onto a storm tile they...
    //Every time a Robot moves onto a storm tile they...
      case "Storm":
        //Robot gainst 1 HP
        if(player.Class_ID == 19){
          await models.Players.update({Health_Points2: player.Health_Points2 + 1}, {where: {Player_ID: player.Player_ID}})
        }
        //Stormchaser gains 1d4-2 AP
        if(player.Class_ID == 15) {
          await models.Players.update({Action_Points: player.Action_Points + (this.getRandomInt(3) - 1)},{ where: {Player_ID: player.Player_ID}})
        }
        //Player is moved in a random direction once
        await this.movePlayerToRandomSurroundingTile(player.Player_ID, startTile.Layer_ID, startTile.X_Position, startTile.Y_Position);
        break;
      case "Void":
      case "Wall":
      case "Wall_Damaged":
      //Check if player can move on these tiles(Currently they MUST be a clowdborn in order to) 
        if(!player.Class_ID == 6) {
            logger200.error({function: "moveFromTileToTile"},"Player " + player.Discord_ID + " cannot move onto void, wall or wall damaged tiles");
            throw "[ERROR] Player " + player.Discord_ID + " cannot move onto void wall or wall damaged tiles";
        }
        break;
      default:
        break;
  }
  
  if(endTile.trapped) {
    //Get trapper
    const trapper = await models.Players.findByPk(endTile.trapper);
    if(!trapper) {
      //TODO fix logging and make proper logs and errors
      throw new Error("Mine without trapper found. Please contact snage.");
    }
    //Damage player
    await models.Players.update({Health_Points2: player.Health_Points2 - mineDmg}, {where: {Player_ID: player.Player_ID}});
    await utils.playerDeathLogic(trapper, player);
    //Remove trap
    await models.Tiles.update({trapped: false, trapper: null}, {where: {Tile_ID: endTile.Tile_ID}});
  }
  }
},


//turns a path([[direction, distance]]) into an array of [[x, y]] of each tile where the direction changes
// mainly used for generating a cordinate array for getTileCordinatesOfPath
//path takes in a result of inputPathToArray
//startingTile takes in an array of [x, y] of where the path starts
 pathToTiles(startingTile, path) {
  var tiles = [];
  //add the starting tile
  tiles.push([startingTile.X_Position, startingTile.Y_Position]);
  for (var run in path){
    //find where the next tile is and add its cordinates to the array
    //case "direction":
    //  destination = [x +/- distance, y +/- distance];
    //  break;
    //tiles.push(destination);
      switch(path[run][0]){
        case "left":
        case "w":
          var destination = [startingTile.X_Position - parseInt(path[run][1]), startingTile.Y_Position];
          break;
        case "right":
        case "e":
          var destination = [startingTile.X_Position + parseInt(path[run][1]), startingTile.Y_Position];
          break;
        case "up":
        case "n":
          var destination = [startingTile.X_Position, startingTile.Y_Position - parseInt(path[run][1])];
          break;
        case "down":
        case "s":
          var destination = [startingTile.X_Position, startingTile.Y_Position + parseInt(path[run][1])];
          break;
        case "nw":
          var destination = [startingTile.X_Position - parseInt(path[run][1]), startingTile.Y_Position - parseInt(path[run][1])];
          break;
        case "ne":
          var destination = [startingTile.X_Position + parseInt(path[run][1]), startingTile.Y_Position - parseInt(path[run][1])];
          break;
        case "sw":
          var destination = [startingTile.X_Position - parseInt(path[run][1]), startingTile.Y_Position + parseInt(path[run][1])];
          break;
        case "se":
          var destination = [startingTile.X_Position + parseInt(path[run][1]), startingTile.Y_Position + parseInt(path[run][1])];
          break;
        default:
          throw "Invalid input path, your are using a direction that isnt: left,w,right,e,up,n,down,s,nw,ne,sw, or se contact snage as this should not be possible.";
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
  var tiles = this.pathToTiles(startingTile, path);
  var returnedTiles = []
  for (var tile in tiles) {
    returnedTiles.push(utils.getTileCordinatesOfLine(tiles[tile], tiles[tile + 1]));
  }
  return returnedTiles
},
//turns the string into a proper path array
//[[direction, distance]]
//direction: left, right, up, down, nw, ne, sw, se
//distance: number
//TODO write test for this
inputPathToArray(inputPath){
  const logger200 = globalThis.CommandExecutionLogger.child({file: 'move.js', function: "inputPathToArray"})
  logger200.debug(`turned string ${inputPath} into the array: ${inputPath.split(';').map(row => row.split(',')).toString()}`)
  return inputPath.split(';').map(row => row.split(','));
},

//TODO write test for this
async verifyInputPath(inputPath, layerId, startingTileXPosition, startingTileYPosition){
  const logger200 = globalThis.CommandExecutionLogger.child({file: 'move.js', function: "verifyInputPath"})
  var regex =  /^((?:left|right|up|down|ne|nw|se|sw),\d+;)+$/;
  var result = regex.test(inputPath);
  logger200.debug(`regular expression test came back: ${result}`)
  if(result){
    var path = this.inputPathToArray(inputPath);
    var destination = [startingTileXPosition, startingTileYPosition];
    logger200.debug(`set path to: ${path.toString()} and destination to: ${destination.toString()}`)
    for (var run in path){
      logger200.debug(`ran loop with run: ${run} in path: ${path}`)
      switch(path[run][0]){
        case "left":
        case "w":
          var tileCheck = await models.Tiles.findOne({where: 
            {
              Layer_ID: layerId,
              X_Position: startingTileXPosition - parseInt(path[run][1]),
              Y_Position: startingTileYPosition
            }}) == null
          if(tileCheck) {
            logger200.error(`Invalid input path, your path goes to a nonexistent tile or a tile your path goes on could not be found. If you think this is a mistake contact snage.`)
            throw "Invalid input path, your path goes to a nonexistent tile or a tile your path goes on could not be found. If you think this is a mistake contact snage."
          }
          destination = [startingTileXPosition - parseInt(path[run][1]), startingTileYPosition];
          break;
        case "right":
        case "e":
          var tileCheck = await models.Tiles.findOne({where: 
            {
              Layer_ID: layerId,
              X_Position: startingTileXPosition + parseInt(path[run][1]),
              Y_Position: startingTileYPosition
            }}) == null
          if(tileCheck) {
            logger200.error(`Invalid input path, your path goes to a nonexistent tile or a tile your path goes on could not be found. If you think this is a mistake contact snage.`)
            throw "Invalid input path, your path goes to a nonexistent tile or a tile your path goes on could not be found. If you think this is a mistake contact snage."
          }
          destination = [startingTileXPosition + parseInt(path[run][1]), startingTileYPosition];
          break;
        case "up":
        case "n":
          var tileCheck = await models.Tiles.findOne({where: 
            {
              Layer_ID: layerId,
              X_Position: startingTileXPosition,
              Y_Position: startingTileYPosition - parseInt(path[run][1])
            }}) == null
          if(tileCheck) {
            logger200.error(`Invalid input path, your path goes to a nonexistent tile or a tile your path goes on could not be found. If you think this is a mistake contact snage.`)
            throw "Invalid input path, your path goes to a nonexistent tile or a tile your path goes on could not be found. If you think this is a mistake contact snage."
          }
          destination = [startingTileXPosition, startingTileYPosition - parseInt(path[run][1])];
          break;
        case "down":
        case "s":
          var tileCheck = await models.Tiles.findOne({where: 
            {
              Layer_ID: layerId,
              X_Position: startingTileXPosition,
              Y_Position: startingTileYPosition + parseInt(path[run][1])
            }}) == null
          if(tileCheck) {
            logger200.error(`Invalid input path, your path goes to a nonexistent tile or a tile your path goes on could not be found. If you think this is a mistake contact snage.`)
            throw "Invalid input path, your path goes to a nonexistent tile or a tile your path goes on could not be found. If you think this is a mistake contact snage."
          }
          destination = [startingTileXPosition, startingTileYPosition + parseInt(path[run][1])];
          break;
        case "nw":
          var tileCheck = await models.Tiles.findOne({where: 
            {
              Layer_ID: layerId,
              X_Position: startingTileXPosition - parseInt(path[run][1]),
              Y_Position: startingTileYPosition - parseInt(path[run][1])
            }}) == null
          if(tileCheck) {
            logger200.error(`Invalid input path, your path goes to a nonexistent tile or a tile your path goes on could not be found. If you think this is a mistake contact snage.`)
            throw "Invalid input path, your path goes to a nonexistent tile or a tile your path goes on could not be found. If you think this is a mistake contact snage."
          }
          destination = [startingTileXPosition - parseInt(path[run][1]), startingTileYPosition - parseInt(path[run][1])];
          break;
        case "ne":          
          var tileCheck = await models.Tiles.findOne({where: 
            {
              Layer_ID: layerId,
              X_Position: startingTileXPosition + parseInt(path[run][1]),
              Y_Position: startingTileYPosition - parseInt(path[run][1])
            }}) == null
          if(tileCheck) {
            logger200.error(`Invalid input path, your path goes to a nonexistent tile or a tile your path goes on could not be found. If you think this is a mistake contact snage.`)
            throw "Invalid input path, your path goes to a nonexistent tile or a tile your path goes on could not be found. If you think this is a mistake contact snage."
          }
          destination = [startingTileXPosition + parseInt(path[run][1]), startingTileYPosition - parseInt(path[run][1])];
          break;
        case "sw":
          var tileCheck = await models.Tiles.findOne({where: 
            {
              Layer_ID: layerId,
              X_Position: startingTileXPosition - parseInt(path[run][1]),
              Y_Position: startingTileYPosition + parseInt(path[run][1])
            }}) == null
          if(tileCheck) {
            logger200.error(`Invalid input path, your path goes to a nonexistent tile or a tile your path goes on could not be found. If you think this is a mistake contact snage.`)
            throw "Invalid input path, your path goes to a nonexistent tile or a tile your path goes on could not be found. If you think this is a mistake contact snage."
          }
          destination = [startingTileXPosition - parseInt(path[run][1]), startingTileYPosition + parseInt(path[run][1])];
          break;
        case "se":
          //TODO double check that south is positive everywhere
          var tileCheck = await models.Tiles.findOne({where: 
            {
              Layer_ID: layerId,
              X_Position: startingTileXPosition + parseInt(path[run][1]),
              Y_Position: startingTileYPosition + parseInt(path[run][1])
            }}) == null
          if(tileCheck) {
            logger200.error(`Invalid input path, your path goes to a nonexistent tile or a tile your path goes on could not be found. If you think this is a mistake contact snage.`)
            throw "Invalid input path, your path goes to a nonexistent tile or a tile your path goes on could not be found. If you think this is a mistake contact snage."
          }
          destination = [startingTileXPosition + parseInt(path[run][1]), startingTileYPosition + parseInt(path[run][1])];
          break;
        default:
          logger200.error(`direction was out of bounds of the direction enum, throwing error`)
          throw "Invalid input path, your are using a direction that isnt: left,right,up,down,nw,ne,sw, or se";
      }
      logger200.debug(`set destination to: ${destination.toString()}`)
    }
  await models.Layers.findByPk(layerId).then((curLayer) => {
    if(curLayer.X_Bound < destination[0] || curLayer.Y_Bound < destination[1]) result = false;
   })
  }
  if(!result){
    throw "Invalid input path, make sure your path uses a direction(left,right,up,down,nw,ne,sw,se) then a comma(,) and a number separated & ended by a semicolon(;). Also make sure it doesnt take you off the layer you are currently on. For example: \'sw,2;n,1;\' and \'up,2;e,1;\' are valid as long as they do not move to a tile that doesn't exist";
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
//Claude Provided Move Command Function Refactors
async  validateAndParseMoveCommandInput(interaction) {
  // Gather all inputs with clear defaults
  const gameId = interaction.options.getInteger('game') || await utils.getOldestActiveGameId(interaction.user.id);
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
  const currentTileId = bodyToMove === 2 ? player.Tile_ID2 : player.Tile_ID;
  const currentTile = await models.Tiles.findByPk(currentTileId);
  
  if (!currentTile) {
    throw new Error("Current tile not found! Please register, or ask a Dev about why you're not on the board");
  }
  
  // Validate path format if provided
  if (inputtedPath) {
    await this.verifyInputPath(inputtedPath, currentTile.Layer_ID, currentTile.X_Position, currentTile.Y_Position);
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
};