 const { SlashCommandBuilder } = require('discord.js');
const utils = require('../utils');
var models = require("../utils.js").models;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('snipe')
        .setDescription('class command for the Sniper, pierce and hit anyone in the path of attack, pierces wall tiles')
        .addIntegerOption(option =>
            option.setName('x')
                .setDescription('X coordinate of which tile to attack')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('y')
                .setDescription('Y coordinate of which tile to attack')
                .setRequired(true))
        .addUserOption(option =>
            option.setName('target')
                .setDescription('who you are attacking')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('# of times you wish to attack the target defaults to 1')
                .setRequired(false))
        .addIntegerOption(option =>
            option.setName('game')
                .setDescription('which game, defaults to oldest active game')
                .setRequired(false)),
    async execute(interaction) {
        await interaction.deferReply();

        //Variables
        const x = interaction.options.getInteger('x');
        const y = interaction.options.getInteger('y');
        const targetsDiscordID = interaction.options.getUser('target').id ?? null;
        var amount = interaction.options.getInteger('amount') ?? 1;
        const gameId = interaction.options.getInteger('game') ?? await utils.getOldestActiveGameId();
        const game = await models.Games.findByPk(gameId);
        const player = await models.Players.findOne({where: {Discord_ID: interaction.user.id, Game_ID: gameId}});
        const shootersTile = await models.Tiles.findByPk(player.Tile_ID);
        const targetPlayer = await models.Players.findOne({where: {Discord_ID: targetsDiscordID, Game_ID: gameId}});
        const attackPath = utils.getTileCordinatesOfLine([shootersTile.X_Position, shootersTile.Y_Position], [targetTile.X_Position, targetTile.Y_Position]);
        const requiredAP = game.shootCost * amount;
        var response = "";
        const targetTile = await models.Tiles.findOne({where: {Layer_ID: shootersTile.Layer_ID, X_Position: x, Y_Position: y}});

        //Check if player has enough AP to shoot
        if (player.Action_Points < requiredAP) {
            return interaction.editReply({ content: "You don't have enough AP to shoot that much!" });
        }

        //Verification of tile and target
        if (!targetTile || !targetPlayer) {
            return interaction.editReply({ content: "The tile provided is not in the game!" });
        }

        //Check the target is on the tile provided
        if (targetTile.Tile_ID != targetPlayer.Tile_ID) {
            return interaction.editReply({ content: "Your target is not on the tile provided!" });
        }

        //Check the target is in range
        if (player.Range_ < attackPath.length - 1) {
            return interaction.editReply({ content: `That tile is ${(attackPath.length - 1) - player.Range_} tiles out of range!` });
        }
        
        //Check if player is a Sniper
        if (player.Class != "Sniper") {
            return interaction.editReply({ content: "You are not a Sniper!" });
        }

        //Snipe Logic
        //get each tile in the supposed attacks path
        for (attackTile in attackPath) {
            //get the actual tile from the cordinates of the path and the loop iterator
            const tile = await models.Tiles.findOne({where: {X_Position: attackPath[attackTile][0], Y_Position: attackPath[attackTile][1], Layer_ID: shootersTile.Layer_ID}});            
            //Check if the tile is a wall
            if (tile.Tile_Type == "Wall") {
                //Check if the player is attacking more than twice if so destroy the wall
                if(amount > 2) {
                    await utils.revertTileToBlank(tile);
                    response += `You destroyed a wall at ${attackPath[attackTile][0]},${attackPath[attackTile][1]}\n!`;
                }
                //if not just make the wall damaged
                else{
                    await models.Tiles.update({Tile_Type: "Wall_Damaged"}, {where: {X_Position: attackPath[attackTile][0], Y_Position: attackPath[attackTile][1], Layer_ID: shootersTile.Layer_ID}});
                    response += `You hit a wall at ${attackPath[attackTile][0]},${attackPath[attackTile][1]}\n!`;
                }
            }
            //Check if the tile is a damaged wall if so destroy the wall
            if(tile.Tile_Type == "Wall_Damaged") {
                await utils.revertTileToBlank(tile);
                response += `You destroyed a wall at ${attackPath[attackTile][0]},${attackPath[attackTile][1]}\n!`;
            }
            //Check if the tile has a player if so damage the player as you would damage the target 
            // but make sure that the player is not the target
            if(tile.Player1 != null && tile.Player1 != targetPlayer.Player_ID) {
                //TODO finish this function
                utils.dmgBuffTimeCheck(player);
                //get the player that is on the tile
                const collateralPlayer = await models.Players.findOne({where: {Player_ID: tile.Player1, Game_ID: game.Game_ID}});
                await models.Players.update({Health_Points: collateralPlayer.Health_Points - (1 * player.Damage * (player.DMG_BUFF + 1))}, {where: {Player_ID: collateralPlayer.Player_ID, Game_ID: game.Game_ID}});
                response += `You hit <@${collateralPlayer.Discord_ID}> for ${amount * player.Damage * (player.DMG_BUFF + 1)}$ damage at ${attackPath[attackTile][0]},${attackPath[attackTile][1]}!\n`;
            }
            if(tile.Player2 != null && tile.Player2 != targetPlayer.Player_ID) {
                //TODO finish this function
                utils.dmgBuffTimeCheck(player);
                //get the player that is on the tile
                const collateralPlayer = await models.Players.findOne({where: {Player_ID: tile.Player2, Game_ID: game.Game_ID}});
                await models.Players.update({Health_Points: collateralPlayer.Health_Points - (1 * player.Damage * (player.DMG_BUFF + 1))}, {where: {Player_ID: collateralPlayer.Player_ID, Game_ID: game.Game_ID}});
                response += `You hit <@${collateralPlayer.Discord_ID}> for ${amount * player.Damage * (player.DMG_BUFF + 1)}$ damage at ${attackPath[attackTile][0]},${attackPath[attackTile][1]}!\n`;
            }
            if(tile.Player3 != null && tile.Player3 != targetPlayer.Player_ID) {
                //TODO finish this function
                utils.dmgBuffTimeCheck(player);
                //get the player that is on the tile
                const collateralPlayer = await models.Players.findOne({where: {Player_ID: tile.Player3, Game_ID: game.Game_ID}});
                await models.Players.update({Health_Points: collateralPlayer.Health_Points - (1 * player.Damage * (player.DMG_BUFF + 1))}, {where: {Player_ID: collateralPlayer.Player_ID, Game_ID: game.Game_ID}});
                response += `You hit <@${collateralPlayer.Discord_ID}> for ${amount * player.Damage * (player.DMG_BUFF + 1)}$ damage at ${attackPath[attackTile][0]},${attackPath[attackTile][1]}!\n`;
            }
            if(tile.Player4 != null && tile.Player4 != targetPlayer.Player_ID) {
                //TODO finish this function
                utils.dmgBuffTimeCheck(player);
                //get the player that is on the tile
                const collateralPlayer = await models.Players.findOne({where: {Player_ID: tile.Player4, Game_ID: game.Game_ID}});
                await models.Players.update({Health_Points: collateralPlayer.Health_Points - (1 * player.Damage * (player.DMG_BUFF + 1))}, {where: {Player_ID: collateralPlayer.Player_ID, Game_ID: game.Game_ID}});
                response += `You hit <@${collateralPlayer.Discord_ID}> for ${amount * player.Damage * (player.DMG_BUFF + 1)}$ damage at ${attackPath[attackTile][0]},${attackPath[attackTile][1]}!\n`;
            }
            //Check if the tile is the target tile and damage the target if so
            if(tile.X_Position == x && tile.Y_Position == y) {
                //TODO finish this function
                utils.dmgBuffTimeCheck(player);
                await models.Players.update({Health_Points: targetPlayer.Health_Points - (amount * player.Damage * (player.DMG_BUFF + 1))}, {where: {Player_ID: targetPlayer.Player_ID, Game_ID: game.Game_ID}});
                response += `You hit ${interaction.options.getUser('target').username} for ${amount * player.Damage * (player.DMG_BUFF + 1)}$ damage at ${attackPath[attackTile][0]},${attackPath[attackTile][1]}!\n`;
                break;
            }
        }

        //Update AP
        await models.Players.update({Action_Points: player.Action_Points - requiredAP}, {where: {Player_ID: player.Player_ID , Game_ID: game.Game_ID}});

        return interaction.editReply({ content: response });
    },


}