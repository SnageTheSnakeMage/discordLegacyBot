# Legacy(v3.1.0) Discord Bot
 A discord bot for running the game legacy. Made this incase anyone was curious on progress/wanted to help. 

# Legacy Season 4 Explanation Draft
## Summary
Legacy is a Social RTS  Battle Royale game where people move on a grid and fight to be the last. one. standing.

You eliminate others by spending a shareable currency given every 12 hours to shoot someone once they are 
<range> squares away until their HP is 0. 
Killers get +1 to their max stats,

(Examples: 
Player gets a kill and recieves the following increases to their maximums
max. AP 12 -> 13, 
max. HP 10 -> 11, 
max. Damage 2 -> 3)

## AP
This currency is known as AP, you get 2 AP @ 12 PM UTC & 12AM UTC(To balance time zones difference).  

You can have a maximum of 12 AP. And you can use AP to....

  - Move in any of the 8 directions (1 AP)
  - Give X AP to any player in your range(X AP)
  - Shoot/Deal Damage to any player in your range(2 AP)
  - & Upgrade your stats / heal *the price increases each purchase up to the last number shown here*
    - +1 Range (4 -> 5 -> 7 -> 10 AP)
    - +1 HP (4 -> 5 -> 7 -> 10 AP)
    - +1 Damage (12 -> 14 -> 16 AP)

## Stats
In legacy each player has the following stats, the starting stats my change based upon a players class

but generally most players start with the following:

- AP 0/12 - see section above
- HP 6/10 - your health, if this hits zero you are off the board but not completely out of the game(see **Chaos Council** below)
- Range 1/6 - how many squares away you can give AP to and damage other players
- Damage 1/2 - how much health a player loses when you choose to shoot/damage them
- Tile "___" - the type of tile you are currently on(*see below section*)

## Tiles
```
Blank - nothing happens when you stand on it, can be stood on
Heal - players on this tile receive 1 HP with their twice a day AP
Chest - Anyone can store AP and take out AP here, all chests pull from the same storage

Fire - -1HP every time you move on or off this tile
Ice - you must move again
Storm - puts you in a random square surrounding it
Wall - You cant move onto this tile, If shot twice it will be destroyed, when destroyed leaves behind a blank tile
Void - You cant move onto this tile, but can shoot over it
Gateway - while on this you can warp up or down a layer, can only be changed by guardian
Locked Gateway - acts as a blank tile
Smoke tile - becomes a blank tile when someone moves off of it, when on this tile no one can see you on the grid
```
## Chaos Council
When a player dies they join the chaos council, and every 24 hours the council receives a poll to decide a random event that will affect all players. Each council member gets 1 override which can simply choose the event, an override can be used on an override to negate it.

## Classes
Each player gets a class that gives them a special ability and they're starting stats. There can only be 2 of each class in a game(meaning each game *currently* has a player max of 64) . Classes are given randomly during setup of the game.

there is a list of all the clasees and their abilities here: https://docs.google.com/spreadsheets/d/1-Wn2_q8c1k2TmlVb-KDunRGIuzC5yuqH3L4XcIIy4G4/edit?usp=sharing

## The Board
The board is different for each game but will always be a square board, each square can hold to a max of 4 players before that tile is inaccessible to all other players. made up of multiple "layers", a player can only leave a layer with either a special class ability or a gateway tile. Making they're traversal very important. Once the game reaches the final four, AP will go from +2 to +4 additional gateway tiles will be placed and fire tiles will begin spreading and dealing damage to those who stand still on them during ap distribution. 

# Setup 
Each player is given a random layer, position, and class and then once all players are in them the game starts at the next AP drop interval.
