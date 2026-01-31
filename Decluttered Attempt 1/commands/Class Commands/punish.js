const { SlashCommandBuilder } = require('discord.js');
const utils = require('../../utils');
var models = utils.models;


module.exports = {
    data: new SlashCommandBuilder()
        .setName('punish')
        .setDescription('spend AP to deal (targets Missed AP+HP) damage to another player in range')
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
            option.setName('game')
                .setDescription('which game, defaults to oldest active game')
                .setRequired(false)),
    async execute(interaction) {
        await interaction.deferReply();
        try {
        const x = interaction.options.getInteger('x');
        const y = interaction.options.getInteger('y');
        const targetsDiscordID = interaction.options.getUser('target').id ?? null;
        const gameId = interaction.options.getInteger('game') ?? await utils.getOldestActiveGameId();
        const game = await models.Games.findByPk(gameId);
        const player = await models.Players.findOne({where: {Discord_ID: interaction.user.id, Game_ID: gameId}});
        const playerClass = await models.Classes.findOne({where: {Class_ID: player.Class_ID}});
        var shootersTile;
        if(interaction.options.getInteger('body') === 2) {
            shootersTile = await models.Tiles.findByPk(player.Tile_ID_2);
        } else {
            shootersTile = await models.Tiles.findByPk(player.Tile_ID);
        }
        const requiredAP = 4;
        //TODO:FINISH PUNISH CLASS IMPLEMENTATION
        //TODO: finish punish command
        //TODO: add punish class to DB
        //TODO: review class code to make sure 39 classes do not break anything
        //TODO: review punish command to ensure leftover shoot command code doesnt not cause bugs
        //TODO: write down steps and review what it takes to make a new class
        const targetPlayer = await models.Players.findOne({where: {Discord_ID: targetsDiscordID}});
        var response = "";
        const targetTile = await models.Tiles.findOne({where: {Layer_ID: shootersTile.Layer_ID, X_Position: x, Y_Position: y}});


        //get all tiles between player and target
        const attackPath = utils.getTileCordinatesOfLine([shootersTile.X_Position, shootersTile.Y_Position], [targetTile.X_Position, targetTile.Y_Position]);


        //Check Gamestate
        if(await utils.checkGameState(game.GAMESTATES, false, interaction)){
            return
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

        //Check the target is on the tile provided
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
            //get the actual tile from the coordinates of the path and the loop iterator
            const tile = await models.Tiles.findOne({where: {X_Position: attackPath[attackTile][0], Y_Position: attackPath[attackTile][1], Layer_ID: shootersTile.Layer_ID}});
            //check if the tile is a wall and if so damage it
            if (tile.Tile_Type == "Wall") {
                //Check if they are shooting from a bush tile & arent a hunter if so 50% chance of missing
                if(shootersTile.Tile_Type == "Bush" && utils.getRandomInt(1) == 0 && playerClass.Class_Name != "Hunter"){
                    //if the miss decrement the amount of shots
                    amount--;
                    //add the response of them missing
                    response += `You missed a damaged wall at ${attackPath[attackTile][0]},${attackPath[attackTile][1]}!\n`;
                    //check if there are no shots left if so exit the loop
                    if(amount == 0) {
                        break;
                    }
                }
                await models.Tiles.update({Tile_Type: "Wall_Damaged"}, {where: {X_Position: attackPath[attackTile][0], Y_Position: attackPath[attackTile][1], Layer_ID: shootersTile.Layer_ID}});
                response += `You hit a wall at ${attackPath[attackTile][0]},${attackPath[attackTile][1]}\n!`;
                //decrement amount of shots and check if there are any shots left if not exit the loop
                amount--;
                if (amount == 0) {
                    break;
                }
            }
            //check if the tile is a damaged wall if so destroy it
            if(tile.Tile_Type == "Wall_Damaged") {
                //Check if they are shooting from a bush tile & arent a hunter if so 50% chance of missing
                if(shootersTile.Tile_Type == "Bush" && utils.getRandomInt(1) == 0 && playerClass.Class_Name != "Hunter"){
                    //if the miss decrement the amount of shots
                    amount--;
                    //add the response of them missing
                    response += `You missed a damaged wall at ${attackPath[attackTile][0]},${attackPath[attackTile][1]}!\n`;
                    //check if there are no shots left if so exit the loop
                    if(amount == 0) {
                        break;
                    }
                }
                await utils.revertTileToBlank(tile);
                response += `You destroyed a wall at ${attackPath[attackTile][0]},${attackPath[attackTile][1]}\n!`;
                //decrement amount of shotsand check if there are any shots left if not exit the loop
                amount--;
                if (amount == 0) {
                    break;
                }
            }
            //check if we are on the targeted tile if so damage the target
            if(tile.X_Position == x && tile.Y_Position == y) {
                if(shootersTile.Tile_Type == "Bush" && utils.getRandomInt(1) == 0 && playerClass.Class_Name != "Hunter" || targetTile.Tile_Type == "Bush" && utils.getRandomInt(1) == 0 && playerClass.Class_Name != "Hunter") {
                        amount--;
                        response += `You missed the target tile!\n`;
                    if(amount == 0) {
                        break;
                    }
                }
                //damage the target with whatever shots are left
                await models.Players.update({Health_Points: targetPlayer.Health_Points - (amount * player.Damage * (player.DMG_BUFF + 1))}, {where: {Player_ID: targetPlayer.Player_ID, Game_ID: gameId}});
                await utils.playerDeathLogic(player, targetPlayer);
                response += `You hit <@${targetPlayer.Discord_ID}> for ${amount * player.Damage * (player.DMG_BUFF + 1)}$ damage at ${attackPath[attackTile][0]},${attackPath[attackTile][1]}!\n`;
                //set the amount of shots left to 0 and exit the loop
                amount = 0;

                //if there was a DMG buff make sure to reset it
                if (player.DMG_BUFF > 0) {
                    await models.Players.update({DMG_BUFF: 0}, {where: {Player_ID: player.Player_ID, Game_ID: gameId}});
                }
                break;
            }
        }

        //Update AP
        await models.Players.update({Action_Points: player.Action_Points - requiredAP}, {where: {Player_ID: player.Player_ID , Game_ID: gameId}});

        return interaction.editReply({ content: response });
    }
        catch (error) {
            console.log(error);
            return interaction.editReply({ content: "An error has occured + " + error.message + "!", ephemeral: true });
        }
    }

}