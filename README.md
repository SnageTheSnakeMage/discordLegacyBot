# AI DISCLOSURE 
I know that the culture around LLM assisted coding is controversial and that a big sticking point I agree with is that it should be a choice of the consumer, due to many of my friends caring deeply about this and myself caring about being transparent and integral as a person the following text summarizes how I used AI(mainly Claude) to develop this discord bot so that they can come to their own conclusions, and just due to the fact that my haphazard way of development does not make it easy to tell just what I did my hand and what came out of the trillion parameter statistical model known as Claude Code.

The development process of this discord bot started in November 2020, through a tool I bought and downloaded off of steam known as '[Discord Bot Studio](https://store.steampowered.com/app/1118380/Bot_Studio_for_Discord/)' after running into the frustration inducing sequence of attempting to port in proper database protocols into it through flowcharts I gave up on the tool and decided to just code it from a lower level for an easier development experience and more control.

After which I read up on the documentation of [discordjs](https://discordjs.guide/), a node package that streamlines & types interactions with Discord's API in TypeScript/JavaScript. And after reading used LLM generated code(in this case I believe it was Claude sonnet 4?) for some examples to help get me started and generate the boilerplate. 

After editing what it made I worked on the majority of the commands by hand until I thought it was complete, though unknown to my knowledge I would encounter a slew of bugs when attempting small playtests with a handful(3-5) of friends. 

Which led me to implementing Jest and slowly adding automated unit testing to my codebase. Then around the June 1st 2025 I began using LLM assisted coding tools(Claude again) via cursor, Mostly using it for analysis and development advice. This continues up until the account I was borrowing moved off of the pro plan around Early September 2025. 

I still used cursor as an IDE simply due to hating how VS code look and it suddenly deciding not to open on my laptop at one point. from there I used its line autocompletion feature but I did not prompt generation for large chunks of the codebase until around late August 2026. 

At this point my development process moved from writing code with cursory line completion to prompting Claude opus 5 on a pro subscription I borrowed. I would have it make a PR, then I would review that PR, and merge it in. 

I do occasionally do minute tiny changes where LLM coding tools would be overkill, but the majority of the code AFTER around August 15th 2026 is LLM generated, as the commit history shows.
At first I used it mainly to add in the unit tests and refactor commands to be easier to make the unit tests for that I originally was slowly developing by hand because that part of the development process was like pulling teeth and I hated it but it was necessary for me to be able to efficiently refactor and bugfix the many problems my old code had. The reason it was so horrible to do was because the majority of it was coded by a version of me that did not understand how to properly create functions and avoid non-deterministic actions mixing with deterministic ones. Mainly the whole issue of a lot of the codebase partially depending on discordjs client & ineteraction object when it did not need to, seperating the logic of a command from its response was a huge thing that claude turned from about 2 months of work into a week. 

This change has hidden most of the work I did by hand due to the logic I wrote being moved to new files for better encapsulation, thus I disclose it here. If you have any specific questions about how I use Claude code feel free to make an issue here and I'll add your question and answer here.

# Legacy(v3.1.1) Discord Bot
 A discord bot for running the game legacy. Made this incase anyone was curious on progress/wanted to help. 

# Legacy Season 4 Explanation Draft
## Summary
Legacy is a Social RTS Battle Royale game where people move on a grid and fight to be the last. one. standing.
Each player gets a special class that gives them certain exceptions or abilities,
You eliminate others by spending a shareable currency given out at certain intervals to everyone at the same time to damage others within range until their HP is 0. 
Killers get +1 to their max stats. Once someone dies they can vote on chaotic events that affect those still alive.

## Action Points (AP)
This shareable currency is known as AP, it is distributed at regular intervals, usually 2 AP/12 hours. But this can change game to game.
And you can use AP to....

  - Move in any of the 8 directions (1 AP)
  - Give X AP to any player in your range(X AP)
  - Shoot/Deal Damage to any player in your range and aligned with you diagonally or orthoginally(2 AP)
  - & Upgrade your stats / heal *the price increases each purchase up to the last number shown here*
    - +1 Range (4 -> 5 -> 7 -> 10 AP)
    - +1 HP (4 -> 5 -> 7 -> 10 AP)
    - +1 Damage (12 -> 14 -> 16 AP)
Some classes have special abilities that cost AP aswell.(see Classes section)

## Stats
In legacy each player has the following stats, the starting stats my change based upon a players class
but generally most players start with the following:

- AP 0/12 - see section above
- HP 6/10 - your health, if this hits zero you are off the board but not completely out of the game(see Chaos Council section)
- Range 1/6 - how many squares away you can give AP to and damage other players
- Damage 1/2 - how much health a player loses when you choose to shoot them
- Tile Type - the type of tile you are currently standing on(see Tiles section)

## Tiles
```
Blank - nothing happens when you stand on it, can be stood on, comes in two colors

Void - You cant move onto this tile, but can shoot over it(with the exception of Cloudborns, see Classes section)
Fire - -1HP every time you move on or off this tile
Ice - upon moving onto an ice tile you must move again before another action may be done, this movement does not cost AP
Storm - puts you on a random surrounding(including diagonals) square upon moving onto it
Smoke - becomes a blank tile when someone moves off of it(with the exception of gateway and locked gateway tile which will stay the same), anyone outside of the tile cannot see who is on this tile with the exception of the oracles(see Classes section)
Mine - Upon stepping onto this tile lose 1 HP then it becomes a blank tile(with the exception of gateway and locked gateway tile which will stay the same). Can look like any tile to everyone except minesweepers or oracles who will see a flag ontop of the tile. 
Bush - attacks on people on this tile and from people on this tile have a 1/2 chance of missing, with the exception of hunters.
Wall - You cant move onto this tile (with the exception of people with the Cloudborn class, see Classes section), If shot twice it will be destroyed, when destroyed leaves behind a blank tile(with the exception of gateway and locked gateway tile which will stay the same). Blocks shots 
Chest - Anyone can store/take AP here, all chests pull from the same storage of AP
Heal - players on this tile receive 1 HP when AP is distributed

Gateway - while on this you can warp up or down a layer(can only be changed by Guardian, see Classes section)
Locked Gateway - acts as a blank tile(unless unlocked by a Guardian, see Classes section). players can warp from another layer and end up on it but unless unlocked the cannot warp again.
```

## Chaos Council
When a player dies they join the chaos council, and every time AP is distributed the council receives a poll to decide a random event that will affect all players next AP distribution. Each council member gets 1 override which can simply choose the event, an override can be overidden by another override.

## Classes
Each player gets a class that gives them a special ability and they're starting stats. Each game has a limit to how many duplicates of a single class there can be(usually 2) this caps how many people can play in that game. Classes are given randomly during setup of the game, but some classes have the ability to force others to lose or change their class.

Here is a list of all the clasees and their abilities here:

|id |class              |ap |max_ap|hp |max_hp|range|max_range|damage|max_damage|color |description                                                                                                                                                                                                                |
|---|-------------------|---|------|---|------|-----|---------|------|----------|------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
|1  |Vampyr             |0  |12    |6  |12    |1    |6        |1     |2         |CB0000|Gains 2 HP on Kill                                                                                                                                                                                                         |
|2  |Dimensional Hopper |0  |12    |6  |12    |1    |6        |1     |2         |352895|Can Move Up/Down Layers by spending 2AP with the >warp up & >warp down commands                                                                                                                                            |
|3  |Lava Diver         |0  |12    |6  |12    |1    |6        |1     |2         |FC482E|You are immune to fire tiles, people on the same tile as you during AP distribution take 1 Damage                                                                                                                          |
|4  |Switchmate         |0  |12    |6  |12    |1    |6        |1     |2         |844B9C|Can swap places with any player for 4AP with the >swap @mention command                                                                                                                                                    |
|5  |Mailman            |0  |12    |6  |12    |1    |6        |1     |2         |F7F7F2|Can gift/receive AP to/from anyone or chest regardless of range or current tile with the >deliver @mention command                                                                                                         |
|6  |Cloudborn          |0  |12    |6  |12    |1    |6        |1     |2         |A8DDFF|Can move on void and wall tiles, gaining 1 range on walls and losing one on void, uneffected by ice tiles.                                                                                                                 |
|7  |Oracle             |0  |12    |6  |12    |1    |6        |1     |2         |320051|Can see: all layers, players in smoke tiles, trapped tiles, and spies                                                                                                                                                      |
|8  |Necromancer        |0  |12    |6  |12    |1    |6        |1     |2         |632271|Can bring someone back to life placing them in range for 12AP with the >resurrect @mention <layer> <x> <y> command                                                                                                         |
|9  |Hot Potato         |0  |12    |6  |12    |1    |6        |1     |2         |D3986C|Can swap classes with someone in range for 12AP with the >hotpotato layer, x, y command, taking their starting max buffs and debuffs along with their ability                                                              |
|10 |Hitman             |0  |12    |6  |12    |1    |6        |1     |2         |AD2424|Gains 4AP for killing a target, recieves a new target upon the death of the current one                                                                                                                                    |
|11 |Smoker             |0  |12    |6  |12    |1    |6        |1     |2         |797772|Can turn a blank tile in range into a smoke tile for 1AP with the >smoke layer, x, y command                                                                                                                               |
|12 |Construction Worker|0  |12    |6  |12    |1    |6        |1     |2         |FF9F0F|Can turn any non-gateway tile in range into a wall or chest tile in range for 3AP with the >build wall/chest layer, x, y command                                                                                           |
|13 |Pharoh             |0  |12    |6  |12    |1    |6        |1     |2         |D3C461|If the Pharoh attempts to get more than 12HP they instead gain an extra life that starts at that overflow HP to a maximum of 12HP on revival, upon death they instead are put on a random tile                             |
|14 |Gravedigger        |0  |12    |6  |12    |1    |6        |1     |2         |83716B|Can turn any empty non-gateway tile  in range into a void tile for 4AP with the >dig layer, x, y command, can move on void tiles                                                                                           |
|15 |Stormchaser        |0  |12    |6  |12    |1    |6        |1     |2         |6821C0|Every time you enter a storm tile gain 1d4-2 AP                                                                                                                                                                            |
|16 |Pyromainiac        |0  |12    |6  |12    |1    |6        |1     |2         |EE3271|Can turn any non-gateway tile in range into a fire tile for 5AP with the >burn layer, x, y command                                                                                                                         |
|17 |Doctor             |0  |12    |6  |12    |1    |6        |1     |2         |C6FF6C|Can turn any non-gateway tile in range into a heal tile for 5AP with the >heal layer, x, y command                                                                                                                         |
|18 |Guardian           |0  |12    |6  |12    |1    |6        |1     |2         |473B86|Can lock or unlock a gateway tile in range for 2AP with the >lock layer, x, y command. Can lock all gates on a layer unless they are one of the last 3 players then they must leave one open at all times                  |
|19 |Robot              |0  |12    |6  |14    |1    |6        |1     |2         |899DA3|Every time you enter a storm tile gain 1HP, increased max HP                                                                                                                                                               |
|20 |Druid              |0  |12    |6  |12    |1    |6        |1     |2         |426836|Can turn any non-gateway tile in range into a storm tile for 5AP with the >conjure layer, x, y command                                                                                                                     |
|21 |Chef               |0  |12    |6  |12    |1    |6        |1     |2         |DA8968|Can give another player in range 2AP & 1 HP and recieve 1 AP with the >cook layer, x, y command, you can do this for each AP distribution. See your meals stat for how many times you can currently use this.              |
|22 |Minesweeper        |0  |12    |6  |12    |1    |6        |1     |2         |4E4E4E|Can plant an invisible mine on tiles in range for 1AP with the >arm layer, x, y command, immune to mine damage                                                                                                             |
|23 |Clockwatcher       |0  |12    |6  |12    |1    |6        |1     |2         |FFFFFF|Can make everyone except Clockwatchers unable to do anything for 12AP with the >timestop command. This lasts for 4 AP distributions                                                                                        |
|24 |Blacksmith         |0  |12    |6  |12    |1    |6        |1     |2         |D38E9F|Can give a double damage buff to anyone's next attack in range (including themselves) for 6AP with the >weaponize layer, x, y command, this buff can stack. But one's damage cannot go over their max                      |
|25 |Medium             |0  |12    |6  |12    |1    |6        |1     |2         |D53EFF|Can speak with the dead and influence the chaos council votes. They get an extra override and can use them while alive.                                                                                                    |
|26 |Snowman            |0  |12    |6  |12    |1    |6        |1     |2         |0181E6|Can turn any non-gateway tile in range into ice tiles for 2AP with the >freeze x, y command, unnaffected by ice tiles                                                                                                      |
|27 |Fencer             |0  |12    |6  |12    |1    |6        |1     |2         |9fc2cd|Can deal double damage(up to maximum damage) for 1 AP to anyone on the same tile as them with the >stab layer, x, y command                                                                                                |
|28 |Twin               |0  |12    |3  |12    |1    |6        |1     |2         |8FE2C6|Controls 2 separate bodies each start with half hp                                                                                                                                                                         |
|29 |Glutton            |-2 |10    |6  |10    |1    |4        |1     |1         |D37A3B|Gains double AP every AP distribution, at the cost of reduced starting stat maxes, the debuff of movement costing 2AP and -2 starting AP                                                                                   |
|30 |Sniper             |0  |12    |4  |12    |3    |6        |1     |2         |FFFF00|Can use the >snipe command to pierce and hit anyone in the path of attack, pierces wall tiles. Starts with 3 range but 4HP                                                                                                 |
|31 |Cannibal           |0  |10    |4  |12    |1    |6        |1     |2         |D38E9F|Gains 1 AP on ALL kills, if you kill someone with max AP gain an extra 5AP on top of that, starts with reduced HP and reduced max AP                                                                                       |
|32 |Hoarder            |6  |12    |6  |12    |0    |6        |1     |2         |7B8D69|Starts with 6AP but starts with 0Range                                                                                                                                                                                     |
|33 |Protagonist        |4  |16    |4  |16    |1    |10       |1     |4         |efc266|Starts with less hp but has high starting maximum stats, and 4 AP                                                                                                                                                          |
|34 |Exorcist           |0  |12    |6  |12    |1    |6        |1     |2         |00efff|Can turn any non-gateway tile in range into a blank tile for 3AP with the >exorcize layer, x, y command, and can remove a players class for 16 AP with the >exorcise @mention, layer, x, y command                         |
|35 |Hunter             |0  |12    |6  |12    |4    |6        |1     |2         |274e13|Can turn any non-gateway tile in range into a bush tile for 5AP with the >hide layer, x, y command. Attacks made from inside and on people inside a bush tile do not have a 50% chance to miss                             |
|36 |Immutable          |0  |12    |6  |12    |4    |6        |1     |2         |B0B0B0|You cannot take damage from the >shoot command, but will die after 4 * Total Player Count AP has been distributed, cannot be revived once this threshold is hit                                                            |
|37 |Average            |0  |12    |6  |12    |1    |6        |1     |2         |ffe2c5|(ONLY ACCESSIBLE VIA EXORCIST) You are a normal person with no class ability                                                                                                                                               |
|38 |Spy                |0  |12    |6  |12    |1    |6        |1     |2         |2b2b2b|Only visible to Oracle class                                                                                                                                                                                               |
|39 |Speedster          |0  |12    |6  |8     |1    |6        |1     |2         |ff3a3a|You get 2 free movements every AP distribution, use it or lose it                                                                                                                                                          |
|40 |Bully              |0  |12    |6  |12    |1    |6        |1     |2         |ffa7a7|Can force another player next to you one tile away for 1AP with the >shove @mention left/back/right command. Turn to face them: back shoves them straight ahead, left and right shove them 45 degrees to your left or right|
|41 |Punisher           |0  |12    |6  |12    |1    |6        |1     |2         |5b5b5b|Can spend 4AP to deal damage equal to a target's missed AP + missed HP with the >punish x, y @mention command                                                                                                              |


## The Board
The board is different for each game but will always be a square board, each square can hold to a max of 4 players before that tile is 'Full' and inaccessible to all other players. 

The board is made up of multiple "layers", a player can only leave a layer with either a special class ability or a gateway tile.

## Game Finale & Winner
Once the game reaches a certain amount of remaining players the game will go into its FINALE causing: 
- AP distributions to give double AP
- Additional gateway tiles will be placed
- Fire tiles will begin spreading to adjacent squares and will take -1HP from anyone who is standing on one when AP is given.
Last one standing wins 

## Setup 
Each player is given a random layer, position, and class and then once all players are on the board the game can be started by the dev setting the start of the AP distribution interval.

# CI/CD

CI (`.github/workflows/ci.yml`) runs on every PR and on pushes to `main`/`cursord`:
lint, unit tests, integration tests (in-memory SQLite), an `npm audit` advisory,
a Docker build whose `test` stage runs the whole suite inside the image, a smoke
test that proves the runtime image boots to a Discord login attempt, and a Trivy
CVE scan. Fork PRs get no secrets; the workflow token is read-only; every action
is pinned to a commit SHA.

## Releasing

1. Tag: `git tag v0.x.y && git push origin v0.x.y`
2. The Deploy workflow builds and publishes `ghcr.io/<owner>/<repo>:<tag>` and
   prints the immutable **digest**. Deploys go by digest, never by tag.
3. The `deploy` job waits on the `production` environment (add yourself as a
   required reviewer under Settings → Environments → production).
4. Approve it, and the host deploys itself — see below.

## Deploying / rolling back

Approving the gated `deploy` job runs
`DeclutteredAttempt1/scripts/deploy.sh` **on the host**, which backs the
database up, pulls the digest, brings compose up, waits for the container to
report healthy and rolls back to the previously live digest if it never does.

That works because the runner is registered on the Mac mini itself, so the job
is already on the machine it is deploying to: no SSH, no deploy key, no inbound
port. See [Host setup](#host-setup) to register it. Until the repository
variable `DEPLOY_RUNNER_LABEL` is set, the job lands on a hosted runner and
just prints the digest and the command to run by hand.

Running it by hand is the same path, not a different one:

```bash
IMAGE_DIGEST=ghcr.io/<owner>/<repo>@sha256:<digest> \
  DeclutteredAttempt1/scripts/deploy.sh
```

It reads `~/legacy-bot`, which holds the bot's `.env`, the `backups/`
directory and `current-digest` — the digest it rolls back to. To keep that
state somewhere else, set the repository variable `LEGACY_DEPLOY_DIR` to an
absolute path; the workflow passes it through. Put the host's path there
rather than editing the script — a path in the script names one machine and
is not covered by the tests. A deploy that never goes healthy leaves `current-digest`
untouched, so the last known-good digest survives a failed attempt.

<details>
<summary>The same four steps, by hand, if the script is unavailable</summary>

```bash
# 1. BACK UP FIRST - abort if this fails
#    the volume is project-scoped: `legacy-db` alone creates a NEW empty one
docker run --rm -v legacy_legacy-db:/data -v "$PWD":/backup alpine \
  cp /data/database.db /backup/database.$(date +%Y%m%d%H%M%S).db

# 2. deploy by digest - compose reads IMAGE_DIGEST, and refuses to start
#    without it rather than running whatever image it finds
export IMAGE_DIGEST=ghcr.io/<owner>/<repo>@sha256:<digest>
docker pull "$IMAGE_DIGEST"
docker compose up -d

# 3. verify - the healthcheck reflects the Discord connection, not the process.
#    `watch` is GNU and is NOT installed on macOS, so poll instead. Bounded at
#    ~2 minutes: an unbounded loop spins forever on a container that never
#    becomes healthy, or was never created at all
for _ in $(seq 24); do
  status=$(docker inspect --format '{{.State.Health.Status}}' discord-bot 2>&1) || status="no such container"
  [ "$status" = healthy ] && break
  echo "$status"; sleep 5
done
[ "$status" = healthy ] || echo "NOT healthy after 2 minutes - roll back"

# 4. roll back if unhealthy after ~2 minutes
docker compose down
export IMAGE_DIGEST=ghcr.io/<owner>/<repo>@sha256:<previous-digest>
docker pull "$IMAGE_DIGEST"
docker compose up -d   # then restore the backup into the volume if needed
```

</details>

Game state lives in the `legacy_legacy-db` named volume and survives image
rebuilds: the database at `/data/database.db`, and the player icons uploaded
at registration at `/data/player-tiles` (`LEGACY_PLAYER_TILES_DIR`). Tile
artwork is *not* state - it ships in the image and updates with a deploy.

Icons written before this existed went into the image, so they were lost on
every deploy. To carry across any that survive in the running container:

```bash
docker cp discord-bot:/app/tiles/players/. /tmp/player-tiles
docker run --rm -v legacy_legacy-db:/data -v /tmp/player-tiles:/in alpine \
  sh -c 'mkdir -p /data/player-tiles && cp /in/*_*.png /data/player-tiles/ 2>/dev/null; true'
```

`*_*.png` picks up the `<discordId>_<gameId>.png` uploads and leaves
`default.png` in the image, where it belongs.
Slash-command registration is rate-limited by Discord and does NOT run on boot.
Run the Deploy workflow manually with "register commands" checked when a
command's definition changes. There is no environment-variable shortcut: the
workflow, or `node scripts/register-commands.js` with `DISCORD_TOKEN`,
`CLIENT_ID` and `GUILD_ID` set, is the whole of it.

## A command in the picker that the bot does not have

Registration PUTs the whole **guild** command set, so a command that no longer
exists in the code disappears the next time it runs. **Global** commands are a
separate list that PUT never touches: one registered by an older version of the
bot outlives every deploy and keeps appearing, with nothing behind it.

```bash
node scripts/global-commands.js                    # list them, with ids
node scripts/global-commands.js --delete old-name  # delete one
node scripts/global-commands.js --delete-all       # delete every one
```

Needs `DISCORD_TOKEN` and `CLIENT_ID` (not `GUILD_ID` — global commands are not
scoped to a guild). A delete is checked against the live list first, so a typo
is a "no such command" naming what is really there rather than a 404. Global
changes take up to an hour to reach clients, so still seeing it straight
afterwards is propagation, not a failed delete — confirm with the listing, not
the picker.

## Host setup

The current host is a **Mac mini**. Most deployment writing on the internet -
and most of what an assistant will hand you - assumes a Linux server, so the
differences are written down here rather than rediscovered.

### Linux

The usual shape: a dedicated unprivileged user in the `docker` group, because
`dockerd` is a system daemon whose socket is group-readable.

```bash
sudo adduser --disabled-password --gecos "" deploy
sudo usermod -aG docker deploy
```

Being in the `docker` group is root-equivalent, which is why that user should
do nothing else.

### macOS (the Mac mini)

**None of the above works, and the design does not port either.** Expect:

| What you'd run on Linux | On macOS |
|---|---|
| `adduser`, `usermod` | do not exist - macOS uses `sysadminctl` / `dscl` |
| `/home/deploy` | `/home` is an **autofs mount point**; `mkdir` there fails with `Operation not supported`. Home directories live in `/Users` |
| `chown user:group` | BSD `chown` - different flags and error wording |
| the `docker` group | **does not exist** |
| `watch` | not installed |

The important one is the last row but one. There is no system Docker daemon on
macOS: Docker Desktop, Colima and OrbStack each run a Linux VM **under a user's
session**, with a per-user socket. A separate `deploy` user would SSH in and
find no Docker at all.

**So deploy as the user that runs the VM** — which is why the deploy runs on
the mini itself rather than SSHing into it. A home Mac mini is also behind NAT,
so a GitHub-hosted runner could not reach it without port forwarding or a
tunnel; a registered runner makes an *outbound* connection instead and needs
neither.

#### Registering the runner

Under Settings → Actions → Runners → **New self-hosted runner** → macOS, run
the commands GitHub shows you (they embed a one-time registration token), then
install it as a service so it survives a reboot:

```bash
./svc.sh install
./svc.sh start
./svc.sh status
```

Then set the repository variable **`DEPLOY_RUNNER_LABEL`** (Settings →
Secrets and variables → Actions → Variables) to the runner's label, normally
`self-hosted`. That variable is the switch: unset, the deploy job stays on a
hosted runner and only prints instructions, so it cannot hang in a queue
waiting for a runner that is not there.

Finally, create the host directory the deploy reads and put the bot's `.env`
in it:

```bash
mkdir -p ~/legacy-bot
cp /path/to/your/.env ~/legacy-bot/.env   # never commit this file
```

`docker-compose.yml` is copied there from the checkout on every deploy, so the
compose config stays versioned in git while the secrets stay on the host.

> **A self-hosted runner executes whatever a workflow tells it to.** Keep it on
> a private repository, and never enable it for fork pull requests — a fork
> could otherwise run code on the machine hosting the live bot.

##### If the runner cannot find `docker`

`launchd` starts services with a minimal `PATH` that has neither Homebrew
directory on it, so a deploy fails with `docker: command not found` even though
`docker` works in your own shell. `scripts/deploy.sh` prepends
`/opt/homebrew/bin` and `/usr/local/bin` for exactly this reason.

#### Keeping it actually always-on

A Mac mini will happily sleep through the night and drop the gateway
connection. Three settings, none optional for a permanent host:

```bash
sudo pmset -a sleep 0 disablesleep 1   # never sleep
sudo pmset -a autorestart 1            # come back after a power cut
pmset -g                               # check it took
```

and **Colima instead of Docker Desktop**, because Docker Desktop needs a
logged-in GUI session - after an unattended reboot there is no Docker until
someone signs in:

```bash
brew install colima docker docker-compose
colima start
brew services start colima   # start at boot; confirm with `brew services list`
```

If you stay on Docker Desktop instead, enable automatic login *and* Docker
Desktop's "Start Docker Desktop when you sign in", or a reboot leaves the bot
down until you are physically there.

## Secrets

`DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID`, `DEV_ID` live in the `production`
environment, not repository secrets. If the token ever appears in a log,
regenerate it in the Discord developer portal, update the environment secret,
redeploy - masking is not containment.
