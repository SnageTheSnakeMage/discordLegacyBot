/**
 * Jest setup for command tests. Runs after test framework is installed.
 * Sets globals that index.js or utils may expect so required modules don't throw.
 */

global.LAYERS = global.LAYERS || {
  ENVIRONMENT: 'environment',
  MINES: 'mines',
  PLAYERS: 'players',
};

global.tileCache = global.tileCache || {};
