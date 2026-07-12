// const { SlashCommandBuilder, RoleManager, Role } = require('discord.js');
// var models = require("../utils.js").models;

// module.exports = {
//     data: new SlashCommandBuilder()
//         .setName('createroles')
//         .setDescription('create roles for a game')
//         .setContexts(0),
//     async execute(interaction) {
//         await interaction.deferReply();
//         //Variables
//         const rm = new RoleManager(interaction.guild);
//         const allClassRoleColors = await models.Classes.findAll({attributes: [ "Role_Color" ]});
//         const allClasses = await models.Classes.findAll();

//         //Create Roles

//         for (var i = 0; i < allClasses.length; i++) {
//             await rm.create({
//                 name: allClasses[i].Class_Name,
//                 color: `#${allClassRoleColors[i].Role_Color}`,
//                 position: i
//             });
//         }

//         await interaction.editReply("Roles Created!");
//     },
// };