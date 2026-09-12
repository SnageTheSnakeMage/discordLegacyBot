/**
 * Default dependency bundle for every command's run(input, deps). Production
 * callers pass nothing and get the real database and helpers; tests pass a
 * partial override and never need jest.mock.
 *
 * now and random live here so time- and chance-dependent commands are
 * deterministic in tests without stubbing globals.
 *
 * This file must never import discord.js.
 */
const utils = require('../utils');
const boards = require('../database/boardPresets.js');

module.exports = {
  models: utils.models,
  utils,
  // ASCII board presets for /create-board; injected so tests never read disk
  boards,
  now: () => Date.now(),
  random: (max) => utils.getRandomInt(max),
};
