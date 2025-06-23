const { SlashCommandBuilder } = require('discord.js');
const utils = require('../../utils');
var models = utils.models;


module.exports = {
    data: new SlashCommandBuilder()
        .setName('shoot')
        .setDescription('spend AP to attack another player in range')
        .addIntegerOption(option =>
            option.setName('x')
            .setDescription('X coordinate of which tile to attack')
            .setRequired(true))
        .addIntegerOption(option =>
            option.setName('y')
            .setDescription('Y coordinate of which tile to attack')
            .setRequired(true))
        .addMentionableOption(option =>
            option.setName('target')
                .setDescription('who you are attacking')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('# of times you wish to attack the target defaults to 1')
                .setRequired(false))
        .addIntegerOption(option =>
            option.setName('game')
                .setDescription('which game, defaults to oldest active game you are registered in')
                .setRequired(false))
        .addIntegerOption(option =>
            option.setName('body')
            .setDescription('(FOR TWIN CLASS) Which body you are shooting, accepts 1 & 2, defaults to 1. use stats to see which body is where')
            .setMaxValue(2)
            .setMinValue(1)
            .setRequired(false)),
    async execute(interaction) {
        await interaction.deferReply();

        const x = interaction.options.getInteger('x');
        const y = interaction.options.getInteger('y');
        const targetsDiscordID = interaction.options.getMentionable('target').id ?? null;
        var amount = interaction.options.getInteger('amount') ?? 1;
        const gameId = interaction.options.getInteger('game') ?? await utils.getOldestActiveGameId();
        const game = await models.Games.findByPk(gameId);
        const player = await models.Players.findOne({where: {Discord_ID: interaction.user.id, Game_ID: game.Game_ID}});
        var shootersTile;
        if(interaction.options.getInteger('body') === 2) {
            shootersTile = await models.Tiles.findByPk(player.Tile_ID_2);
        } else {
            shootersTile = await models.Tiles.findByPk(player.Tile_ID);
        }
        const requiredAP = game.shootCost * amount;
        const targetPlayer = await models.Players.findOne({where: {Discord_ID: targetsDiscordID}});
        var response = "";
        const targetTile = await models.Tiles.findOne({where: {Layer_ID: shootersTile.Layer_ID, X_Position: x, Y_Position: y}});

        //get all tiles between player and target
        const attackPath = utils.getTileCordinatesOfLine([shootersTile.X_Position, shootersTile.Y_Position], [targetTile.X_Position, targetTile.Y_Position]);

        //Check if player has enough AP to shoot
        if (player.Action_Points < requiredAP) {
            return interaction.editReply({ content: "You don't have enough AP to shoot that much!" });
        }
        //Verification of tile and target
        if (!targetTile) {
            return interaction.editReply({ content: "That tile is not on the board!" });
        }
        if(!shootersTile) {
            return interaction.editReply({ content: "You are not on the board! Are you registered in that game?" });
        }
        if (!targetsDiscordID || !targetPlayer) {
            return interaction.editReply({ content: "That mention does not correspond to a player registered in that game!" });
        }
        if(targetPlayer.Tile_ID != targetTile.Tile_ID) {
            return interaction.editReply({ content: "That player isnt on that tile!" });
            
        }

        //Check if target is in range
        // -1 cus we dont want to count the tile the player is on
        if (player.Range_ < attackPath.length - 1) {
            return interaction.editReply({ content: `That tile is ${(attackPath.length - 1) - player.Range_} tiles out of range!` });
        }

        //Shoot logic
        for (attackTile in attackPath) {
            const tile = await models.Tiles.findOne({where: {X_Position: attackPath[attackTile][0], Y_Position: attackPath[attackTile][1], Layer_ID: shootersTile.Layer_ID}});
            if (tile.Tile_Type == "Wall") {
                await models.Tiles.update({Tile_Type: "Wall_Damaged"}, {where: {X_Position: attackPath[attackTile][0], Y_Position: attackPath[attackTile][1], Layer_ID: shootersTile.Layer_ID}});
                response += `You hit a wall at ${attackPath[attackTile][0]},${attackPath[attackTile][1]}\n!`;
                amount--;
                if (amount == 0) {
                    break;
                }
                continue;
            }
            if(tile.Tile_Type == "Wall_Damaged") {
                await utils.revertTileToBlank(tile);
                response += `You destroyed a wall at ${attackPath[attackTile][0]},${attackPath[attackTile][1]}\n!`;
                amount--;
                if (amount == 0) {
                    break;
                }
                continue;
            }
            if(tile.X_Position == x && tile.Y_Position == y) {
                await models.Players.update({Health_Points: targetPlayer.Health_Points - (amount * player.Damage * (player.DMG_BUFF + 1))}, {where: {Player_ID: targetPlayer.Player_ID, Game_ID: game.Game_ID}});
                response += `You hit <@${targetPlayer.Discord_ID}> for ${amount * player.Damage}$ damage at ${attackPath[attackTile][0]},${attackPath[attackTile][1]}!\n`;
                amount = 0;
                break;
            }
        }

        //Update AP
        await models.Players.update({Action_Points: player.Action_Points - requiredAP}, {where: {Player_ID: player.Player_ID , Game_ID: game.Game_ID}});

        return interaction.editReply({ content: response });
    }
}