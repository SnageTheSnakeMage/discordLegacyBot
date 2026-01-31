module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js'],
  collectCoverageFrom: ['commands/**/*.js', 'utils.js'],
  modulePathIgnorePatterns: ['<rootDir>/node_modules/']
};