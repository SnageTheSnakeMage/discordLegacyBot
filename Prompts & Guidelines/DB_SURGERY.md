# Editing the live database by hand

The live game state is a single SQLite file inside a Docker volume on the Mac
mini. This is how to change it from the Windows laptop without corrupting a
game, and what to check afterwards.

**Reach for a command first.** `/sandbox` sets any settable `Players` column
and the game meta, `/override` and `/changegamestate` cover the rest, and every
one of them maintains the invariants below. Hand-editing is for what no command
can do: a column `/sandbox` does not expose, a repair after a crash, or a bulk
change across rows.

---

## 1. Where the data is

| | |
|---|---|
| file | `/data/database.db` **inside the container** (`LEGACY_DB_STORAGE`) |
| volume | `legacy_legacy-db` (project name `legacy` is pinned in `docker-compose.yml`) |
| container | `discord-bot` |
| icons | `/data/player-tiles` in the same volume |
| backups | `~/legacy-bot/backups/database.<timestamp>.db` on the mini, written by every deploy |
| host directory | `~/legacy-bot` — holds `.env`, `docker-compose.yml`, `current-digest`, `backups/` |

Two things that follow from this:

- `DeclutteredAttempt1/database/database.db` in the repo is **not** the live
  database. Editing it changes nothing on the host.
- The volume is the only copy of a game. A `docker volume rm` is not
  recoverable except from `backups/`.

SQLite is in its default rollback-journal mode (nothing sets `journal_mode`),
so there is no `-wal` file to lose. A `database.db` copied while the bot is
stopped is a complete database.

---

## 2. Reaching the mini from Windows

Once, on the mini: **System Settings → General → Sharing → Remote Login: on**.
Note the user name and address it prints (`snage@192.168.1.42`, say). A static
DHCP reservation, or Tailscale if you want it from outside the house, saves
hunting for the address later; `.local` names resolve from Windows only
sometimes.

Then from the laptop, in PowerShell (OpenSSH ships with Windows 10 and 11):

```powershell
ssh snage@192.168.1.42
```

Key-based login beats retyping a password:

```powershell
ssh-keygen -t ed25519            # once, if you have no key
type $env:USERPROFILE\.ssh\id_ed25519.pub | ssh snage@192.168.1.42 "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"
```

Everything below runs in that SSH session unless it says PowerShell. `docker`
must be on the PATH there — it is Colima's, so if `docker ps` says nothing,
`colima status` and `docker context use colima` first.

---

## 3. The procedure

Always in this order. Steps 1 and 2 are what make the rest safe.

### 1. Stop the bot

```bash
docker stop discord-bot
```

Editing while it runs is the one way to make a mess that no verification
catches: the bot writes from its own connection, `SQLITE_BUSY` aborts a
command halfway, and a distribution can land between your two statements.

### 2. Take a backup you can name

```bash
docker run --rm -v legacy_legacy-db:/data -v ~/legacy-bot/backups:/backup alpine \
  cp /data/database.db /backup/database.before-$(date +%Y%m%d%H%M%S).db
ls -lh ~/legacy-bot/backups | tail -3
```

### 3. Edit

**Option A — sqlite3 in a throwaway container (no files move):**

```bash
docker run --rm -it -v legacy_legacy-db:/data alpine \
  sh -c 'apk add --no-cache sqlite >/dev/null && sqlite3 /data/database.db'
```

That gives a `sqlite>` prompt. Useful settings and a first look:

```sql
PRAGMA foreign_keys = ON;   -- the CLI defaults this OFF; the bot's own
                            -- connections have it ON, so without this line a
                            -- hand edit can leave a Players.Class_ID or a
                            -- Tiles.PlayerN pointing at nothing
.headers on
.mode column
SELECT Game_ID, GAME_STATE, AP_INTERVAL_MIN, APAmount FROM Games;
SELECT Player_ID, Discord_ID, Tile_ID, Dead, Action_Points, Health_Points
  FROM Players WHERE Game_ID = 1;
```

Wrap changes so a mistake costs nothing:

```sql
BEGIN;
UPDATE Players SET Action_Points = 12 WHERE Player_ID = 7;
SELECT Player_ID, Action_Points FROM Players WHERE Player_ID = 7;   -- look first
COMMIT;      -- or ROLLBACK;
```

`alpine` needs internet for `apk add`. Offline, `docker run --rm -it -v
legacy_legacy-db:/data keinos/sqlite3 sqlite3 /data/database.db` works if that
image is already pulled.

**Option B — a GUI on the laptop.** Good for browsing, and for edits easier to
see than to write. Copy out, edit, copy back:

```bash
# on the mini: lift the file out of the volume onto the host
docker run --rm -v legacy_legacy-db:/data -v ~/legacy-bot:/out alpine \
  cp /data/database.db /out/database.edit.db
```

```powershell
# on the laptop
scp snage@192.168.1.42:~/legacy-bot/database.edit.db .
# ...open in DB Browser for SQLite, change things, File > Write Changes...
scp .\database.edit.db snage@192.168.1.42:~/legacy-bot/database.edit.db
```

```bash
# back on the mini: put it in place
docker run --rm -v legacy_legacy-db:/data -v ~/legacy-bot:/in alpine \
  cp /in/database.edit.db /data/database.db
rm ~/legacy-bot/database.edit.db
```

The copy back is a whole-file replacement: anything the bot wrote after you
copied out is lost. That is another reason the bot is stopped.

**Option C — one statement, no prompt.** For a change you have already decided:

```bash
docker run --rm -v legacy_legacy-db:/data alpine sh -c \
  'apk add --no-cache sqlite >/dev/null && sqlite3 /data/database.db \
   "UPDATE Games SET GAME_STATE = '"'"'ACTIVE'"'"' WHERE Game_ID = 1;"'
```

### 4. Verify the invariants

Run these before starting the bot. Every one should return **no rows**; each is
a state the game cannot produce, and each breaks something specific. They were
checked against the real schema by building each broken state and confirming
the query returns it.

```sql
-- a corpse standing on the board, or a live player nowhere
SELECT Player_ID FROM Players WHERE (Dead = 1 AND Tile_ID IS NOT NULL)
                                 OR (Dead = 0 AND Tile_ID IS NULL);

-- a player pointing at a tile whose slots do not name them back:
-- unreachable by anything that looks players up by tile
SELECT p.Player_ID, p.Tile_ID FROM Players p JOIN Tiles t ON t.Tile_ID = p.Tile_ID
 WHERE p.Tile_ID IS NOT NULL
   AND p.Player_ID NOT IN (COALESCE(t.Player1,-1), COALESCE(t.Player2,-1),
                           COALESCE(t.Player3,-1), COALESCE(t.Player4,-1));

-- a tile slot naming a player who is not standing there
SELECT t.Tile_ID, t.Player1 FROM Tiles t JOIN Players p ON p.Player_ID = t.Player1
 WHERE p.Tile_ID <> t.Tile_ID AND COALESCE(p.Tile_ID2, -1) <> t.Tile_ID;
--   ...repeat for Player2, Player3, Player4

-- second-body columns set on a player with no second body
SELECT Player_ID FROM Players
 WHERE Tile_ID2 IS NULL AND (Health_Points2 > 0 OR Damage2 > 0 OR Range2 > 0);

-- a gamestate nothing will accept
SELECT Game_ID, GAME_STATE FROM Games WHERE GAME_STATE NOT IN
 ('REGISTRATION','ACTIVE','DEV_PAUSED','OVER');

-- a running clock on a game that cannot have one
SELECT Game_ID, GAME_STATE FROM Games
 WHERE gameActive = 1 AND GAME_STATE NOT IN ('ACTIVE','DEV_PAUSED');

-- a timestop with no turns left to end it, which never lifts on its own
SELECT Game_ID FROM Games
 WHERE timeStopped = 1 AND (timestopTurns IS NULL OR timestopTurns <= 0);

-- a player whose class no longer exists. Only reachable if something wrote
-- with foreign keys off - which the sqlite3 CLI does by default
SELECT p.Player_ID FROM Players p LEFT JOIN Classes c ON c.Class_ID = p.Class_ID
 WHERE c.Class_ID IS NULL;
```

`PRAGMA integrity_check;` answers `ok` on a healthy file, and
`PRAGMA foreign_key_check;` returns nothing.

### 5. Start the bot and watch it

```bash
docker start discord-bot
docker logs -f --tail 50 discord-bot
```

A game whose `GAME_STATE` or `gameActive` you changed by hand is picked up by
the AP check within 30 seconds — the tick re-reads the row every pass.

---

## 4. The rules the game relies on

These are the ones SQL will happily break.

- **`Tile_ID` and `Dead` are one state.** On the board: `Tile_ID` set, `Dead`
  0, and one of the tile's `Player1..4` naming the player. Off it: `Tile_ID`
  NULL and `Dead` 1. Anything else is a corpse standing up or a live player the
  renderer cannot draw. Moving a player means updating three places — their
  `Tile_ID`, the old tile's slot (to NULL) and the new tile's slot.
- **A Twin's bodies are paired columns.** Body 1 is
  `Health_Points`/`Tile_ID`/`Damage`/`Range_`/`Free_Move`, body 2 the same names
  suffixed `2`. Whichever body is lost, the survivor ends up in **body 1** and
  the `2` columns are cleared. "Has a second body" is `Tile_ID2 IS NOT NULL`,
  never `Health_Points2 > 0`.
- **Tiles hang off `Layer_ID`, not a game.** There is no `Tiles.Game_ID`
  column; a game's tiles are those whose `Layer_ID` is in
  `SELECT Layer_ID FROM Layers WHERE Game_ID = ?`.
- **`Classes` is reference data.** Never delete a row: `Players.Class_ID`
  points at it. Class changes belong in `database/seed/classes.csv` plus
  `node scripts/bootstrap-db.js --sync-classes` — see `CHANGING_CLASSES.md`.
- **`lastAPDistributionTimestampInMS` is epoch milliseconds.** Setting it
  forward suppresses the next distribution; setting it far back makes the next
  tick pay every interval since, all at once. To pay a game now, set it to
  `now - AP_INTERVAL_MIN * 60000 - 1000`.
- **`GAME_STATE` is where a game is in its life, and nothing else** — one of
  `REGISTRATION`, `ACTIVE`, `DEV_PAUSED`, `OVER`. Time stop, the finale and
  sandbox mode are separate boolean columns, because a game can be in any
  combination of them while being played.
- **`gameActive` is the game clock**: AP distribution and the chaos council
  poll, and nothing else. It is the only column that decides whether a game is
  paid — not the gamestate, and not `timeStopped` or `finale`. A game may be
  `ACTIVE` with the clock stopped (nobody is paid, everybody can still act) or
  `DEV_PAUSED` with it running (nobody can act, AP piles up). `REGISTRATION` and
  `OVER` must have it 0; the bot's own writer forces that, and the query above
  finds a hand edit that did not.
- **Starting the clock by hand needs the AP timestamp moved with it.** The bot's
  writer resets `lastAPDistributionTimestampInMS` when the clock starts, so the
  game is not immediately paid for the hours it spent stopped. SQL does not:
  set both, or the first tick pays every interval since.
  ```sql
  UPDATE Games SET gameActive = 1,
    lastAPDistributionTimestampInMS = CAST(strftime('%s','now') AS INTEGER) * 1000
   WHERE Game_ID = 1;
  ```
- **`timeStopped` only decides who may act** — Clockwatchers only. It does not
  stop AP, and `timestopTurns` is what ends it, one per distribution.
- **`finale` is set once and never cleared.** It records that the one-time
  transition already happened; clearing it makes the next distribution run that
  transition again, opening four more gateways per layer.

---

## 5. The flag columns, and the one-time migration

`gameActive`, `timeStopped`, `finale` and `sandbox` were added when
`TIMESTOPPED`, `FINALE`, `SANDBOX` and `INACTIVE` stopped being gamestates.
**`node scripts/bootstrap-db.js` does this itself on every container start**, so
a normal deploy needs nothing from you: it adds the columns when they are
missing and rewrites the old states, and does nothing at all once they exist.

It is written out here so you can see what it will do, or do it by hand on a
copy first. Same rules as everything else in this document — stop the bot, take
a backup — and it maps the four states that went away:

```sql
PRAGMA foreign_keys = ON;

ALTER TABLE Games ADD COLUMN gameActive  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE Games ADD COLUMN timeStopped INTEGER NOT NULL DEFAULT 0;
ALTER TABLE Games ADD COLUMN finale      INTEGER NOT NULL DEFAULT 0;
ALTER TABLE Games ADD COLUMN sandbox     INTEGER NOT NULL DEFAULT 0;

-- the games that were already ACTIVE get their clock FIRST: the three
-- rewrites below land on 'ACTIVE' themselves, and a blanket rule afterwards
-- would hand a sandbox game the clock the line below withholds
UPDATE Games SET gameActive = 1 WHERE GAME_STATE = 'ACTIVE';

UPDATE Games SET GAME_STATE = 'ACTIVE', timeStopped = 1, gameActive = 1 WHERE GAME_STATE = 'TIMESTOPPED';
UPDATE Games SET GAME_STATE = 'ACTIVE', finale      = 1, gameActive = 1 WHERE GAME_STATE = 'FINALE';
UPDATE Games SET GAME_STATE = 'ACTIVE', sandbox     = 1, gameActive = 0 WHERE GAME_STATE = 'SANDBOX';
UPDATE Games SET GAME_STATE = 'OVER',                    gameActive = 0 WHERE GAME_STATE = 'INACTIVE';

SELECT Game_ID, GAME_STATE, gameActive, timeStopped, finale, sandbox FROM Games;
```

`INACTIVE` meant "finished", so it becomes `OVER` with a stopped clock. The
clock column reproduces exactly which games used to be paid — AP ran in
`ACTIVE`, `TIMESTOPPED` and `FINALE`, and never for a sandbox game, whose ticks
come from `/sandbox ap-tick` by hand.

Run the verification queries in section 3 afterwards: the gamestate query and
the new clock query both return nothing on a migrated database.

---

## 6. Restoring

```bash
docker stop discord-bot
ls -lh ~/legacy-bot/backups
docker run --rm -v legacy_legacy-db:/data -v ~/legacy-bot/backups:/backup alpine \
  cp /backup/database.<timestamp>.db /data/database.db
docker start discord-bot && docker logs -f --tail 50 discord-bot
```

Player icons are in the same volume but not in the database backup; a restore
leaves them alone, which is what you want.

---

## 7. Do not

- Edit while the container runs.
- Copy `database.db` out, leave the bot running, and copy it back later — that
  silently discards everything played in between.
- Create directories under `/data` with a root `docker run`: the bot runs as
  `bot` and cannot write into them (`EACCES` at registration). Use
  `docker exec -u 0 discord-bot chown -R bot:bot /data/<dir>` if you already
  did.
- Expect an edit to `DeclutteredAttempt1/database/database.db` in the repo to
  reach the host.
- `docker compose down -v`, ever: `-v` removes the volume.
