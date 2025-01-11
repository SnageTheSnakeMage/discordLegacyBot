module.exports = {
    // Set this to the name of the mod. This is what will be shown inside of Discord Bot Studio.
    // THIS FILE NAME MUST BE THIS VALUE WITH SPACES REMOVED
    name: "Html To Image",

    // Place the author of the mod here. This is an array so you can add other authors by writing ["Great Plains Modding", "New User"]
    author: ["SnageTheSnakeMage, ('snage.' on discord)"],

    // Place the version of the mod here.
    version: "1.0.0",

    // Whenever you make a change, please place the changelog here with your name. Created Send Message ~ Great Plains Modding\n
    changelog: "initCommit ~ SnageTheSnakeMage",

    // Set this to true if this will be an event. Note events wont show up in DBS.
    isEvent: false,
    
    isResponse: true,

    // Set this to true if this will be a response mod.
    isMod: true,

    // If you want to modify a core feature, set this to true.
    isAddon: false,

    // Here you can define where you want your mod to show up inside of Discord Bot Studio
    section: "Message",

    // Place your html to show inside of Discord Bot Studio when they select your mod.
    html: function(data) {
        return `
            <div class="form-group">
                <label>localhost url</label>
                    <div class="input-group mb-3">
                        <input class="form-control" id="url" name="url">
                        <div class="input-group-append">
                        <a class="btn btn-outline-primary" role="button" id="variables" forinput="url">Insert Variable</a>
                    </div>
                </div>
        `;
    },

    // When the bot is first started, this code will be ran.
    init: function() {
        console.log("Loaded htmlToImage");
    },

    // Place your mod here.
    mod: function(DBS, message, action, args, command, index) {
        const fetch = require('node-fetch');
        function par(act){
            return DBS.BetterMods.parseAction(act, message)
        }

        const url = par(action.url)

        // Note DBS stores all data from the HTML field into lowercase. messageText = messagetext
        const htmlPageUrl = url; 
        async function  getImageFromHtml() {
            const imageResponse = await fetch(`${htmlPageUrl}/screenshot`);
            const imageBuffer = await imageResponse.buffer();

            message.channel.send({ attachment: [imageBuffer] });
        }
        getImageFromHtml();

        // Remember to use callNextAction or the bot wont continue any actions after this mod.
        DBS.callNextAction(command, message, args, index + 1);
    }
};