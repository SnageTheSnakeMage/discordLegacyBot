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
      type: DataTypes.STRING(10),
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
      type: "TEXT(50)",
      allowNull: true
    }
  }, {
    tableName: 'Games',
    timestamps: false
  });
};
