const { SlashCommandBuilder } = require('discord.js');
const utils = require('../../utils');
var models = utils.models;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('warp')
        .setDescription('Teleport to a random gateway tile on the layer ^/V Dimensional Hoppers land on any tile')
        .addBooleanOption(option =>
            option.setName('up-or-down')
                .setDescription('teleport up or down, true = up, false = down')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('game')
                .setDescription('which game, defaults to oldest registering game')
                .setRequired(false)),
    async execute(interaction) {
        await interaction.deferReply();
        //Variables
        const gameID = interaction.options.getInteger('game') ?? await utils.getOldestGameId();
        const up = interaction.options.getBoolean('up?');
        const userID = interaction.user.id;
        const game = await models.Games.findByPk(gameID);
        //Get player
        const player = await models.Players.findOne({ where: { Game_ID: gameID, Discord_ID: userID } });

        //Get current tile
        const currentTile = await models.Tiles.findOne({ where: { Tile_ID: player.Tile_ID } });

        //Get current layer
        const currentLayer = await models.Layers.findOne({ where: { Layer_ID: currentTile.Layer_ID } });

        if (!newLayer) {
            return interaction.reply({ content: "Could not find a" + (up ? "layer above" : "layer below") + " layer: " + currentLayer.Layer_ID, ephemeral: true });
        }

        //Check Gamestate
        if(await utils.checkGameState(game.GAME_STATE, false, interaction)){
            return
        }

        //Check player is either a Dimensional Hopper or on a Gateway tile
       const dimensionalHopperClass = await models.Classes.findOne({ where: { Class_Name: "Dimensional Hopper" } });
        if (player.Class_ID == dimensionalHopperClass?.Class_ID || currentTile.Tile_Type == "Gateway_Open") {

            //Get new layer
            const newLayer = up ? await models.Layers.findOne({ where: { Layer_ID: currentLayer.Layer_Above } }) : await models.Layers.findOne({ where: { Layer_ID: currentLayer.Layer_Below } });
            var newTile;
            //Get new tile
            if(currentTile.Tile_Type == "Gateway_Open"){
                const possibleTiles = await models.Tiles.findAll({ where: { Layer_ID: newLayer.Layer_ID, Tile_Type: "Gateway_Open"} });
                for (tile in possibleTiles){
                    if(possibleTiles[tile].Player1 != null && possibleTiles[tile].Player2 != null && possibleTiles[tile].Player3 != null && possibleTiles[tile].Player4 != null){
                        possibleTiles.splice(tile, 1);
                    }
                }
                if(possibleTiles.length == 0){
                    return interaction.reply({ content: "There are no available(not full or locked) gateways on the " + (up ? "layer above" : "layer below") + " you!", ephemeral: true });
                }
                newTile = possibleTiles[utils.getRandomInt(possibleTiles.length)];
                
            }
            else{
                const possibleTiles = await models.Tiles.findAll({ where: { Layer_ID: newLayer.Layer_ID } });
                for (tile in possibleTiles){
                   for (const tile in possibleTiles){
                     if(possibleTiles[tile].Player1 != null && possibleTiles[tile].Player2 != null && possibleTiles[tile].Player3 != null && possibleTiles[tile].Player4 != null || possibleTiles[tile].Tile_Type == "Void" || possibleTiles[tile].Tile_Type == "Wall" || possibleTiles[tile].Tile_Type == "Wall_Damaged" || possibleTiles[tile].Tile_Type == "Gateway_Locked"){
                        possibleTiles.splice(tile, 1);
                    }
                }
                if(possibleTiles.length == 0){
                    return interaction.reply({ content: "There are no available(not full, wall, damaged wall, void, ice, or locked gateway) tiles on the " + (up ? "layer above" : "layer below") + " you!", ephemeral: true });
                }
                newTile = possibleTiles[utils.getRandomInt(possibleTiles.length)];
            }

            //Teleport player to new tile
            await models.Players.update({ Tile_ID: newTile.Tile_ID }, { where: { Game_ID: gameID, Discord_ID: userID } });
            if (currentTile.Tile_Type == "Gateway_Open") return interaction.reply({ content: "Teleported to a random gateway tile on the " + (up ? "layer above" : "layer below") + " you!\n Check out where you are with the board command!" });
            else return interaction.reply({ content: "Teleported to a random tile on the " + (up ? "layer above" : "layer below") + " you!\n Check out where you are with the stats or board command!" });
        }}
        else{ 
            return interaction.reply({ content: "You must be on a Gateway tile or a Dimensional Hopper to use this command!", ephemeral: true });
        }
    }
};