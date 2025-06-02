const Sequelize = require('sequelize');
module.exports = function(sequelize, DataTypes) {
  return sequelize.define('Tiles', {
    Tile_ID: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    Layer_ID: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'Layers',
        key: 'Layer_ID'
      }
    },
    Tile_Type: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    Player1: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'Players',
        key: 'Player_ID'
      }
    },
    Player2: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'Players',
        key: 'Player_ID'
      }
    },
    Player3: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'Players',
        key: 'Player_ID'
      }
    },
    Player4: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'Players',
        key: 'Player_ID'
      }
    },
    X_Position: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    Y_Position: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    trapped: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: false
    }
  }, {
    tableName: 'Tiles',
    timestamps: false
  });
};
