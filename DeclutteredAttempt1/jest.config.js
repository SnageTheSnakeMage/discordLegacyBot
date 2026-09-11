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
      clearMocks: true,
      restoreMocks: true,
      testTimeout: 10000,
      testMatch: ['<rootDir>/tests/**/*.test.js'],
      testPathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/tests/integration/'],
      setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
    },
    {
      displayName: 'integration',
      testEnvironment: 'node',
      clearMocks: true,
      restoreMocks: true,
      testTimeout: 10000,
      testMatch: ['<rootDir>/tests/integration/**/*.test.js'],
      testPathIgnorePatterns: ['<rootDir>/node_modules/'],
      setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
      globalSetup: '<rootDir>/tests/integration/globalSetup.js',
      // NOTE no maxWorkers here. It used to say 1, "one in-memory database at
      // a time", but jest only accepts maxWorkers at the root - it was being
      // ignored, and jest 30.5 started warning about it. It is not needed:
      // ':memory:' is per-connection and each test file gets its own module
      // registry, so every integration file already builds its own separate
      // database. Do not re-add it here; setting it at the root would
      // serialise the unit suite too.
    },
  ],
};
