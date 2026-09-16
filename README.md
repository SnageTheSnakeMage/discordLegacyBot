# Legacy(v3.1.1) Discord Bot
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

### Deploying / rolling back (manual until a deploy target is configured)

The `docker` commands below are the same everywhere. **Everything about setting
the host up is Linux-specific** — users, groups, the daemon, autostart — and
none of it ports to macOS. See [Host setup](#host-setup) before following any
guide that says `adduser`.

On the host:

```bash
# 1. BACK UP FIRST - abort if this fails
docker run --rm -v legacy-db:/data -v "$PWD":/backup alpine \
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

Game state lives in the `legacy-db` named volume and survives image rebuilds.
Slash-command registration is rate-limited by Discord and does NOT run on boot.
Run the Deploy workflow manually with "register commands" checked when a
command's definition changes. There is no environment-variable shortcut: the
workflow, or `node scripts/register-commands.js` with `DISCORD_TOKEN`,
`CLIENT_ID` and `GUILD_ID` set, is the whole of it.

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

**So deploy as the user that runs the VM.** Add the workflow's public key to
that user's own `~/.ssh/authorized_keys`, and restrict what the key may do:

```
restrict,pty,command="/Users/<you>/deploy.sh" ssh-ed25519 AAAA... github-actions-deploy
```

Enable SSH under System Settings → General → Sharing → **Remote Login**, and
set `DEPLOY_SSH_USER` to your short name (`whoami`).

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
