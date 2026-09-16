# AI DISCLOSURE 
I know that the culture around LLM assisted coding is controversial and that a big sticking point I agree with is that it should be a choice of the consumer, due to many of my friends caring deeply about this and myself caring about being transparent and integral as a person the following text summarizes how I used AI(mainly Claude) to develop this discord bot so that they can come to their own conclusions, and just due to the fact that my haphazard way of development does not make it easy to tell just what I did my hand and what came out of the trillion parameter statistical model known as Claude Code.
-
The development process of this discord bot started in November 2020, through a tool I bought and downloaded off of steam known as '[Discord Bot Studio](https://store.steampowered.com/app/1118380/Bot_Studio_for_Discord/)' after running into the frustration inducing sequence of attempting to port in proper database protocols into it through flowcharts I gave up on the tool and decided to just code it from a lower level for an easier development experience and more control.
After which I read up on the documentation of [discordjs](https://discordjs.guide/), a node package that streamlines & types interactions with Discord's API in TypeScript/JavaScript. And after reading used LLM generated code(in this case I believe it was Claude sonnet 4?) for some examples to help get me started and generate the boilerplate. 
After editing what it made I worked on the majority of the commands by hand until I thought it was complete, though unknown to my knowledge I would encounter a slew of bugs when attempting small playtests with a handful(3-5) of friends. 
Which led me to implementing Jest and slowly adding automated unit testing to my codebase. Then around the June 1st 2025 I began using LLM assisted coding tools(Claude again) via cursor, Mostly using it for analysis and development advice. This continues up until the account I was borrowing moved off of the pro plan around Early September 2025. 
I still used cursor as an IDE simply due to hating how VS code look and it suddenly deciding not to open on my laptop at one point. from there I used its line autocompletion feature but I did not prompt generation for large chunks of the codebase until around late August 2026. 
At this point my development process moved from writing code with cursory line completion to prompting Claude opus 5 on a pro subscription I borrowed. I would have it make a PR, then I would review that PR, and merge it in. 
I do occasionally do minute tiny changes where LLM coding tools would be overkill, but the majority of the code AFTER around August 15th 2026 is LLM generated, as the commit history shows.
At first I used it mainly to add in the unit tests and refactor commands to be easier to make the unit tests for that I originally was slowly developing by hand because that part of the development process was like pulling teeth and I hated it but it was necessary for me to be able to efficiently refactor and bugfix the many problems my old code had. The reason it was so horrible to do was because the majority of it was coded by a version of me that did not understand how to properly create functions and avoid non-deterministic actions mixing with deterministic ones. Mainly the whole issue of a lot of the codebase partially depending on discordjs client & ineteraction object when it did not need to, seperating the logic of a command from its response was a huge thing that claude turned from about 2 months of work into a week. 
This change has hidden most of the work I did by hand due to the logic I wrote being moved to new files for better encapsulation, thus I disclose it here. If you have any specific questions about how I use Claude code feel free to make an issue here or contact me directly @ the following:
Email: 'firecardmaster+QA@gmail.com'
Discord: 'snage.'
and I'll add your question and answer here.

# Legacy(v3.1.1) Discord Bot
 A discord bot for running the game legacy. Made this incase anyone was curious on progress/wanted to help. 

# Legacy Season 4 Explanation Draft
## Summary
Legacy is a Social RTS  Battle Royale game where people move on a grid and fight to be the last. one. standing.

You eliminate others by spending a shareable currency given every 12 hours to shoot someone once they are 
<range> squares away until their HP is 0. 
Killers get +1 to their max stats,

(Examples: 
Player gets a kill and receives the following increases to their maximums
max. AP 12 -> 13, 
max. HP 10 -> 11, 
max. Damage 2 -> 3)

## AP
This currency is known as AP, you get 2 AP @ 12 PM UTC & 12AM UTC(To balance time zones difference).  

You can have a maximum of 12 AP. And you can use AP to....

  - Move in any of the 8 directions (1 AP)
  - Give X AP to any player in your range(X AP)
  - Shoot/Deal Damage to any player in your range and aligned with you diagonally or orthoginally(2 AP)
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
Void - You cant move onto this tile, but can shoot over it with the exception of cloudborns

Fire - -1HP every time you move on or off this tile
Ice - upon moving onto an ice tile you must move again before another action may be done, this movement does not cost AP
Storm - puts you in a random surrounding square if you move onto it
Smoke - becomes a blank tile when someone moves off of it(with the exception of gateway and locked gateway tile which will stay the same), anyone outside of the tile cannot see who is on this tile with the exception of the oracles
Mine - Upon stepping onto this tile lose 1 HP then it becomes a blank tile(with the exception of gateway and locked gateway tile which will stay the same). Can look like any tile to everyone except minesweepers or oracles who will see a flag ontop of the tile. 
Bush - attacks on people on this tile and from people on this tile have a 1/2 chance of missing, with the exception of hunters.
Wall - You cant move onto this tile with the exception of cloudborns, If shot twice it will be destroyed, when destroyed leaves behind a blank tile(with the exception of gateway and locked gateway tile which will stay the same). Blocks shots
Chest - Anyone can store AP and take out AP here, all chests pull from the same storage
Heal - players on this tile receive 1 HP with their twice a day AP

Gateway - while on this you can warp up or down a layer, can only be changed by guardian
Locked Gateway - acts as a blank tile, unless unlocked by a guardian. players can warp from another layer and end up on it but unless unlocked the cannot warp again.


```
## Chaos Council
When a player dies they join the chaos council, and every 24 hours the council receives a poll to decide a random event that will affect all players. Each council member gets 1 override which can simply choose the event, an override can be used on an override to negate it.

## Classes
Each player gets a class that gives them a special ability and they're starting stats. There can only be 2 of each class in a game(meaning each game *currently* has a player max of 74) . Classes are given randomly during setup of the game.

there is a list of all the clasees and their abilities here: https://docs.google.com/spreadsheets/d/1-Wn2_q8c1k2TmlVb-KDunRGIuzC5yuqH3L4XcIIy4G4/edit?usp=sharing

## The Board
The board is different for each game but will always be a square board, each square can hold to a max of 4 players before that tile is inaccessible to all other players. 

The board is made up of multiple "layers", a player can only leave a layer with either a special class ability or a gateway tile.

## Game Finale & Winner
Once the game reaches the final four players, 
- AP will go from +2 AP twice a day to +4 AP twice a day
- Additional gateway tiles will be placed
- Fire tiles will begin spreading to adjacent squares and will take -1HP from anyone who is standing on one when AP is given.
Last one standing wins 

## Setup 
Each player is given a random layer, position, and class and then once all players are in them the game starts at the next AP drop interval.

## CI/CD

CI (`.github/workflows/ci.yml`) runs on every PR and on pushes to `main`/`cursord`:
lint, unit tests, integration tests (in-memory SQLite), an `npm audit` advisory,
a Docker build whose `test` stage runs the whole suite inside the image, a smoke
test that proves the runtime image boots to a Discord login attempt, and a Trivy
CVE scan. Fork PRs get no secrets; the workflow token is read-only; every action
is pinned to a commit SHA.

### Releasing

1. Tag: `git tag v0.x.y && git push origin v0.x.y`
2. The Deploy workflow builds and publishes `ghcr.io/<owner>/<repo>:<tag>` and
   prints the immutable **digest**. Deploys go by digest, never by tag.
3. The `deploy` job waits on the `production` environment (add yourself as a
   required reviewer under Settings → Environments → production).
4. Approve it, and the host deploys itself — see below.

### Deploying / rolling back

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

Game state lives in the `legacy_legacy-db` named volume and survives image rebuilds.
Slash-command registration is rate-limited by Discord and does NOT run on boot.
Run the Deploy workflow manually with "register commands" checked when a
command's definition changes. There is no environment-variable shortcut: the
workflow, or `node scripts/register-commands.js` with `DISCORD_TOKEN`,
`CLIENT_ID` and `GUILD_ID` set, is the whole of it.

### A command in the picker that the bot does not have

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

### Host setup

The current host is a **Mac mini**. Most deployment writing on the internet -
and most of what an assistant will hand you - assumes a Linux server, so the
differences are written down here rather than rediscovered.

#### Linux

The usual shape: a dedicated unprivileged user in the `docker` group, because
`dockerd` is a system daemon whose socket is group-readable.

```bash
sudo adduser --disabled-password --gecos "" deploy
sudo usermod -aG docker deploy
```

Being in the `docker` group is root-equivalent, which is why that user should
do nothing else.

#### macOS (the Mac mini)

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

##### Registering the runner

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

##### Keeping it actually always-on

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

### Secrets

`DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID`, `DEV_ID` live in the `production`
environment, not repository secrets. If the token ever appears in a log,
regenerate it in the Discord developer portal, update the environment secret,
redeploy - masking is not containment.
