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
    timestopTurns: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    lastAPDistributionTimestampInMS: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    APAmount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 2
    },
    immutableDoomsday: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 32
    },
    // Discord snowflakes exceed Number.MAX_SAFE_INTEGER: as an INTEGER,
    // 1392574348333678633 was stored as ...678600 and pointed at no channel
    // at all. Players.Discord_ID is already STRING for the same reason.
    // The old hard-coded default was one specific server's channel; the
    // channel is now set per game with /set-dead-chat.
    deadChatChannelId: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null
    },
    // a message snowflake, same precision problem as above
    currentChaosPollMsgId: {
      type: DataTypes.STRING,
      allowNull: true
    },
    NEXT_CC_EVENT: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    overrider: {
      type: DataTypes.INTEGER,
      allowNull: true
    }
  }, {
    tableName: 'Games',
    timestamps: false
  });
};
