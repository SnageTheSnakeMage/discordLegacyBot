const Sequelize = require('sequelize');
module.exports = function(sequelize, DataTypes) {
  return sequelize.define('Grids', {
    Grid_ID: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    Game_ID: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Games',
        key: 'Game_ID'
      }
    }
  }, {
    tableName: 'Grids',
    timestamps: false
  });
};
