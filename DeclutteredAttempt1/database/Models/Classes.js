const Sequelize = require('sequelize');
module.exports = function(sequelize, DataTypes) {
  return sequelize.define('Classes', {
    Class_ID: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    Start_AP: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    Start_MAX_AP: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    Start_HP: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    Start_MAX_HP: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    Start_Range_: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    Start_MAX_Range_: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    Start_Damage: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    Start_MAX_Damage: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    Role_Color: {
      type: DataTypes.STRING(7),
      allowNull: true
    },
    Description: {
      type: DataTypes.STRING(300),
      allowNull: true
    },
    Class_Name: {
      type: DataTypes.STRING(25),
      allowNull: true
    }
  }, {
    tableName: 'Classes',
    timestamps: false
  });
};
