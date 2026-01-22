const { SlashCommandBuilder, ActionRowBuilder, range } = require('discord.js');
const utils = require('../../utils');
var models = utils.models;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('upgrade')
        .setDescription('provides buttons to upgrade your stats')
        .addStringOption(option =>
            option.setName('stat')
                .setDescription('which stat you are upgrading')
                .setRequired(true)
                .addChoices(
                    { name: "health", value: "Health_Points" },
                    { name: "damage", value: "Damage" },
                    { name: "range", value: "Range_" },)
                .setAutocomplete(true))
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('# of times you wish to upgrade the stat defaults to 1')
                .setRequired(false)
        .addIntegerOption(option =>
            option.setName('game')
                .setDescription('which game, defaults to oldest active game')
                .setRequired(false))    ),
    async execute(interaction) {
        await interaction.deferReply();

        try {

        //Variables
        const gameId = await models.Games.findByPk(interaction.options.getInteger('game'));
        const player = await models.Players.findOne({where: {Game_ID: gameId, Discord_ID: interaction.user.id}}); 
        const stat = interaction.options.getString('stat');
        const amount = interaction.options.getInteger('amount') ?? 1;
        const game = await models.Games.findByPk(gameId ?? await utils.getOldestActiveGameId());

        const rangeAndHpCostArray = [4,5,7,10]
        const damageCostArray = [12,14,16]
        var hpBuyIndex
        var rangeBuyIndex
        var damageBuyIndex

        //Get Price
        const price = await utils.getUpgradePrice(stat, player.playerId, amount);
        
        //Check if the game is in timestop
        if(game.GAME_STATE == GAMESTATES.TIMESTOPPED && playerClass.Class_Name != "Clockwatcher")
        {
          await interaction.editReply("Time is stopped! only Clockwatchers can use commands at this time.");
          return
        }
        //Check if the game is paused
        if(game.GAME_STATE == GAMESTATES.PAUSED)
        {
          await interaction.editReply("Game is paused! only the dev can use commands for this game at this time.");
          return
        }

        
        switch (stat) {
            case "Health_Points":
                switch(player.HP_COST) {
                    case 4:
                        hpBuyIndex = 0;
                        break;
                    case 5:
                        hpBuyIndex = 1;
                        break;
                    case 7:
                        hpBuyIndex = 2;
                        break;
                    case 10:
                        hpBuyIndex = 3;
                        break;
                    default:
                        throw new Error("Incorrect initial range and/or health cost for player");
                }
                break;
            case "Range_":
                switch(player.RANGE_COST) {
                    case 4:
                        rangeBuyIndex = 0;
                        break;
                    case 5:
                        rangeBuyIndex = 1;
                        break;
                    case 7:
                        rangeBuyIndex = 2;
                        break;
                    case 10:
                        rangeBuyIndex = 3;
                        break;
                    default:
                        throw new Error("Incorrect initial range and/or health cost for player");
                }
                break;
            case "Damage":
                switch(player.DAMAGE_COST) {
                    case 12:
                        damageBuyIndex = 0;
                        break;
                    case 14:
                        damageBuyIndex = 1;
                        break;
                    case 16:
                        damageBuyIndex = 2;
                        break;
                    default:
                        throw new Error("Incorrect initial damage cost for player");
                }
                break;
        }


        //Check if player has enough AP
        if (player.Action_Points < price) {
            return interaction.editReply({ content: "You don't have enough AP to upgrade that much!\n You need " + (price - player.Action_Points) + " more AP." });
        }

        //Check if player can even upgrade that much
        switch(stat) {
            case "Health_Points":
                if (player.HP + amount > player.MAX_HP) {
                    return interaction.editReply({ content: "You can't upgrade your health past " + player.MAX_HP + "! Unless you kill some people :)" });
                }
                break;
            case "Range_":
                if (player.Range + amount > player.MAX_RANGE) {
                    return interaction.editReply({ content: "You can't upgrade your range past" + player.MAX_RANGE + "! Unless you kill some people :)" });
                }
                break;
            case "Damage":
                if (player.Damage + amount > player.MAX_DAMAGE) {
                    return interaction.editReply({ content: "You can't upgrade your damage past"+ player.MAX_DAMAGE +"! Unless you kill some people :)" });
                }
                break;
        }

        //Make Confirmation Buttons
        const confirm = new ButtonBuilder()
			.setCustomId('confirm')
			.setLabel(`Buy ${amount} ${stat} for ${price}.`)
			.setStyle(ButtonStyle.Danger);

		const cancel = new ButtonBuilder()
			.setCustomId('cancel')
			.setLabel('Cancel')
			.setStyle(ButtonStyle.Secondary);

        //make Action Row
        const row = new ActionRowBuilder().addComponents([confirm, cancel]);

        //Send Confirmation
        await interaction.editReply({ content: "Are you sure you want to buy " + amount + " " + stat + " for " + price + " AP?", components: [row] });

        const senderFilter = i => i.user.id === interaction.user.id;

        try {
	        const confirmation = await response.resource.message.awaitMessageComponent({ filter: senderFilter, time: 60_000 });
            if (confirmation.customId === 'confirm') {
                await models.Players.update({Action_Points: player.Action_Points - price}, {where: {playerId: player.playerId}}); //Update AP
                switch(stat) {//Update Stat
                    case "Health_Points":
                        await models.Players.update({Health_Points: player.Health_Points + amount}, {where: {playerId: player.playerId}}); 
                        if(hpBuyIndex == 3) await models.Players.update({HP_COST: 10}, {where: {playerId: player.playerId}});
                        else await models.Players.update({HP_COST: rangeAndHpCostArray[hpBuyIndex + 1]}, {where: {playerId: player.playerId}});
                        break;
                    case "Range_":
                        await models.Players.update({Range_: player.Range_ + amount}, {where: {playerId: player.playerId}}); 
                        if(rangeBuyIndex == 3) {
                            await models.Players.update({RANGE_COST: 10}, {where: {playerId: player.playerId}});
                        }
                        else await models.Players.update({RANGE_COST: rangeAndHpCostArray[rangeBuyIndex + 1]}, {where: {playerId: player.playerId}});
                        break;
                    case "Damage":
                        await models.Players.update({Damage: player.Damage + amount}, {where: {playerId: player.playerId}}); 
                        if(damageBuyIndex == 2) await models.Players.update({DAMAGE_COST: 16}, {where: {playerId: player.playerId}});
                        else await models.Players.update({DAMAGE_COST: damageCostArray[damageBuyIndex + 1]}, {where: {playerId: player.playerId}});
                        break;
                }
                await interaction.editReply({ content: "Successfully upgraded " + stat + " by " + amount + " for " + price + " AP!", components: [] });
            }
        } catch {
	        await interaction.editReply({ content: 'Confirmation not received within 1 minute, cancelling', components: [] });
        }
    }
    catch (error) {
        console.error(error);
        await interaction.editReply({ content: 'There was an error while executing this command!', ephemeral: true });
    }
}
};