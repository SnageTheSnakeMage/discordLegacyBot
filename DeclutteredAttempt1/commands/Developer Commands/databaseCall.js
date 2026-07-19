//  const { SlashCommandBuilder } = require('discord.js');
// var models = require("../../utils.js").models;
// var GAMESTATES = require('../../enums.js').GAMESTATES;

// module.exports = {
//     data: new SlashCommandBuilder()
//         .setName('call-db')
//         .setDescription('general database call command, usually only for dev or sandbox')
//         .addSubcommand((subcommand) => 
//             subcommand.setName("find-all")
//             .setDescription("get all entries of the model"))
//         .addSubcommand((subcommand) => 
//             subcommand.setName("find-by-primary-key")
//             .setDescription("get an entry by pk"))
//         .addSubcommand((subcommand) => 
//             subcommand.setName("update-player"))
//         .addStringOption(option => 
//             option.setName("model")
//             .setDescription('which model')
//             .addChoices(
//                 {name: 'Players', value: 'Players'},
//                 {name: 'Games', value: 'Games'},
//                 {name: 'Classes', value: 'Classes'},
//                 {name: 'Tiles', value: 'Tiles'},
//                 {name: 'Layers', value: 'Layers'},
//             )
//             .setRequired(true)),
//     async execute(interaction) {
//         switch(interaction.options.getString('Model')){
//             case "Players":
                
//                 break;
//             case "Games":
//                 break;
//             case "Classes":
//                 break;
//             case "Tiles":
//                 break;
//             case "Layers":
//                 break;
//         }
//     }
// }