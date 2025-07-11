import { models } from '../utils';
const { Events } = require('discord.js');

module.exports = {
	name: Events.MessagePollVoteAdd,
    async execute(interaction) {
        var game = models.Games.findOne({where: {currentChaosPollMsgId: interaction.message.id}})
        var deadPlayersInGame = models.Players.findAndCountAll({where: {Game_ID: game.Game_ID, Dead: true}})
        if(game){
            if(interaction.pollAnswer.voteCount > deadPlayersInGame.count / 2 && !game.overidden){
                await models.Games.update({NEXT_CC_EVENT: interaction.pollAnswer.answer}, {where: {Game_ID: game.Game_ID}});
                game.currentChaosPollMsgId.poll.end();
                game.currentChaosPollMsgId = null;
            }
        }
    }
}