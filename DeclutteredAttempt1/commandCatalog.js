// commandCatalog.js - every command's Discord-facing text and options, in one
// place. Edit here to rename a command, reword a description, or change an
// option; nothing else needs touching.
//
// commands/_catalog.js turns an entry below into the SlashCommandBuilder each
// adapter exports as `data`, and into the spec its readOptions call uses, so a
// name or kind written here is the only one there is.
//
// Entry shape:
//   '<command name>': {
//     description: 'shown in the slash command picker, 1-100 characters',
//     defaultMemberPermissions: '0',   // optional; '0' hides it from non-admins
//     options: {                        // optional; declaration order is the
//       '<option name>': {              // order Discord shows them in, so
//         kind: 'integer',              // required options must come first
//         description: '1-100 characters',
//         required: true,               // optional, defaults to false
//         min: 1, max: 2,               // optional, integer/number only
//         choices: [{ name: 'Shown', value: 'sent' }],   // optional
//         channelTypes: [0],            // optional, channel only
//       },
//     },
//     subcommands: { ... },             // optional; same shape, and Discord
//                                       // forbids mixing these with options
//   }
//
// kind is one of: string, integer, number, boolean, user, channel, attachment.
// Every kind except attachment is read by readOptions; an attachment is read
// by its own adapter (see register.js), because it needs flattening to plain
// data before the logic layer sees it.

const COMMANDS = {

  //#region Player Commands

  'board': {
    description: 'shows the grid that you are on without input, and the inputted grid if given and your an Oracle',
    options: {
      'game': {
        kind: 'integer',
        description: 'which grid to show from which game, defaults to oldest active game',
      },
      'layer': {
        kind: 'integer',
        description: 'which layer of that grid to show, defaults to the one you are on',
      },
      'body': {
        kind: 'integer',
        description: '(FOR TWIN CLASS) Which body you are trying to see, defaults to 1',
        choices: [{ name: 'Body 1', value: 1 }, { name: 'Body 2', value: 2 }],
      },
    },
  },

  'gift': {
    description: 'gives a player in range an amount of AP',
    options: {
      'amount': {
        kind: 'integer',
        description: 'how much AP you wish to give, defaults to 1',
        required: true,
        min: 1,
      },
      'player': { kind: 'user', description: 'which player to give the AP to', required: true },
      'game': { kind: 'integer', description: 'which game, defaults to oldest active game' },
    },
  },

  'listgames': {
    description: 'lists all games',
  },

  'move': {
    description: 'moves a player <distance> tiles in <direction>',
    options: {
      'direction': {
        kind: 'string',
        description: 'which direction you are moving',
        required: true,
        choices: [{ name: 'left', value: 'east' }, { name: 'right', value: 'west' }, { name: 'up', value: 'north' }, { name: 'down', value: 'south' }, { name: 'nw', value: 'northwest' }, { name: 'ne', value: 'northeast' }, { name: 'sw', value: 'southwest' }, { name: 'se', value: 'southeast' }],
      },
      'distance': { kind: 'integer', description: 'how many tiles you move', required: true, min: 0 },
      'path': {
        kind: 'string',
        description: 'a list of DIRections and DISTances Ex: "dir,dist;dir,dist;...", required to move on an ice tile',
      },
      'body': {
        kind: 'integer',
        description: '(FOR TWIN CLASS) Which body you are trying to see, defaults to 1',
        min: 1,
        max: 2,
      },
      'game': { kind: 'integer', description: 'which game, defaults to oldest active game' },
    },
  },

  'override': {
    description: 'command for the Dead or Medium, overrides a Chaos Council Poll',
    options: {
      'option': {
        kind: 'integer',
        description: 'which option in the poll to choose to win, goes 1 from the top',
        required: true,
        min: 1,
        max: 3,
      },
      'game': { kind: 'integer', description: 'which game, defaults to oldest active game' },
    },
  },

  'register': {
    description: 'adds a player to a game',
    options: {
      'icon': {
        kind: 'attachment',
        description: 'represents your position on the game board, must be a 80x80 pixel png',
        required: true,
      },
      'game': { kind: 'integer', description: 'which game, defaults to oldest registering game' },
    },
  },

  'retrieve': {
    description: 'retrieves AP from a game\'s chest',
    options: {
      'amount': { kind: 'integer', description: '# of AP you wish to take out of the chest defaults to 1' },
      'game': { kind: 'integer', description: 'which game, defaults to oldest active game' },
    },
  },

  'shoot': {
    description: 'spend AP to attack another player in range',
    options: {
      'x': { kind: 'integer', description: 'X coordinate of which tile to attack', required: true },
      'y': { kind: 'integer', description: 'Y coordinate of which tile to attack', required: true },
      'target': { kind: 'user', description: 'who you are attacking', required: true },
      'amount': { kind: 'integer', description: '# of times you wish to attack the target defaults to 1' },
      'game': { kind: 'integer', description: 'which game, defaults to oldest active game' },
      'body': {
        kind: 'integer',
        description: '(FOR TWIN CLASS) Which body you are trying to see, defaults to 1',
        min: 1,
        max: 2,
      },
    },
  },

  'stats': {
    description: 'displays your stats in a given game',
    options: {
      'visible': {
        kind: 'boolean',
        description: 'wether the stats are publicly or privately shown',
        required: true,
      },
      'game': { kind: 'integer', description: 'which game, defaults to oldest active game' },
      'player': { kind: 'user', description: 'who\'s stats you want to see, defaults to you.' },
    },
  },

  'store': {
    description: 'stores AP in a game\'s chest',
    options: {
      'amount': { kind: 'integer', description: '# of AP you wish to take out of the chest defaults to 1' },
      'game': { kind: 'integer', description: 'which game, defaults to oldest active game' },
    },
  },

  'trace': {
    description: 'preview the tiles a shot would pass through, without spending any AP',
    options: {
      'x': { kind: 'integer', description: 'X coordinate of the tile you want to shoot', required: true },
      'y': { kind: 'integer', description: 'Y coordinate of the tile you want to shoot', required: true },
      'game': { kind: 'integer', description: 'which game, defaults to oldest active game' },
      'body': {
        kind: 'integer',
        description: '(FOR TWIN CLASS) Which body you are tracing from, defaults to 1',
        choices: [{ name: 'Body 1', value: 1 }, { name: 'Body 2', value: 2 }],
      },
    },
  },
  //#endregion Player Commands

  //#region Class Commands

  'build': {
    description: 'class command for Construction Workers, build wall on an empty tile or chest on a tile in range. 3AP',
    options: {
      'wall': {
        kind: 'boolean',
        description: 'build a wall or a chest, true = wall, false = chest',
        required: true,
      },
      'x': { kind: 'integer', description: 'X coordinate of which tile to build', required: true },
      'y': { kind: 'integer', description: 'Y coordinate of which tile to build', required: true },
      'game': { kind: 'integer', description: 'which game, defaults to oldest active game' },
    },
  },

  'burn': {
    description: 'class command for Pyromainiacs, turn any non-gateway tile in range into a fire tile for 4AP',
    options: {
      'x': { kind: 'integer', description: 'X coordinate of which tile to burn', required: true },
      'y': { kind: 'integer', description: 'Y coordinate of which tile to burn', required: true },
      'game': { kind: 'integer', description: 'which game, defaults to oldest active game' },
    },
  },

  'check-target': {
    description: 'class command for Hitmen, Get the location, name, and class of your target',
    options: {
      'game': { kind: 'integer', description: 'which game, defaults to oldest active game' },
    },
  },

  'conjure': {
    description: 'class command for Druids, turn any non-gateway tile in range into a storm tile for 4AP',
    options: {
      'x': {
        kind: 'integer',
        description: 'X coordinate of which tile to conjure a storm on',
        required: true,
      },
      'y': {
        kind: 'integer',
        description: 'Y coordinate of which tile to conjure a storm on',
        required: true,
      },
      'game': { kind: 'integer', description: 'which game, defaults to oldest active game' },
    },
  },

  'cook': {
    description: 'class command for Chef, give a player in range 2AP & 1 HP and recieve 1 AP.',
    options: {
      'customer': { kind: 'user', description: 'which player you cook for', required: true },
      'x': { kind: 'integer', description: 'X coordinate of your customer', required: true },
      'y': { kind: 'integer', description: 'Y coordinate of your customer', required: true },
      'game': { kind: 'integer', description: 'which game, defaults to oldest active game' },
    },
  },

  'deliver': {
    description: 'class command for Mailmen, give another player your AP',
    options: {
      'receiver': { kind: 'user', description: 'which player you deliver the AP to', required: true },
      'amount': { kind: 'integer', description: '# AP you wish to deliver', required: true, min: 1 },
      'game': { kind: 'integer', description: 'which game, defaults to oldest active game' },
    },
  },

  'dig': {
    description: 'class command for Gravediggers, turn any empty non-gateway tile  in range into a void tile for 4AP',
    options: {
      'x': { kind: 'integer', description: 'X coordinate of which tile to dig', required: true },
      'y': { kind: 'integer', description: 'Y coordinate of which tile to dig', required: true },
      'game': { kind: 'integer', description: 'which game, defaults to oldest active game' },
    },
  },

  'exorcise': {
    description: 'For Exorcists,turn any non-gateway tile in range to a blank tile(3AP)or remove a players class(16AP)',
    options: {
      'x': { kind: 'integer', description: 'X coordinate of which tile to exorcise', required: true },
      'y': { kind: 'integer', description: 'Y coordinate of which tile to exorcise', required: true },
      'player': {
        kind: 'user',
        description: 'which player to remove a class from, required if you wish to remove a class',
      },
      'game': { kind: 'integer', description: 'which game, defaults to oldest active game' },
    },
  },

  'freeze': {
    description: 'class command for Snowmen, turn any non-gateway tile in range into an ice tile for 3AP',
    options: {
      'x': { kind: 'integer', description: 'X coordinate of which tile to freeze', required: true },
      'y': { kind: 'integer', description: 'Y coordinate of which tile to freeze', required: true },
      'game': { kind: 'integer', description: 'which game, defaults to oldest active game' },
    },
  },

  'heal': {
    description: 'class command for Doctors, turn any non-gateway tile in range into a heal tile for 5AP',
    options: {
      'x': { kind: 'integer', description: 'X coordinate of which tile to heal', required: true },
      'y': { kind: 'integer', description: 'Y coordinate of which tile to heal', required: true },
      'game': { kind: 'integer', description: 'which game, defaults to oldest active game' },
    },
  },

  'hide': {
    description: 'class command for Hunter, turn any non-gateway tile in range into a bush tile for 5AP',
    options: {
      'x': { kind: 'integer', description: 'X coordinate of which tile to freeze', required: true },
      'y': { kind: 'integer', description: 'Y coordinate of which tile to freeze', required: true },
      'game': { kind: 'integer', description: 'which game, defaults to oldest active game' },
    },
  },

  'hotpotato': {
    description: 'class command for the Hot Potato, swap Classes with a player in range for 12AP',
    options: {
      'victim': { kind: 'user', description: 'which player to swap classes with', required: true },
      'x': { kind: 'integer', description: 'X coordinate of your victim', required: true },
      'y': { kind: 'integer', description: 'Y coordinate of your victim', required: true },
      'game': { kind: 'integer', description: 'which game, defaults to oldest active game' },
    },
  },

  'lock': {
    description: 'For Guardians lock/unlock a gateway tile in range(2AP),during a finale 1 Gateway/layer must be open',
    options: {
      'x': { kind: 'integer', description: 'X coordinate of which gateway to lock/unlock', required: true },
      'y': { kind: 'integer', description: 'Y coordinate of which gateway to lock/unlock', required: true },
      'game': { kind: 'integer', description: 'which game, defaults to oldest active game' },
    },
  },

  'punish': {
    description: 'spend 4 AP to deal (targets Missed AP+HP) damage to another player in range',
    options: {
      'x': { kind: 'integer', description: 'X coordinate of which tile to attack', required: true },
      'y': { kind: 'integer', description: 'Y coordinate of which tile to attack', required: true },
      'target': { kind: 'user', description: 'who you are attacking', required: true },
      'game': { kind: 'integer', description: 'which game, defaults to oldest active game' },
    },
  },

  'resurrect': {
    description: 'class command for Necromancers, resurrects a player to a tile for 12AP',
    options: {
      'player': { kind: 'user', description: 'which player you wish to resurrect', required: true },
      'x': {
        kind: 'integer',
        description: 'X coordinate of which tile to resurrect the player on',
        required: true,
      },
      'y': {
        kind: 'integer',
        description: 'Y coordinate of which tile to resurrect the player on',
        required: true,
      },
      'layer': {
        kind: 'integer',
        description: 'layer of which tile to resurrect the player on, defaults to players current layer',
      },
      'game': { kind: 'integer', description: 'which game, defaults to oldest active game' },
    },
  },

  'shove': {
    description: 'Bully class command: force a player next to you one tile away for 1 AP',
    options: {
      'target': { kind: 'user', description: 'who you are shoving', required: true },
      'direction': {
        kind: 'string',
        description: 'as if you turned to face them: back is straight ahead, left and right are 45 degrees either side',
        required: true,
        choices: [{ name: 'left', value: 'left' }, { name: 'back', value: 'back' }, { name: 'right', value: 'right' }],
      },
      'game': { kind: 'integer', description: 'which game, defaults to your oldest' },
    },
  },

  'smoke': {
    description: 'class command for Smokers, turn a blank tile in range into a smoke tile for 1AP',
    options: {
      'x': { kind: 'integer', description: 'X coordinate of which tile to smoke', required: true },
      'y': { kind: 'integer', description: 'Y coordinate of which tile to smoke', required: true },
      'game': { kind: 'integer', description: 'which game, defaults to oldest active game' },
    },
  },

  'snipe': {
    description: 'class command for the Sniper, pierce walls and hit anyone in the path of attack',
    options: {
      'x': { kind: 'integer', description: 'X coordinate of which tile to attack', required: true },
      'y': { kind: 'integer', description: 'Y coordinate of which tile to attack', required: true },
      'target': { kind: 'user', description: 'who you are attacking', required: true },
      'amount': { kind: 'integer', description: '# of times you wish to attack the target defaults to 1' },
      'game': { kind: 'integer', description: 'which game, defaults to oldest active game' },
    },
  },

  'stab': {
    description: 'spend 1 AP to deal x2 dmg(up to max) to another player on your tile',
    options: {
      'target': { kind: 'user', description: 'who you are attacking', required: true },
      'amount': { kind: 'integer', description: '# of times you wish to stab the target defaults to 1' },
      'game': { kind: 'integer', description: 'which game, defaults to oldest active game' },
    },
  },

  'swap': {
    description: 'class command for Switchmates, swap places with any player for 4AP',
    options: {
      'victim': { kind: 'user', description: 'which player to swap places with', required: true },
      'game': { kind: 'integer', description: 'which game, defaults to oldest active game' },
    },
  },

  'timestop': {
    description: 'command for Clockwatchers, be the only one who can do anything for 4AP distributions, costs 12AP',
    options: {
      'game': { kind: 'integer', description: 'which game, defaults to oldest active game' },
    },
  },

  'trap': {
    description: 'class command for Minesweepers, plants a mine on a tile in range for 1AP',
    options: {
      'x': { kind: 'integer', description: 'X coordinate of which tile to smoke', required: true },
      'y': { kind: 'integer', description: 'Y coordinate of which tile to smoke', required: true },
      'game': { kind: 'integer', description: 'which game, defaults to oldest active game' },
    },
  },

  'upgrade': {
    description: 'provides buttons to upgrade your stats',
    options: {
      'stat': {
        kind: 'string',
        description: 'which stat you are upgrading',
        required: true,
        choices: [{ name: 'health', value: 'Health_Points' }, { name: 'damage', value: 'Damage' }, { name: 'range', value: 'Range_' }],
      },
      'amount': { kind: 'integer', description: '# of times you wish to upgrade the stat defaults to 1' },
      'game': { kind: 'integer', description: 'which game, defaults to oldest active game' },
      'body': {
        kind: 'integer',
        description: '(FOR TWIN CLASS) Which body you are trying to see, defaults to 1',
        min: 1,
        max: 2,
      },
    },
  },

  'warp': {
    description: 'Teleport to a random gateway tile on the layer ^/V Dimensional Hoppers land on any tile',
    options: {
      'up-or-down': {
        kind: 'boolean',
        description: 'teleport up or down, true = up, false = down',
        required: true,
      },
      'game': { kind: 'integer', description: 'which game, defaults to oldest registering game' },
    },
  },

  'weaponize': {
    description: 'class command for Blacksmiths, give a x2 dmg buff to anyone in range\'s next attack for 6AP',
    options: {
      'player': {
        kind: 'user',
        description: 'which player you wish to give the buff to, defaults to yourself',
      },
      'x': {
        kind: 'integer',
        description: 'X coordinate of the player to give the buff to, defaults to your current tile',
      },
      'y': {
        kind: 'integer',
        description: 'Y coordinate of the player to give the buff to, defaults to your current tile',
      },
      'game': { kind: 'integer', description: 'which game, defaults to oldest active game' },
    },
  },
  //#endregion Class Commands

  //#region Developer Commands

  'call-db': {
    description: 'general database call command, usually only for dev or sandbox',
    subcommands: {
      'find-all': {
        description: 'get all entries of the model',
        options: {
          'model': {
            kind: 'string',
            description: 'which model',
            required: true,
            choices: [{ name: 'Players', value: 'Players' }, { name: 'Games', value: 'Games' }, { name: 'Classes', value: 'Classes' }, { name: 'Tiles', value: 'Tiles' }, { name: 'Layers', value: 'Layers' }],
          },
        },
      },
      'find-by-primary-key': {
        description: 'get an entry by pk',
        options: {
          'model': {
            kind: 'string',
            description: 'which model',
            required: true,
            choices: [{ name: 'Players', value: 'Players' }, { name: 'Games', value: 'Games' }, { name: 'Classes', value: 'Classes' }, { name: 'Tiles', value: 'Tiles' }, { name: 'Layers', value: 'Layers' }],
          },
        },
      },
      'update-player': {
        description: 'update a player',
        options: {
          'model': {
            kind: 'string',
            description: 'which model',
            required: true,
            choices: [{ name: 'Players', value: 'Players' }, { name: 'Games', value: 'Games' }, { name: 'Classes', value: 'Classes' }, { name: 'Tiles', value: 'Tiles' }, { name: 'Layers', value: 'Layers' }],
          },
        },
      },
    },
  },

  'change-gamestate': {
    description: 'starts a game, and if it doesnt find one then creates one',
    options: {
      'game': { kind: 'integer', description: 'which game to change', required: true },
      'gamestate': {
        kind: 'string',
        description: 'which gamestate to change it to',
        required: true,
        choices: [{ name: 'Registration', value: 'REGISTRATION' }, { name: 'Active', value: 'ACTIVE' }, { name: 'Over', value: 'OVER' }, { name: 'TimeStopped', value: 'TIMESTOPPED' }, { name: 'DevPaused', value: 'DEV_PAUSED' }, { name: 'Finale', value: 'FINALE' }, { name: 'Finished', value: 'INACTIVE' }],
      },
    },
  },

  'create-board': {
    description: 'builds a game\'s layers and tiles from a board preset',
    options: {
      'preset': { kind: 'string', description: 'which preset in database/boards/, leave empty to list them' },
      'game': { kind: 'integer', description: 'the game to build the board for' },
      'replace': {
        kind: 'boolean',
        description: 'replace an existing board for this game, defaults to false',
      },
    },
  },

  'create-game': {
    description: 'creates a new game',
    options: {
      'ap-distribution-interval': {
        kind: 'integer',
        description: 'how often players recieve ap in minutes, defaults to 720 (12 hours)',
      },
      'chest-amount': {
        kind: 'integer',
        description: 'how many AP in the chest at the start of the game, defaults to 0',
      },
      'current-chaos-council-event': {
        kind: 'string',
        description: 'a starting chaos council event, defaults to null',
      },
      'movement-cost': {
        kind: 'integer',
        description: 'how many AP it costs to move one square, defaults to 1',
      },
      'shoot-cost': { kind: 'integer', description: 'how many AP it costs to attack, defaults to 2' },
      'fire-damage': {
        kind: 'integer',
        description: 'how much damage moving onto and off of a fire tile does, defaults to 1',
      },
      'mine-damage': {
        kind: 'integer',
        description: 'how much damage moving onto a mine/trapped tile does, defaults to 1',
      },
      'class-blacklist': {
        kind: 'string',
        description: 'a comma separated list of classes that cannot be in this game, defaults to null',
      },
      'chaos-council-boolean': {
        kind: 'integer',
        description: 'whether or not the game has chaos council events, defaults to true',
      },
      'class-dupe-limit': {
        kind: 'integer',
        description: 'the maximum number of players allowed of a single class in the game, defaults to 2',
      },
      'max-stat-increase': {
        kind: 'integer',
        description: 'the amount the max stats increase when a player gets a kill, defaults to 1',
      },
      'finale-player-threshold': {
        kind: 'integer',
        description: 'the minimum number of players required to start the finale, defaults to 4',
      },
      'ap-amount': { kind: 'integer', description: 'how much AP is given each distribution, defaults to 2' },
      'immutable-doomsday': {
        kind: 'integer',
        description: 'how many AP distributions until immutables are killed, defaults to 32',
      },
    },
  },

  'grid_dev': {
    description: 'shows that games grid and layer, dev command',
    options: {
      'layer': { kind: 'string', description: 'which layer to show', required: true },
      'game': { kind: 'string', description: 'which grid to show from which game', required: true },
    },
  },

  'reload-commands': {
    description: 'Reloads all commands.',
    defaultMemberPermissions: 'BanMembers',
    contexts: ['Guild'],
  },

  'set-dead-chat': {
    description: 'point a game\'s chaos council poll at a channel',
    defaultMemberPermissions: 'ManageGuild',
    options: {
      'game': { kind: 'integer', description: 'which game', required: true },
      'channel': { kind: 'channel', description: 'the dead chat channel', required: true, channelTypes: [0] },
    },
  },

  'timestop-dev': {
    description: 'pauses the game',
    options: {
      'game': { kind: 'integer', description: 'which game, defaults to oldest active game' },
    },
  },
  //#endregion Developer Commands
};

module.exports = { COMMANDS };
