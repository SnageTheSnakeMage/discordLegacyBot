const path = require('path');

module.exports = {
  rootDir: path.resolve(__dirname),
  clearMocks: true,
  restoreMocks: true,
  testTimeout: 10000,
  collectCoverageFrom: [
    'commands/**/*.js',
    'utils.js',
    '!commands/decommissioned/**',
  ],
  coverageDirectory: 'tests/coverage',
  projects: [
    {
      displayName: 'unit',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/**/*.test.js'],
      testPathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/tests/integration/'],
      setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
    },
    {
      displayName: 'integration',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/integration/**/*.test.js'],
      testPathIgnorePatterns: ['<rootDir>/node_modules/'],
      setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
      globalSetup: '<rootDir>/tests/integration/globalSetup.js',
      // one in-memory database at a time
      maxWorkers: 1,
    },
  ],
};
