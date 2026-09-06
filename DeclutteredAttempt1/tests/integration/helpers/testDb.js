/**
 * Integration-test database harness: real Sequelize, real models, real
 * schema, in memory. The guard below makes it impossible to point these
 * tests at a real database file.
 */
if (process.env.LEGACY_DB_STORAGE !== ':memory:') {
  throw new Error(
    'integration tests must run against :memory: - refusing to touch a real database. '
    + 'Run through "npm run test:integration" (globalSetup sets LEGACY_DB_STORAGE).',
  );
}

const utils = require('../../../utils.js');
const { sequelize, models } = utils;

/** Drop and recreate every table. Call in beforeEach - per-test isolation. */
async function freshDb() {
  await sequelize.sync({ force: true });
  return models;
}

async function closeDb() {
  await sequelize.close();
}

module.exports = { freshDb, closeDb, sequelize, models, utils };
