/**
 * Jest setup. Runs after the test framework is installed, before each suite.
 * Sets every global that module scope reads so requiring utils.js or a
 * command never throws during import (utils.js reads globalThis.topLogger
 * at module scope).
 *
 * The logger is plain pino with no pino-pretty transport: the transport
 * spawns a worker thread, which leaves Jest hanging on open handles.
 */
const pino = require('pino')

const silent = pino({ level: 'silent' })
globalThis.topLogger = silent
globalThis.CommandExecutionLogger = silent
globalThis.tileCache = globalThis.tileCache || {}
