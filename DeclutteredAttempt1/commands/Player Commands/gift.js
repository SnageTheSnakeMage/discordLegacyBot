const { SlashCommandBuilder } = require('discord.js');
const utils = require('../../utils');
var models = utils.models;
module.exports = {
    data: new SlashCommandBuilder()
        .setName('gift')
        .setDescription('gives a player in range an amount of AP')
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('how much AP you wish to give, defaults to 1')
                .setMinValue(1)
                .setRequired(true))
        .addUserOption(option =>
            option.setName('player')
                .setDescription('which player to give the AP to')
                .setRequired(true))        
        .addIntegerOption(option =>
            option.setName('game')
                .setDescription('which game, defaults to oldest active game')
                .setRequired(false)),
    async execute(interaction) {
        const logger200 = globalThis.CommandExecutionLogger.child({file: 'gift.js', function: `execute`})
        await deferredReply(interaction);
        try {
            //TODO add over and underflow protections to all "...models.Players.update({..." instances like here with Math.min and Math.max
            var inputs = this.inputValidation(interaction)
            //Give AP
            await models.Players.update({Action_Points: Math.min(inputs.recievingPlayer.Action_Points + inputs.amount, inputs.recievingPlayer.MAX_AP)}, {where: {Game_ID: inputs.gameId, Discord_ID: inputs.recievingPlayerDiscordId}});
            logger200.debug(`gave player: ${inputs.recievingPlayer}, ${inputs.amount} AP setting their current AP to: ${Math.min(inputs.recievingPlayer.Action_Points + inputs.amount, inputs.recievingPlayer.MAX_AP)}`)
            //Take AP
            await models.Players.update({Action_Points: Math.max(inputs.givingPlayer.Action_Points - inputs.amount, 0)}, {where: {Game_ID: inputs.gameId, Discord_ID: inputs.playerDiscordID}});
            logger200.debug(`took ${inputs.amount} AP from player: ${inputs.givingPlayer} setting their current AP to: ${Math.max(inputs.givingPlayer.Action_Points - inputs.amount, 0)}`)
            if(inputs.remainder > 0) {
                await models.Players.update({Action_Points: inputs.givingPlayer.MISSED_AP + inputs.remainder}, {where: {Game_ID: inputs.gameId, Discord_ID: inputs.recievingPlayerDiscord}});
                logger200.debug(`recieving player couldn't hold all the AP increasing their missed ap to: ${inputs.givingPlayer.MISSED_AP + inputs.remainder}`)
            }
            return interaction.editReply({ content: `${interaction.user.username} gave ${inputs.amount} AP to <@${inputs.recievingPlayer.Discord_ID}>`});
        }
        catch (error) {
            logger200.error(error);
            return interaction.editReply({ content: "Something went wrong! Please contact snage and try again later. Error caught during /gift execution : " + error.message, ephemeral: true });
        }
    },
    async inputValidation(interaction){
        const logger200 = globalThis.CommandExecutionLogger.child({file: 'gift.js', function: `inputValidation`})
        //Variables
        var amount = interaction.options.getInteger('amount');
        var gameId = interaction.options.getInteger('game')  ?? await utils.getOldestActiveGameId(interaction.user.id);
        var recievingPlayerDiscordId = interaction.options.getUser('player').id;
        var playerDiscordID = interaction.user.id;
        logger200.debug(`incoming inputs are: { amount: ${amount}, gameId: ${gameId}, recievingPlayerDiscordId: ${recievingPlayerDiscordId} }`)
        var remainder = 0;
        //Verification of mentionable
        if (!await models.Players.findOne({where: {Game_ID: gameId, Discord_ID: recievingPlayerDiscordId}})){
            logger200.error(`Could not find a player with Discord_ID: ${recievingPlayerDiscordId} in game: ${gameId} rejecting input`)
            return interaction.editReply({ content: "Something went wrong! Player not found in game! Please mention another player in the game inputted." });
        }
        //Get Game and Player
        var game = await models.Games.findByPk(gameId);
        var recievingPlayer = await models.Players.findOne({where: {Game_ID: gameId, Discord_ID: recievingPlayerDiscordId}});
        var givingPlayer = await models.Players.findOne({where: {Game_ID: gameId, Discord_ID: playerDiscordID}});
        var givingPlayersTile = await models.Tiles.findByPk(givingPlayer.Tile_ID)
        var recievingPlayersTile= await models.Tiles.findByPk(recievingPlayer.Tile_ID)
        var isClockwatcher = await models.Classes.findByPk(givingPlayer.Class_ID).Class_Name == "Clockwatcher"
        logger200.debug(`set game to ${JSON.stringify(game)}, set recievingPlayer to ${JSON.stringify(recievingPlayer)}, and givingPlayer to ${JSON.stringify(givingPlayer)}`)

        if(givingPlayer.Dead){
            logger200.debug(`player is dead rejecting input`)
            await interaction.editReply({ content: "Dead players can't use this command."});
            return
        }
        //Check Gamestate
        logger200.debug(`checking Gamestate of game #${gameId}`)
        if(await utils.checkGameStateAndReply(game.GAME_STATE, isClockwatcher, interaction)){
            return
        }

        //Check if player has enough AP
        if (givingPlayer.Action_Points < amount) {
            logger200.debug(`Player has an inadequate amount of Action Points compared to the amount they inputted, rejecting input`)
            return interaction.editReply({ content: "You dont have that much AP to give!" });
        }

        //Check if the giving player is within range of the recieving player
        if (givingPlayer.Range_ < utils.getTileCordinatesOfLine([givingPlayersTile.X_Position,givingPlayersTile.Y_Position],[recievingPlayersTile.X_Position,recievingPlayersTile.Y_Position]).length || givingPlayersTile.Layer_ID != recievingPlayersTile.Layer_ID){
            logger200.debug(`reciving player is out of range or on different tile, rejecting input`)
            return interaction.editReply({ content: `That player is too far away or on a different layer than you!`})
        }

        //Check is the reciever has enough room for the AP
        if (recievingPlayer.Action_Points + amount > recievingPlayer.MAX_AP) {
            remainder = recievingPlayer.MAX_AP - recievingPlayer.Action_Points;
            amount = amount - remainder;
            logger200.debug(`reduced amount by overflow AP`)
        }
        return{
            recievingPlayer,
            amount,
            gameId,
            givingPlayer,
            remainder,
        }
    }
}