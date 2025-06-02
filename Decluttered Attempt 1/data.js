
    // [
    //     type,
    //     x_pos,
    //     y_pos,
    //     layer
    //     players[],
    //          name/Id,
    //          ap,
    //          max_ap,
    //          hp,
    //          max_hp,
    //          range,
    //          max_range,
    //          damage,
    //          max_damage,
    //          tile,
    //          class_id
    //     trapped?, 
    // ]
var GameData = [
   [//Game 0 
        [//GameGrid 0
            [//Layer 0
                [//Row 0
                    ["Blank1", [], false], ["Blank2", [], false], ["Blank1", [], false], ["Blank2", [], false], ["Blank1", [], false], ["Blank2", [], false], ["Blank1", [], false], ["Blank2", [], false], ["Blank1", [], false], ["Blank2", [], false]
                ],
                [//Row 1
                    ["Blank2", [], false], ["Blank1", [], false], ["Blank2", [], false], ["Blank1", [], false], ["Blank2", [], false], ["Blank1", [], false], ["Blank2", [], false], ["Blank1", [], false], ["Blank2", [], false], ["Blank1", [], false]
                ],
                [//Row 2
                    ["Blank1", [], false], ["Blank2", [], false], ["Blank1", [], false], ["Blank2", [], false], ["Blank1", [], false], ["Blank2", [], false], ["Blank1", [], false], ["Blank2", [], false], ["Blank1", [], false], ["Blank2", [], false]
                ],
                [//Row 3
                    ["Blank2", [], false], ["Blank1", [], false], ["Blank2", [], false], ["Blank1", [], false], ["Blank2", [], false], ["Blank1", [], false], ["Blank2", [], false], ["Blank1", [], false], ["Blank2", [], false], ["Blank1", [], false]
                ],
                [//Row 4
                    ["Blank1", [], false], ["Blank2", [], false], ["Blank1", [], false], ["Blank2", [], false], ["Blank1", [], false], ["Blank2", [], false], ["Blank1", [], false], ["Blank2", [], false], ["Blank1", [], false], ["Blank2", [], false]
                ],
                [//Row 5
                    ["Blank2", [], false], ["Blank1", [], false], ["Blank2", [], false], ["Blank1", [], false], ["Blank2", [], false], ["Blank1", [], false], ["Blank2", [], false], ["Blank1", [], false], ["Blank2", [], false], ["Blank1", [], false]
                ],
                [//Row 6
                    ["Blank1", [], false], ["Blank2", [], false], ["Blank1", [], false], ["Blank2", [], false], ["Blank1", [], false], ["Blank2", [], false], ["Blank1", [], false], ["Blank2", [], false], ["Blank1", [], false], ["Blank2", [], false]
                ],
                [//Row 7
                    ["Blank2", [], false], ["Blank1", [], false], ["Blank2", [], false], ["Blank1", [], false], ["Blank2", [], false], ["Blank1", [], false], ["Blank2", [], false], ["Blank1", [], false], ["Blank2", [], false], ["Blank1", [], false]
                ],
                [//Row 8
                    ["Blank1", [], false], ["Blank2", [], false], ["Blank1", ["testPlayer", "testPlayer1", "testPlayer2", "testPlayer3"], false], ["Blank2", [], false], ["Blank1", [], false], ["Blank2", [], false], ["Blank1", [], false], ["Blank2", [], false], ["Blank1", [], false], ["Blank2", [], false]
                ],
                [//Row 9
                    ["Blank2", [], false], ["Blank1", [], false], ["Blank2", [], false], ["Blank1", [], false], ["Blank2", [], false], ["Blank1", [], false], ["Blank2", [], false], ["Blank1", [], false], ["Blank2", [], false], ["Blank1", [], false]
                ],
                [//Row 10
                    ["Blank1", [], false], ["Blank2", [], false], ["Blank1", [], false], ["Blank2", [], false], ["Blank1", [], false], ["Blank2", [], false], ["Blank1", [], false], ["Blank2", [], false], ["Blank1", [], false], ["Blank2", [], false]
                ]
            ]
        ],
        [//Players
            [
                "testPlayer", //userID 0
                0, //Current AP 1
                12, //Max AP 2
                6, //Current Health 3
                12, //Max Health 4
                1, //Current Range 5
                6, //Max Range 6
                1, //Current Damage 7
                2, //Max Damage 8
                36, //Class Index 9
                false, //Dead? 10
                0, //Missed AP 11
                0, //Kills 12
                4, //HP Upgrade Cost 13
                4, //Range Upgrade Cost 14
                12, //Damage Upgrade Cost 15
            ],
            [
                "testPlayer1", //userID 0
                0, //Current AP 1
                12, //Max AP 2
                6, //Current Health 3
                12, //Max Health 4
                1, //Current Range 5
                6, //Max Range 6
                1, //Current Damage 7
                2, //Max Damage 8
                36, //Class Index 9
                false, //Dead? 10
                0, //Missed AP 11
                0, //Kills 12
                4, //HP Upgrade Cost 13
                4, //Range Upgrade Cost 14
                12, //Damage Upgrade Cost 15
            ],
            [
                "testPlayer2", //userID 0
                0, //Current AP 1
                12, //Max AP 2
                6, //Current Health 3
                12, //Max Health 4
                1, //Current Range 5
                6, //Max Range 6
                1, //Current Damage 7
                2, //Max Damage 8
                36, //Class Index 9
                false, //Dead? 10
                0, //Missed AP 11
                0, //Kills 12
                4, //HP Upgrade Cost 13
                4, //Range Upgrade Cost 14
                12, //Damage Upgrade Cost 15
            ],
            [
                "testPlayer3", //userID 0
                0, //Current AP 1
                12, //Max AP 2
                6, //Current Health 3
                12, //Max Health 4
                1, //Current Range 5
                6, //Max Range 6
                1, //Current Damage 7
                2, //Max Damage 8
                36, //Class Index 9
                false, //Dead? 10
                0, //Missed AP 11
                0, //Kills 12
                4, //HP Upgrade Cost 13
                4, //Range Upgrade Cost 14
                12, //Damage Upgrade Cost 15
            ],
            [ //Metadata
                [//Game State: "Setup", "Active", "DevPause", "Paused", "Inactive"
                    "Inactive",
                    //AP Interval(in hours)
                    0.1,
                ], 
                //Chaos Council Event Log
                [],
                //Chest Data
                [
                    0, // Current AP
                    null, //Last Player To Put In Chest
                ],
            ]
        ],
    ],[//Game 1
        [//GameGrid 1
            [//Layer 0
                [//Row 0
                    ["Void", [], false], ["Void", [], false], ["Blank2", [], false], ["Blank1", [], false], ["Blank2", [], false], ["Gateway", [], false], ["Blank2", [], false], ["Blank1", [], false], ["Blank2", [], false], ["Void", [], false], ["Void", [], false]
                ],
                [//Row 1
                    ["Void", [], false], ["Blank2", [], false], ["Blank1", [], false], ["Blank2", [], false], ["Blank1", [], false], ["Blank2", [], false], ["Blank1", [], false], ["Blank2", [], false], ["Blank1", [], false], ["Blank2", [], false], ["Void", [], false]
                ],
                [//Row 2
                    ["Void", [], false], ["Blank1", [], false], ["Ice", [], false], ["Ice", [], false], ["Blank2", [], false], ["Storm", [], false], ["Blank2", [], false], ["Fire", [], false], ["Fire", [], false], ["Blank1", [], false], ["Void", [], false]
                ],
                [//Row 3
                    ["Void", [], false], ["Blank2", [], false], ["Ice", [], false], ["Ice", [], false], ["Blank1", [], false], ["Storm", [], false], ["Blank1", [], false], ["Fire", [], false], ["Fire", [], false], ["Blank2", [], false], ["Void", [], false]
                ],
                [//Row 4
                    ["Void", [], false], ["Blank1", [], false], ["Blank2", [], false], ["Blank1", [], false], ["Blank2", [], false], ["Blank1", [], false], ["Storm", [], false], ["Blank1", [], false], ["Blank2", [], false], ["Blank1", [], false], ["Void", [], false]
                ],
                [//Row 5
                    ["Void", [], false], ["Blank2", [], false], ["Storm", [], false], ["Storm", [], false], ["Storm", [], false], ["Storm", [], false], ["Storm", [], false], ["Storm", [], false], ["Storm", [], false], ["Blank2", [], false], ["Void", [], false]
                ],
                [//Row 6
                    ["Void", [], false], ["Blank1", [], false], ["Blank2", [], false], ["Blank1", [], false], ["Blank2", [], false], ["Blank1", [], false], ["Storm", [], false], ["Blank1", [], false], ["Blank2", [], false], ["Blank1", [], false], ["Void", [], false]
                ],
                [//Row 7
                    ["Void", [], false], ["Blank2", [], false], ["Fire", [], false], ["Fire", [], false], ["Blank1", [], false], ["Storm", [], false], ["Blank1", [], false], ["Ice", [], false], ["Ice", [], false], ["Blank2", [], false], ["Void", [], false]
                ],
                [//Row 8
                    ["Void", [], false], ["Blank1", [], false], ["Fire", [], false], ["Fire", [], false], ["Blank2", [], false], ["Storm", [], false], ["Blank2", [], false], ["Ice", [], false], ["Ice", [], false], ["Blank1", [], false], ["Void", [], false]
                ],
                [//Row 9
                    ["Void", [], false], ["Blank2", [], false], ["Blank1", [], false], ["Blank2", [], false], ["Blank1", [], false], ["Blank2", [], false], ["Blank1", [], false], ["Blank2", [], false], ["Blank1", [], false], ["Blank2", [], false], ["Void", [], false]
                ],
                [//Row 10
                    ["Void", [], false], ["Void", [], false], ["Blank2", [], false], ["Blank1", [], false], ["Blank2", [], false], ["Gateway", [], false], ["Blank2", [], false], ["Blank1", [], false], ["Blank2", [], false], ["Void", [], false], ["Void", [], false]
                ]
            ],
            [//Layer 1
                [//Row 0
                    ["Ice", [], false], ["Ice", [], false], ["Ice", [], false], ["Ice", [], false], ["Ice", [], false], ["Ice", [], false], ["Ice", [], false], ["Ice", [], false], ["Ice", [], false]
                ],
                [//Row 1
                    ["Ice", [], false], ["Gateway", [], false], ["Blank2", [], false], ["Blank1", [], false], ["Wall", [], false], ["Blank1", [], false], ["Blank2", [], false], ["Gateway", [], false], ["Ice", [], false]
                ],
                [//Row 2
                    ["Ice", [], false], ["Blank2", [], false], ["Blank1", [], false], ["Blank2", [], false], ["Wall", [], false], ["Blank2", [], false], ["Blank1", [], false], ["Blank2", [], false], ["Blank1", [], false], ["Ice", [], false]
                ],
                [//Row 3
                    ["Ice", [], false], ["Blank1", [], false], ["Fire", [], false], ["Void", [], false], ["Void", [], false], ["Void", [], false], ["Blank2", [], false], ["Blank1", [], false], ["Ice", [], false]
                ],
                [//Row 4
                    ["Ice", [], false], ["Void", [], false], ["Blank1", [], false], ["Blank2", [], false], ["Heal", [], false], ["Blank2", [], false], ["Blank1", [], false], ["Void", [], false], ["Ice", [], false]
                ],
                [//Row 5
                    ["Ice", [], false], ["Blank1", [], false], ["Blank2", [], false], ["Void", [], false], ["Void", [], false], ["Void", [], false], ["Fire", [], false], ["Blank1", [], false], ["Ice", [], false]
                ],
                [//Row 6
                    ["Ice", [], false], ["Blank2", [], false], ["Blank1", [], false], ["Blank2", [], false], ["Wall", [], false], ["Blank2", [], false], ["Blank1", [], false], ["Blank2", [], false], ["Ice", [], false]
                ],
                [//Row 7
                    ["Ice", [], false], ["Gateway", [], false], ["Blank2", [], false], ["Blank1", [], false], ["Wall", [], false], ["Blank1", [], false], ["Blank2", [], false], ["Gateway", [], false], ["Ice", [], false]
                ],
                [//Row 8
                    ["Ice", [], false], ["Ice", [], false], ["Ice", [], false], ["Ice", [], false], ["Ice", [], false], ["Ice", [], false], ["Ice", [], false], ["Ice", [], false], ["Ice", [], false]
                ]
            ],
            [//Layer 2
                [//Row 0
                    ["Fire", [], false], ["Fire", [], false], ["Blank1", [], false], ["Blank2", [], false], ["Wall", [], false], ["Blank2", [], false], ["Blank1", [], false], ["Fire", [], false], ["Fire", [], false]
                ],
                [//Row 1
                    ["Fire", [], false], ["Gateway", [], false], ["Blank2", [], false], ["Blank1", [], false], ["Wall", [], false], ["Blank1", [], false], ["Blank2", [], false], ["Heal", [], false], ["Fire", [], false]
                ],
                [//Row 2
                    ["Blank1", [], false], ["Blank2", [], false], ["Blank1", [], false], ["Blank2", [], false], ["Wall", [], false], ["Blank2", [], false], ["Blank1", [], false], ["Blank2", [], false], ["Blank1", [], false]
                ],
                [//Row 3
                    ["Blank2", [], false], ["Blank1", [], false], ["BLank2", [], false], ["Storm", [], false], ["Fire", [], false], ["Storm", [], false], ["Blank2", [], false], ["Blank1", [], false], ["Blank2", [], false]
                ],
                [//Row 4
                    ["Wall", [], false], ["Wall", [], false], ["Wall", [], false], ["Fire", [], false], ["Fire", [], false], ["Fire", [], false], ["Wall", [], false], ["Wall", [], false], ["Wall", [], false]
                ],
                [//Row 5
                    ["Blank2", [], false], ["Blank1", [], false], ["Blank2", [], false], ["Storm", [], false], ["Fire", [], false], ["Storm", [], false], ["Blank2", [], false],  ["Blank1", [], false], ["Blank2", [], false]
                ],
                [//Row 6
                    ["Blank1", [], false], ["Blank2", [], false], ["Blank1", [], false], ["Blank2", [], false], ["Wall", [], false], ["Blank2", [], false], ["Blank1", [], false], ["Blank2", [], false], ["Blank1", [], false]
                ],
                [//Row 7
                    ["Fire", [], false], ["Heal", [], false], ["Blank2", [], false], ["Blank1", [], false], ["Wall", [], false], ["Blank1", [], false], ["Blank2", [], false], ["Gateway", [], false], ["Fire", [], false]
                ],
                [//Row 8
                    ["Fire", [], false], ["Fire", [], false], ["Blank1", [], false], ["Blank2", [], false], ["Wall", [], false], ["Blank2", [], false], ["Blank1", [], false], ["Fire", [], false], ["Fire", [], false]
                ]
            ],
            [//Layer 3
                [//Row 0
                    ["Storm", [], false], ["Storm", [], false], ["Storm", [], false], ["Blank2", [], false], ["Blank1", [], false], ["Blank2", [], false], ["Blank1", [], false], ["Wall", [], false]
                ],
                [//Row 1
                    ["Storm", [], false], ["Heal", [], false], ["Storm", [], false], ["Fire", [], false], ["Blank2", [], false], ["Blank1", [], false], ["Blank2", [], false], ["Blank1", [], false]
                ],
                [//Row 2
                    ["Storm", [], false], ["Storm", [], false], ["Storm", [], false], ["Blank2", [], false], ["Blank1", [], false], ["Wall", [], false], ["Blank1", [], false], ["Blank2", [], false]
                ],
                [//Row 3
                    ["Gateway", [], false], ["Fire", [], false], ["Blank2", [], false], ["Bush", [], false], ["Bush", [], false], ["Blank1", [], false], ["Blank2", [], false], ["Gateway", [], false]
                ],
                [//Row 4
                    ["Gateway", [], false], ["Blank2", [], false], ["Blank1", [], false], ["Bush", [], false], ["Bush", [], false], ["Blank2", [], false], ["Fire", [], false], ["Gateway", [], false]
                ],
                [//Row 5
                    ["Blank2", [], false], ["Blank1", [], false], ["Wall", [], false], ["Blank1", [], false], ["Blank2", [], false], ["Storm", [], false], ["Storm", [], false], ["Storm", [], false]
                ],
                [//Row 6
                    ["Blank1", [], false], ["Blank2", [], false], ["Blank1", [], false], ["Blank2", [], false], ["Fire", [], false], ["Storm", [], false], ["Heal", [], false], ["Storm", [], false]
                ],
                [//Row 7
                    ["Wall", [], false], ["Blank1", [], false], ["Blank2", [], false], ["Blank1", [], false], ["Blank2", [], false], ["Storm", [], false], ["Storm", [], false], ["Storm", [], false]
                ]
            ]
        ],
        [//Players
            []  
        ],
        [ //Metadata
            [//Game State: "Setup", "Active", "DevPause", "Paused", "Inactive"
                "Setup",
                //AP Interval(in minutes)
                720,
                //Current Chaos Council Event
                "",
                //Chest Amount
                0,
                //Chest Giver
                "",
            ]
        ]
    ]
]

const Classes = [
    // name, ap, max_ap, hp, max_hp, range, max_range, damage, max_damage, color, description
    ["Vampyr", 0, 12, 6, 12, 1, 6, 1, 2, "CB0000", "Gains 2 HP on Kill"],
    ["Twin", 0, 12, 3, 12, 1, 6, 1, 2, "8FE2C6", "Controls 2 separate bodies each have half hp"],
    ["Dimensional Hopper", 0, 12, 6, 12, 1, 6, 1, 2, "352895", "Can Move Up/Down Layers by spending 2AP with the >warp up & >warp down commands"],
    ["Lava Diver", 0, 12, 6, 12, 1, 6, 1, 2, "FC482E", "You are immune to fire tiles"],
    ["Switchmate", 0, 12, 6, 12, 1, 6, 1, 2, "844B9C", "Can swap places with any player for 4AP with the >swap @mention command"],
    
    ["Mailman", 0, 12, 6, 12, 1, 6, 1, 2, "F7F7F2", "Can gift & receive AP to anyone regardless of their range with the >deliver @mention command"],
    ["Cloudborn", 0, 12, 6, 12, 1, 6, 1, 2, "A8DDFF", "Can move on void and wall tiles, uneffected by ice tiles"],
    ["Oracle", 0, 12, 6, 12, 1, 6, 1, 2, "320051", "Can see all layers and see through smoke & mine tiles reguardless of positon"],
    ["Glutton", -2, 12, 6, 12, 1, 6, 1, 2, "D37A3B", "Gains double AP every AP distribution"],
    ["Sniper", 0, 12, 4, 12, 3, 6, 1, 2, "ffff00", "can use the >snipe command to pierce and hit anyone in the path of attack, pireces wall tiles. Starts with 3 range but 4HP"],
    
    ["Necromancer", 0, 12, 6, 12, 1, 6, 1, 2, "632271", "Can bring someone back to life placing them in range for 12AP with the >ressurect @mention <layer> <x> <y> command"],
    ["Hot Potato", 0, 12, 6, 12, 1, 6, 1, 2, "D3986C", "Can swap abilities with someone in range for 12AP with the >hotpotato layer, x, y command"],
    ["Hitman", 0, 12, 6, 12, 1, 6, 1, 2, "AD2424", "Gains 4AP for killing a target given to them every day"],
    ["Smoker", 0, 12, 6, 12, 1, 6, 1, 2, "797772", "Can make a smoke tile in range for 1AP with the >smoke layer, x, y command "],
    ["Construction Worker", 0, 12, 6, 12, 1, 6, 1, 2, "FF9F0F", "Can make a wall or chest tile in range for 2AP with the >build wall/chest layer, x, y command"],
    
    ["Pharoh", 0, 12, 6, 12, 1, 6, 1, 2, "D3C461", "If the pharoh attempts to get more than 12HP they instead gain an extra life that starts at that overflow HP to a maximum of 12HP on revival, upon death they instead are put on a random tile"],
    ["Gravedigger", 0, 12, 6, 12, 1, 6, 1, 2, "83716B", "Can make a void tile in range for 4AP with the >dig layer, x, y command"],
    ["Stormchaser", 0, 12, 6, 12, 1, 6, 1, 2, "6821c0", "Everytime you enter a storm tile gain 1d4-2 AP"],
    ["Pyromainiac", 0, 12, 6, 12, 1, 6, 1, 2, "ee3271", "Can make a fire tile in range for 5AP with the >burn layer, x, y command"],
    ["Doctor", 0, 12, 6, 12, 1, 6, 1, 2, "c6ff6c", "Can make a heal tile in range for 5AP with the >heal layer, x, y command"],
    
    ["Guardian", 0, 12, 6, 12, 1, 6, 1, 2, "473b86", "Can lock or unlock a gateway tile in range for 2AP with the >lock layer, x, y command. can lock all gates on a layer unless they are one of the last 3 players then they must leave one open at all times"],
    ["Robot", 0, 12, 6, 12, 1, 6, 1, 2, "899da3", "Everytime you enter a storm tile gain 1HP"],
    ["Druid", 0, 12, 6, 12, 1, 6, 1, 2, "426836", "Can create a storm tile in range for 5AP with the >conjure layer, x, y command"],
    ["Chef", 0, 12, 6, 12, 1, 6, 1, 2, "da8968", "Can gift 2 AP to anyone in range(except themselves) with the >cook layer, x, y command(24 Hour Cooldown)"],
    ["Minesweeper", 0, 12, 6, 12, 1, 6, 1, 2, "4e4e4e", "Can plant a mine tile in range for 1AP with the >arm layer, x, y command"],
    
    ["Clockwatcher", 0, 12, 6, 12, 1, 6, 1, 2, "ffffff", "Can make everyone except themselves unable to do anything for 12AP with the >timestop command. this lasts for 48hours"],
    ["Cannibal", 0, 12, 4, 12, 1, 6, 1, 2, "d38e9f", "Gains 1 AP on ALL kills, if you kill someone with max ap gain an extra 5AP ontop of that"],
    ["Blacksmith", 0, 12, 6, 12, 1, 6, 1, 2, "d38e9f", "Can give a double damage buff to anyone in range(including themselves) for 6AP with the >weaponize layer, x, y command. this buff lasts for 24 hours, this buff can stack. but ones damage cannot go over their max"],
    ["Exorcist", 0, 12, 6, 12, 1, 6, 1, 2, "00efff", "Can make any tile a blank tile for 3AP with the >exorcize layer, x, y command, and can remove a players class for 16 AP with the >exorcise @mention command"],
    ["Hoarder", 3, 12, 6, 12, 0, 6, 1, 2, "7b8d69", "Starts with 3AP but starts with 0Range"],
    
    ["Medium", 0, 12, 6, 12, 1, 6, 1, 2, "d53eff", "Can speak with the dead and influence the chaos council votes. They get an extra override and can use them while alive."],
    ["Snowman", 0, 12, 6, 12, 1, 6, 1, 2, "0181e6", "Can make ice tiles in range for 5AP with the >freeze layer, x, y command"],
    ["Protagonist", 4, 16, 2, 16, 1, 10, 1, 4, "efc266", "Starts with less hp but has high starting maximum stats, and 4 AP"],
    ["Hunter", 0, 12, 6, 12, 1, 6, 1, 2, "274e13", "Can make bush tiles in range for 5AP with the >hide layer, x, y command. Attacks made from inside and on people inside a bush tile do not have a 50% chance to miss"],
    ["Fencer", 0, 12, 6, 12, 1, 6, 1, 2, "9fc2cd", "Can deal double damage(up to maximum) for 1 AP to anyone within 1 tile of them with the >stab layer, x, y command"],
    
    ["Average", null, null, null, null, null, null, null, null, "ffe2c5", "(ONLY ACCESSIBLE VIA EXORCIST) You are a normal person with no class ability"],
    ["Immutable", -4, 12, 6, 12, 1, 6, 1, 2, "b0b0b0", "(INACCESSIBLE) You cannot take damage from the >shoot command, but will die after (3*amount of players) AP has been given since the game started"],
    ["Bully", 0, 12, 6, 12, 1, 6, 1, 2, "ffa7a7", "(INACCESSIBLE) You can force another player to move one tile away from you with the >shove @mention up/back/down command for 1 AP"],
]

//GameData Schema
//                                                            0          1         2
//[Game][0(GameBoard)][Layer][-Y(0 indexed)][X(0 indexed)][Tiletype, players[], trapped?]
//                                  0          1       2             3            4               5           6            7              8           9        10        11       12         13                 14                15
//[Game][1(Players)][playerIndex][userID, Current AP, Max AP, Current Health, Max Health, Current Range, Max Range, Current Damage, Max Damage, Class Index, Dead?, Missed AP, Kills, HP Upgrade Cost, Range Upgrade Cost, Damage Upgrade Cost]
//            0          1               2                    3                           4
//[Game][GameState, AP Interval, Chaos Council Event, Amount of AP in Chest, Last Player To Put In Chest]

module.exports = {
    GameData,
    Classes
}