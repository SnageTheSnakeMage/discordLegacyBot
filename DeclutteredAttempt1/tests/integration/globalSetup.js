/**
 * Runs once, in the parent process, before any integration suite. Workers
 * inherit process.env, so setting the storage target here guarantees it is
 * in place before any test file requires utils.js.
 */
module.exports = async () => {
  process.env.LEGACY_DB_STORAGE = ':memory:';
  // sequelize logs every statement to console.log by default (production
  // behaviour, restored deliberately); mute it for the test run only
  process.env.LEGACY_DB_LOGGING = '0';
};
