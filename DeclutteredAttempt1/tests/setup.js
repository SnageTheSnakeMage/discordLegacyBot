/**
 * Jest setup for command tests. Runs after test framework is installed.
 * Sets globals that index.js or utils may expect so required modules don't throw.
 */
const pino = require('pino')
require('path');
require('fs');
require('jest-canvas-mock');

globalThis.tileCache = globalThis.tileCache || {};
globalThis.CommandExecutionLogger = pino({
	transport: {
		target: 'pino-pretty',
		options: {
		  colorize: true
		}
	  },
	level: 'error',
	}
);
