const Sequelize = require('sequelize');
module.exports = function(sequelize, DataTypes) {
  return sequelize.define('Games', {
    Game_ID: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    GAME_STATE: {
      type: DataTypes.STRING,
      allowNull: false
    },
    AP_INTERVAL_MIN: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    CHEST_AMOUNT: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    LAST_CHEST_GIVER: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'Players',
        key: 'Player_ID'
      }
    },
    CURR_CC_EVENT: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    moveCost: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1
    },
    shootCost: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 2
    },
    fireDmg: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1
    },
    mineDmg: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1
    },
    classBlacklist: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    classDupelicateMax: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 2
    },
    maxIncreaseOnKill: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1
    },
    chaosCouncilBool: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1
    },
    winner: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'Players',
        key: 'Player_ID'
      }
    },
    finaleThreshold: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 4
    },
    timestopExpirationTimestampInMS: {
      type: DataTypes.INTEGER,
      allowNull: true
    }
  }, {
    tableName: 'Games',
    timestamps: false
  });
};
