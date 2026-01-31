const path = require('path');

module.exports = {
  rootDir: path.resolve(__dirname),
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: [
    'commands/**/*.js',
    'utils.js',
    '!commands/decommissioned/**',
  ],
  coverageDirectory: 'tests/coverage',
  modulePathIgnorePatterns: ['<rootDir>/node_modules/'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
};
