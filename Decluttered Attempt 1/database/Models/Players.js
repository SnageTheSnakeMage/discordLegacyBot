const Sequelize = require('sequelize');
module.exports = function(sequelize, DataTypes) {
  return sequelize.define('Players', {
    Player_ID: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    Class_ID: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Classes',
        key: 'Class_ID'
      }
    },
    Game_ID: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Games',
        key: 'Game_ID'
      }
    },
    Action_Points: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    MAX_AP: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    MISSED_AP: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    Health_Points: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    MAX_HP: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    MISSED_HP: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    Damage: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    MAX_DAMAGE: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    Range_: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    MAX_RANGE: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    Tile_ID: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Tiles',
        key: 'Tile_ID'
      }
    },
    Discord_ID: {
      type: DataTypes.STRING,
      allowNull: false
    },
    Kills: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0
    },
    HP_COST: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 4
    },
    RANGE_COST: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 4
    },
    DAMAGE_COST: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 12
    },
    Dead: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0
    },
    Tile_ID2: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'Tiles',
        key: 'Tile_ID'
      }
    }
  }, {
    tableName: 'Players',
    timestamps: false
  });
};
