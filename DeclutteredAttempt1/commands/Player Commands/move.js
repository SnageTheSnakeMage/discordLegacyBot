const { SlashCommandBuilder } = require('discord.js');
const { readOptions, readActor, toDiscord } = require('../_adapter.js');
const { runLogged } = require('../_logging.js');
const utils = require('../../utils.js');
const logic = require('./move.logic.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('move')
    .setDescription('moves a player <distance> tiles in <direction>')
    .addStringOption(option =>
      option.setName('direction')
        .setDescription('which direction you are moving')
        .setRequired(true)
        .addChoices(
          { name: "left", value: "east" },
          { name: "right", value: "west" },
          { name: "up", value: "north" },
          { name: "down", value: "south" },
          { name: "nw", value: "northwest" },
          { name: "ne", value: "northeast" },
          { name: "sw", value: "southwest" },
          { name: "se", value: "southeast" }))
    .addIntegerOption(option =>
      option.setName('distance')
        .setDescription('how many tiles you move')
        .setRequired(true)
        .setMinValue(0))
    .addStringOption(option =>
          option.setName('path')
            .setDescription('a list of DIRections and DISTances Ex: "dir,dist;dir,dist;...", required to move on an ice tile')
            .setRequired(false))
    .addIntegerOption(option =>
      option.setName('body')
        .setDescription('(FOR TWIN CLASS) Which body you are trying to see, defaults to 1')
        .setMaxValue(2)
        .setMinValue(1)
        .setRequired(false))
    .addIntegerOption(option =>
      option.setName('game')
        .setDescription('which game, defaults to oldest active game')
        .setRequired(false)),

  async execute(interaction) {
    await interaction.deferReply();
    const input = logic.parse(
      readOptions(interaction, { direction: 'string', distance: 'integer', path: 'string', body: 'integer', game: 'integer' }),
      readActor(interaction),
    );
    const result = await runLogged('move', logic, input);
    await interaction.editReply(toDiscord(logic.present(result)));

    // a Spy's movement is deleted a few seconds after it is posted
    if (result.ok && result.data.deleteReplyAfterMs) {
      await utils.delay(result.data.deleteReplyAfterMs);
      await interaction.deleteReply();
    }
  },
};
