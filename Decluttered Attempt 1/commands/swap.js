 const { SlashCommandBuilder } = require('discord.js');
const utils = require('../utils');
var models = require("../utils.js").models;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('swap')
        .setDescription('class command for Switchmates, swap places with any player for 4AP')
        .addUserOption(option =>
            option.setName('victim')
                .setDescription('which player to swap places with')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('game')
                .setDescription('which game, defaults to oldest active game')
                .setRequired(false)),
    async execute(interaction) {
        await deferReply(interaction);

        //Variables
        var gameId = interaction.options.getInteger('game') ?? await utils.getOldestActiveGameId(interaction.user.id);
        var player = await models.Players.findOne({where: {Game_ID: gameId, Player_ID: interaction.user.id}});
        var victim = await models.Players.findOne({where: {Game_ID: gameId, Player_ID: interaction.options.getUser('victim').id}});

         if(player.Dead){
        await interaction.reply({ content: "Dead players can't use this command.", ephemeral: true });
        return
        }
      //Check Gamestate
      await utils.checkGameState(game.GAMESTATES, false);

        //Check the player is a Switchmate
        if (player.Class != "Switchmate") {
            return interaction.editReply({ content: "You are not a Switchmate!" });
        }

        //Check the victim is in the game
        if (!victim) {
            return interaction.editReply({ content: "The victim is not in this game!" });
        }

        //Check player is in the game
        if (!player) {
            return interaction.editReply({ content: "You are not in this game!" });
        }

        var playersTIle = await models.Tiles.findByPk(player.Tile_ID);
        var victimsTile = await models.Tiles.findByPk(victim.Tile_ID);

        //Check if the player is on the same tile as the victim
        if (playersTIle.Layer_ID == victimsTile.Layer_ID && playersTIle.X_Position == victimsTile.X_Position && playersTIle.Y_Position == victimsTile.Y_Position) {
            return interaction.editReply({ content: "The player and victim are on the same tile!" });
        }

        //Swap their tiles
        await models.Players.update({ Tile_ID: victimsTile.Tile_ID }, { where: { Game_ID: gameId, Player_ID: player.Player_ID } });
        await models.Players.update({ Tile_ID: playersTIle.Tile_ID }, { where: { Game_ID: gameId, Player_ID: victim.Player_ID } });

        return interaction.editReply({ content: "You have swapped places with " + interaction.options.getUser('victim').username });

    }
};