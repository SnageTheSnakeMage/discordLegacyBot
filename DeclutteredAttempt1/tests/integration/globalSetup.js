/**
 * Runs once, in the parent process, before any integration suite. Workers
 * inherit process.env, so setting the storage target here guarantees it is
 * in place before any test file requires utils.js.
 */
module.exports = async () => {
  process.env.LEGACY_DB_STORAGE = ':memory:';
};
