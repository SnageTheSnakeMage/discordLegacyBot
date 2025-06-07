var DataTypes = require("sequelize").DataTypes;
var _Classes = require("./Classes");
var _Games = require("./Games");
var _Grids = require("./Grids");
var _Layers = require("./Layers");
var _Players = require("./Players");
var _Tiles = require("./Tiles");

function initModels(sequelize) {
  var Classes = _Classes(sequelize, DataTypes);
  var Games = _Games(sequelize, DataTypes);
  var Grids = _Grids(sequelize, DataTypes);
  var Layers = _Layers(sequelize, DataTypes);
  var Players = _Players(sequelize, DataTypes);
  var Tiles = _Tiles(sequelize, DataTypes);

  Players.belongsTo(Classes, { as: "Class", foreignKey: "Class_ID"});
  Classes.hasMany(Players, { as: "Players", foreignKey: "Class_ID"});
  Grids.belongsTo(Games, { as: "Game", foreignKey: "Game_ID"});
  Games.hasMany(Grids, { as: "Grids", foreignKey: "Game_ID"});
  Players.belongsTo(Games, { as: "Game_Game", foreignKey: "Game_ID"});
  Games.hasMany(Players, { as: "Players", foreignKey: "Game_ID"});
  Layers.belongsTo(Grids, { as: "Grid", foreignKey: "Grid_ID"});
  Grids.hasMany(Layers, { as: "Layers", foreignKey: "Grid_ID"});
  Layers.belongsTo(Layers, { as: "Layer_Below_Layer", foreignKey: "Layer_Below"});
  Layers.hasMany(Layers, { as: "Layers", foreignKey: "Layer_Below"});
  Layers.belongsTo(Layers, { as: "Layer_Above_Layer", foreignKey: "Layer_Above"});
  Layers.hasMany(Layers, { as: "Layer_Above_Layers", foreignKey: "Layer_Above"});
  Tiles.belongsTo(Layers, { as: "Layer", foreignKey: "Layer_ID"});
  Layers.hasMany(Tiles, { as: "Tiles", foreignKey: "Layer_ID"});
  Games.belongsTo(Players, { as: "LAST_CHEST_GIVER_Player", foreignKey: "LAST_CHEST_GIVER"});
  Players.hasMany(Games, { as: "Games", foreignKey: "LAST_CHEST_GIVER"});
  Tiles.belongsTo(Players, { as: "Player4_Player", foreignKey: "Player4"});
  Players.hasMany(Tiles, { as: "Player4_Tiles", foreignKey: "Player4"});
  Tiles.belongsTo(Players, { as: "Player3_Player", foreignKey: "Player3"});
  Players.hasMany(Tiles, { as: "Player3_Tiles", foreignKey: "Player3"});
  Tiles.belongsTo(Players, { as: "Player2_Player", foreignKey: "Player2"});
  Players.hasMany(Tiles, { as: "Player2_Tiles", foreignKey: "Player2"});
  Tiles.belongsTo(Players, { as: "Player1_Player", foreignKey: "Player1"});
  Players.hasMany(Tiles, { as: "Player1_Tiles", foreignKey: "Player1"});
  Players.belongsTo(Tiles, { as: "Tile_ID2_Tile", foreignKey: "Tile_ID2"});
  Tiles.hasMany(Players, { as: "Players", foreignKey: "Tile_ID2"});
  Players.belongsTo(Tiles, { as: "Tile", foreignKey: "Tile_ID"});
  Tiles.hasMany(Players, { as: "Players", foreignKey: "Tile_ID"});

  return {
    Classes,
    Games,
    Grids,
    Layers,
    Players,
    Tiles,
  };
}
module.exports = initModels;
module.exports.initModels = initModels;
module.exports.default = initModels;
