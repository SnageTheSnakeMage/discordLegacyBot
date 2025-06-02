const Sequelize = require('sequelize');
module.exports = function(sequelize, DataTypes) {
  return sequelize.define('Layers', {
    Layer_ID: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    Grid_ID: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'Grids',
        key: 'Grid_ID'
      }
    },
    Layer_Above: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'Layers',
        key: 'Layer_ID'
      }
    },
    Layer_Below: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'Layers',
        key: 'Layer_ID'
      }
    },
    X_Bound: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    Y_Bound: {
      type: DataTypes.INTEGER,
      allowNull: true
    }
  }, {
    tableName: 'Layers',
    timestamps: false
  });
};
