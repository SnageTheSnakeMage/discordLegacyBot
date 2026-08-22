const { SlashCommandBuilder } = require('discord.js');
const utils = require('../../utils');
var models = utils.models;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stab')
        .setDescription('spend 1 AP to deal x2 dmg(up to max) to another player on your tile')
        .addUserOption(option =>
            option.setName('target')
                .setDescription('who you are attacking')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('# of times you wish to stab the target defaults to 1')
                .setRequired(false))
        .addIntegerOption(option =>
            option.setName('game')
                .setDescription('which game, defaults to oldest active game')
                .setRequired(false)),
    async execute(interaction) {
        const logger200 = globalThis.CommandExecutionLogger.child({file: 'stab.js'})
        await interaction.deferReply();
        try {
        const targetsDiscordID = interaction.options.getUser('target').id ?? null;
        var amount = interaction.options.getInteger('amount') ?? 1;
        const gameId = interaction.options.getInteger('game') ?? await utils.getOldestActiveGameId(interaction.user.id);
        const game = await models.Games.findByPk(gameId);
        const player = await models.Players.findOne({where: {Discord_ID: interaction.user.id, Game_ID: gameId}});
        const shootersTile = await models.Tiles.findByPk(player.Tile_ID).X_Position;
        const y = interaction.options.getInteger('y');
        const playerClass = await models.Classes.findOne({where: {Class_ID: player.Class_ID}});
        const requiredAP = amount;
        const targetPlayer = await models.Players.findOne({where: {Discord_ID: targetsDiscordID}});
        var response = "";

        if(player.Dead){
        await interaction.editReply({ content: "Dead players can't use this command."});
        return
        }

      //Check Gamestate
        if(await utils.checkGameState(game.GAME_STATE, false, interaction)){
          return
      }
        
        //Check if the player is a Fencer
        if (playerClass.Class_Name != "Fencer") {
            return interaction.editReply({ content: "Only Fencers can use this command!" });
        }

        //Check if player has enough AP to shoot
        if (player.Action_Points < requiredAP) {
            return interaction.editReply({ content: "You don't have enough AP to shoot that much!" });
        }
        //Verification of tile
        if (!targetTile) {
            return interaction.editReply({ content: "That tile is not on the board!" });
        }
        //Make sure player is on the board
        if(!shootersTile) {
            return interaction.editReply({ content: "You are not on the board! Are you registered in that game?" });
        }
        //Verification of the target
        if (!targetsDiscordID || !targetPlayer) {
            return interaction.editReply({ content: "That mention does not correspond to a player registered in that game!" });
        }

        //Check if the target is on the same tile as the shooter
        if(shootersTile.Player1 == targetPlayer.Discord_ID || shootersTile.Player2 == targetPlayer.Discord_ID || shootersTile.Player3 == targetPlayer.Discord_ID || shootersTile.Player4 == targetPlayer.Discord_ID) {}
        else {
            return interaction.editReply({ content: "You are not on the same tile as the target!" });
        }

        //stab logic
        if(shootersTile.Tile_Type == "Bush" && utils.getRandomInt(1) == 0) {
            amount--;
            response += `You missed the target in the bush!\n`;
        }
        //damage the target with whatever stabs are left
        await models.Players.update({Health_Points: targetPlayer.Health_Points - Math.min(amount * player.Damage * (player.DMG_BUFF + 1) * 2, player.MAX_DAMAGE)}, {where: {Player_ID: targetPlayer.Player_ID, Game_ID: gameId}});
        utils.playerDeathLogic(player, targetPlayer);
        response += `You hit <@${targetPlayer.Discord_ID}> for ${amount * player.Damage * (player.DMG_BUFF + 1)}$ damage at ${attackPath[attackTile][0]},${attackPath[attackTile][1]}!\n`;
        //set the amount of stabs left to 0 and exit the loop
        amount = 0;

        //if there was a DMG buff make sure to reset it
        if (player.DMG_BUFF > 0) {
            await models.Players.update({DMG_BUFF: 0}, {where: {Player_ID: player.Player_ID, Game_ID: gameId}});
        }

        //Update AP
        await models.Players.update({Action_Points: player.Action_Points - requiredAP}, {where: {Player_ID: player.Player_ID , Game_ID: gameId}});
        return interaction.editReply({ content: response });
    }
        catch (error) {
            logger200.error({function: "execute"}, error);
            return interaction.editReply({ content: "An error has occured + " + error.message + "!", ephemeral: true });
        }
    }

}