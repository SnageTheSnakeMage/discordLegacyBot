/**
 * Jest setup for command tests. Runs after test framework is installed.
 * Sets globals that index.js or utils may expect so required modules don't throw.
 */
require('pino')
require('path');
require('fs');
require('jest-canvas-mock');

globalThis.tileCache = globalThis.tileCache || {};
// globalThis.commandExecutionLogger = globalThis.commandExecutionLogger || pino({level: 'debug'});
