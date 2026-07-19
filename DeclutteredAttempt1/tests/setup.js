/**
 * Jest setup for command tests. Runs after test framework is installed.
 * Sets globals that index.js or utils may expect so required modules don't throw.
 */

global.tileCache = global.tileCache || {};
