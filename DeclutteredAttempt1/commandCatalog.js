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
    description: 'lists games, by default the ones you can still register for',
    options: {
      'gamestate': {
        kind: 'string',
        description: 'which games to list, defaults to the ones open for registration',
        choices: [
          { name: 'Registration', value: 'REGISTRATION' },
          { name: 'Active', value: 'ACTIVE' },
          { name: 'DevPaused', value: 'DEV_PAUSED' },
          { name: 'Over', value: 'OVER' },
          { name: 'All', value: 'ALL' },
        ],
      },
    },
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
        description: 'represents your position on the game board, must be a square png or jpeg',
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

  // /sandbox - debug powers for a game with the sandbox flag set. Each
  // subcommand is its own key; Discord forbids mixing subcommands with
  // top-level options, so the game option is repeated on each one.
  'sandbox': {
    description: 'debug tools for a game with the sandbox flag set',
    subcommands: {
      'get-tile-id': {
        description: 'look up the Tile_ID of a tile by its position',
        options: {
          'x': { kind: 'integer', description: 'X_Position of the tile', required: true },
          'y': { kind: 'integer', description: 'Y_Position of the tile', required: true },
          'layer': { kind: 'integer', description: 'which layer of the board, 1 being the first', required: true, min: 1 },
          'game': { kind: 'integer', description: 'which sandbox game, defaults to your oldest one' },
        },
      },
      'get-classes': {
        description: 'send the classes csv so you can see every Class_ID',
        options: {
          'game': { kind: 'integer', description: 'which sandbox game, defaults to your oldest one' },
        },
      },
      'reset': {
        description: 'wipe yourself from the board and the DB, then respawn as if newly registered',
        options: {
          'game': { kind: 'integer', description: 'which sandbox game, defaults to your oldest one' },
        },
      },
      'set-stat': {
        description: 'set one of your own combat or resource stats',
        options: {
          'stat': {
            kind: 'string',
            description: 'which stat to set',
            required: true,
            choices: [{ name: 'Action_Points', value: 'Action_Points' }, { name: 'MAX_AP', value: 'MAX_AP' }, { name: 'MISSED_AP', value: 'MISSED_AP' }, { name: 'Health_Points', value: 'Health_Points' }, { name: 'MAX_HP', value: 'MAX_HP' }, { name: 'MISSED_HP', value: 'MISSED_HP' }, { name: 'Health_Points2', value: 'Health_Points2' }, { name: 'Damage', value: 'Damage' }, { name: 'MAX_DAMAGE', value: 'MAX_DAMAGE' }, { name: 'Damage2', value: 'Damage2' }, { name: 'DMG_BUFF', value: 'DMG_BUFF' }, { name: 'Range_', value: 'Range_' }, { name: 'MAX_RANGE', value: 'MAX_RANGE' }, { name: 'Range2', value: 'Range2' }, { name: 'Free_Move', value: 'Free_Move' }, { name: 'Free_Move2', value: 'Free_Move2' }, { name: 'Kills', value: 'Kills' }, { name: 'Meals', value: 'Meals' }, { name: 'Pharoh_HP', value: 'Pharoh_HP' }, { name: 'cCOverides', value: 'cCOverides' }],
          },
          'value': { kind: 'integer', description: 'the value to set it to', required: true },
          'game': { kind: 'integer', description: 'which sandbox game, defaults to your oldest one' },
        },
      },
      'set-meta': {
        description: 'set your class, position, or one of your other non-stat columns',
        options: {
          'field': {
            kind: 'string',
            description: 'which field to set',
            required: true,
            choices: [{ name: 'Class_ID', value: 'Class_ID' }, { name: 'Tile_ID', value: 'Tile_ID' }, { name: 'Tile_ID2', value: 'Tile_ID2' }, { name: 'Dead', value: 'Dead' }, { name: 'MarkedForDeath', value: 'MarkedForDeath' }, { name: 'Hitman_Target', value: 'Hitman_Target' }, { name: 'HP_COST', value: 'HP_COST' }, { name: 'RANGE_COST', value: 'RANGE_COST' }, { name: 'DAMAGE_COST', value: 'DAMAGE_COST' }],
          },
          'value': { kind: 'integer', description: 'the value to set it to', required: true },
          'game': { kind: 'integer', description: 'which sandbox game, defaults to your oldest one' },
        },
      },
      'ap-time': {
        description: 'set how often this game distributes AP, in minutes',
        options: {
          'minutes': { kind: 'integer', description: 'AP_INTERVAL_MIN, the gap between distributions', required: true, min: 1 },
          'game': { kind: 'integer', description: 'which sandbox game, defaults to your oldest one' },
        },
      },
      'ap-tick': {
        description: 'run AP distributions right now, without waiting for the interval',
        options: {
          'times': { kind: 'integer', description: 'how many distributions to run, 1 to 20', required: true, min: 1, max: 20 },
          'game': { kind: 'integer', description: 'which sandbox game, defaults to your oldest one' },
        },
      },
      'set-chaos': {
        description: 'set this game\'s current chaos event - view-chaos lists the names',
        options: {
          'event': { kind: 'string', description: 'the event name, exactly as view-chaos spells it', required: true },
          'game': { kind: 'integer', description: 'which sandbox game, defaults to your oldest one' },
        },
      },
      'summon-dummy': {
        description: 'put a fake player on a tile, to have something to shoot at',
        options: {
          'tile-id': { kind: 'integer', description: 'Tile_ID to stand it on - get-tile-id finds one', required: true },
          'class-id': { kind: 'integer', description: 'Class_ID to give it - get-classes lists them', required: true },
          'game': { kind: 'integer', description: 'which sandbox game, defaults to your oldest one' },
        },
      },
      'view-chaos': {
        description: 'list the chaos events set-chaos will accept, and the current one',
        options: {
          'game': { kind: 'integer', description: 'which sandbox game, defaults to your oldest one' },
        },
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
        choices: [{ name: 'Registration', value: 'REGISTRATION' }, { name: 'Active', value: 'ACTIVE' }, { name: 'DevPaused', value: 'DEV_PAUSED' }, { name: 'Over', value: 'OVER' }],
      },
    },
  },

  // /gameflags - the four booleans that are not points in a game's life.
  // `set` is the dev's, on any game; `sandbox` is for players in a sandbox
  // game, who need the same switches on the game they are testing in.
  'gameflags': {
    description: 'set the flags that are not gamestates: the clock, time stop, the finale, sandbox mode',
    subcommands: {
      'set': {
        description: 'dev only: set one flag on any game',
        options: {
          'flag': {
            kind: 'string',
            description: 'which flag to set',
            required: true,
            choices: [{ name: 'gameActive (the clock: AP and chaos polls)', value: 'gameActive' }, { name: 'timeStopped (only Clockwatchers may act)', value: 'timeStopped' }, { name: 'finale', value: 'finale' }, { name: 'sandbox', value: 'sandbox' }],
          },
          'value': { kind: 'boolean', description: 'what to set it to', required: true },
          'game': { kind: 'integer', description: 'which game to change, defaults to the oldest being played' },
        },
      },
      'sandbox': {
        description: 'set a flag on a sandbox game you are in',
        options: {
          'flag': {
            kind: 'string',
            description: 'which flag to set',
            required: true,
            choices: [{ name: 'gameActive (the clock: AP and chaos polls)', value: 'gameActive' }, { name: 'timeStopped (only Clockwatchers may act)', value: 'timeStopped' }, { name: 'finale', value: 'finale' }],
          },
          'value': { kind: 'boolean', description: 'what to set it to', required: true },
          'game': { kind: 'integer', description: 'which sandbox game, defaults to your oldest one' },
        },
      },
      'show': {
        description: 'show a game\'s state and flags',
        options: {
          'game': { kind: 'integer', description: 'which game, defaults to the oldest being played' },
        },
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
