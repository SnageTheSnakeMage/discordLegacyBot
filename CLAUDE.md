# Working in this repository

## Where the code lives

`DeclutteredAttempt1/` is the live tree. Everything runs, builds and is tested
from there — CI sets `working-directory: DeclutteredAttempt1` for every job.

`Discord Bot Studio Attempt/` is an older attempt kept for reference. It is
not built, not tested and not deployed, so changes do not belong there.

## Commands

Run these from `DeclutteredAttempt1/`:

- `npm run lint` — eslint. Must report 0 errors; there are pre-existing
  warnings, so only warnings on lines you touched are yours.
- `npm test` — the whole jest suite, both projects.
- `npm run test:unit` / `npm run test:integration` — one project at a time.
- `npm run test:coverage` — what CI's `unit` job runs.

## Architecture

Commands are split into a thin adapter and a pure logic file, e.g.
`commands/Developer Commands/createGame.js` and `createGame.logic.js`:

- `<command>.logic.js` exports `parse`/`run`/`present`. `run(input, deps)`
  takes plain data and a deps bundle and **never sees the interaction**, which
  is what makes it testable without mocking discord.js.
- `<command>.js` is the adapter: it reads the interaction, calls
  `runLogged(...)`, and replies. Anything needing the discord client —
  `interaction.client` — belongs here, not in the logic file.

Every longer-form document lives in `Prompts & Guidelines/`: `TESTING.md`
describes this split in full, `CI_CD_PROMPT.md` covers the pipeline and the
container build, and `BOARDS.md` and `CHANGING_CLASSES.md` are the gameplay
references. `QUIRKS.md` is **no longer in use** — it is kept for history, much
of it is fixed, and some of it was wrong when written; check the code rather
than trusting an entry there.

Unit tests never touch the database. `utils.models.*` is stubbed with
`jest.spyOn`; only the integration project seeds a real schema. If a unit test
dies with `SQLITE_ERROR: no such table`, a new query needs a stub.

## Pull requests

When asked to open a PR, also watch it: subscribe to its activity, then fix CI
failures and address review comments until it is green and mergeable, without
being asked again. Report back only when something needs a decision, or when
the PR is done.

## THINGS AGENT #1 FOUND HELPFUL

Notes from a session that added `/trace`, `/check-target` retargeting, the
chaos poll descriptions, `commandCatalog.js` and `/sandbox`. Each one cost
time to learn, so it is written down rather than rediscovered.

### Tests

- **A test count is not a coverage count.** `it.each` over 44 commands and 139
  options once reported 240 tests for 13 real assertions. Prefer one test that
  walks the data and asserts on a collected list of offenders: the failure
  names every violation at once, and the suite counts rules instead of rows.
- **Prove a test bites before trusting it.** Break the thing it guards, watch
  it fail with a useful message, then restore. A guard that has never failed
  has never been tested.
- **Logic files over 200 non-comment lines must use `stepLogger`**, enforced by
  `tests/logicFileLogging.test.js`. Worth wiring in as the file grows rather
  than discovering it from a red suite.

### Refactors

- **Diff the artifact, not just the tests.** Before migrating all 44 commands
  to the catalogue, dump every `data.toJSON()`, migrate, dump again and compare.
  Byte-identical output proves behaviour was preserved in a way a green suite
  does not. The same trick generated the catalogue: build the new source *from*
  the old output instead of retyping it.
- **Split a function without changing it.** `spawnPlayer` came out of
  `registerPlayer` carrying its quirks forward verbatim, including the icon
  path bug. Fixing behaviour inside a refactor hides both changes. (That bug
  was then fixed on its own, as its own commit — see the icon path section
  below. That is the order to do it in, not a reason to preserve it again.)

### The position invariant: `Tile_ID` and `Dead` are one state

A player is on the board or they are not, and two columns have to agree about
it. `playerDeathLogic` writes `{Tile_ID: null, Dead: true}` together, so:

- a tile set without clearing `Dead` is a corpse standing on the board;
- `Dead` cleared without setting a tile is a live player **nowhere** — the
  renderer cannot draw them and every command that needs a tile refuses them;
- a `Players.Tile_ID` naming a tile whose `PlayerN` slots do not name the
  player back is unreachable by anything that looks players up by tile.

There is one writer for each direction, and neither is optional:

- **`utils.clearPlayerFromBoard(playerId, tileId, column)`** takes a body off:
  vacates the tile slot and nulls the player's own column.
- **`utils.placePlayerOnBoard(playerId, tile, { column, db })`** puts one on:
  claims a free slot, points the row at the tile, and clears `Dead` — all
  three in one call. It takes the tile *row* (every caller has already fetched
  it to check occupancy) and throws `"tile is full"` rather than returning, so
  check occupancy first and reject with `TILE_FULL`. Pass `db: models` from a
  logic file so the unit tests exercise it instead of stubbing it.

`/resurrect` is the cautionary tale: it wrote `{ Dead: 0 }` and claimed a slot
using the resurrectee's *own* `Tile_ID`, which is null for a dead player — so
the where-clause matched nothing and resurrection produced a live player off
the board. Its test looked right only because the fixture gave a dead player a
non-null `Tile_ID`, a state the game never produces. **Build fake rows that
match what the writers actually write.**

### A Twin's two bodies, and which one survives

Body 1 is `Health_Points`/`Tile_ID`/`Damage`/`Range_`/`Free_Move`; body 2 is
the same columns suffixed `2`. `damagePlayer(attacker, victim, damage, body)`
picks between them by body number, so the pairing is fixed.

**Whichever body is lost, the survivor ends up in body 1** and the body-2
columns are nulled (`Tile_ID2: null`, the rest `0`). That is not cosmetic:
`hotPotatoSwap`'s Twin case takes `Tile_ID2`/`Health_Points2`/`Damage2`/
`Range2` wholesale, so a survivor left sitting in body 2 would have the wrong
body taken off it. With this rule, taking an already-lost second body is a
no-op on nulls.

Two consequences worth knowing:

- **"Has a second body" is `Tile_ID2 != null`, not `Health_Points2 > 0`.**
  `Health_Points2` is 0 both for a body that just died and for one that was
  never there, so it cannot tell "lost a body" from "down to nothing".
- **After a consolidation the survivor is body 1**, so a caller that remembered
  "body 2" is now pointing at nothing. Real callers are fine: `shoot` and
  `snipe` choose the body by which tile the target is standing on, and the
  survivor's tile is in `Tile_ID`.

`playerDeathLogic`'s Twin branches are an **else-if chain** for a reason. They
were six sequential `if`s all reading the same stale `victim`, so a revive was
immediately undone by a clear branch below it that still saw the pre-revive hp.

Note that **weird death case #0 handles Twin revives**: it tests
`Health_Points <= 0 && Pharoh_HP > 0` with no Twin exclusion and returns, so
every Twin revive where body 1 went down is handled there, not in the Twin
block — and correctly, because consolidation means a Twin with body 1 at zero
has no second body left. Do not add a branch for it in the Twin block; it
would be dead code.

### Traps in this codebase

- **`getRandomInt(max)` is inclusive of `max`.** Index a collection with
  `length - 1`; passing the count rolls one past the end and returns
  `undefined`. `getRandomItemInCollection` documents this at `utils.js:88`.
- **`getOldestGamestateGameId` throws on an empty result** — it ends in
  `games[games.length - 1].Game_ID`. Resolve the game yourself when "no such
  game" should be a rejection rather than a crash.
- **`distributeAP(game, times)` is catch-up, not repetition.** It grants
  `APAmount * times` in one pass, ticking `immutableDoomsday` once and posting
  one poll. N real distributions means calling it N times.
- **Logic files never receive a Discord client**, by design — `override.logic.js`
  records an out-of-scope `client` as a removed bug. Anything needing one
  (`distributeAP`, channel fetches) belongs in the adapter, which has
  `interaction.client`.
- **The renderer falls back to `tiles/<layer>/default.png`** when a texture is
  missing, so a player with no icon file silently renders as the default
  instead of erroring.

### The player icon path — fixed, and the one place still out of step

`registerPlayer` used to write `tiles/players/<Discord_ID>.png` on its non-Twin
branch while the renderer read `tiles/players/<Discord_ID>_<gameId>.png`, so
every non-Twin player rendered as `default.png`. **This is fixed**:
registration now always writes `<Discord_ID>_<gameId>.png`, matching the
renderer. Do not "preserve" it in a refactor — it is no longer the behaviour.

`<Discord_ID>_<gameId>.png` is the one true player-icon path, and nothing
spells it by hand any more: **`utils.playerIconName(discordId, gameId)`** is
the single definition, used by the writer (`registerPlayer`) and by both
readers.

**A player icon is state, not artwork.** It arrives at registration, so it is
written to `utils.playerTilesDir()` - `LEGACY_PLAYER_TILES_DIR`, which points
into the `/data` volume in the container and at `./tiles/players` everywhere
else. Written into the image it lived exactly as long as the container, and
every deploy wiped every icon uploaded since the previous one.

That makes the players layer the one with TWO directories, which
`utils.tileSearchDirs(layer)` answers: the writable one first, then the image.
Do not "simplify" it by mounting the volume over `./tiles/players` - that
hides the baked `default.png` behind an empty volume on a fresh host, and
freezes the committed icons at whatever the first deploy seeded.

Both readers now survive a missing file, by different routes:

- the renderer asks `loadTileTexture`, which **falls back to `default.png`**,
  so a missing icon is cosmetic;
- `stats.logic.js` goes through **`utils.resolveTileTexturePath(layer, name)`**
  — `loadTileTexture` in path form, same fallback. It used to attach the old
  unsuffixed path directly, and since `AttachmentBuilder` does not read the
  file until send time, a missing icon took `/stats` into the central error
  handler.

**Never build an attachment path by hand.** A path that does not exist fails
at send time as an unhandled error, not as a missing image, so the player is
told "There was an error while executing this command!" for a cosmetic
problem. `resolveTileTexturePath` returns `null` only when even the layer
default is missing, and the caller is expected to drop the image rather than
name an attachment it did not attach.

Note it does **not** copy `loadTileTexture`'s transparent-for-null behaviour:
a null name resolves to `default.png`, because an invisible texture is
indistinguishable from a correctly transparent one and would hide a misspelt
name.

### Discord limits worth knowing before designing a command

- Command and option names: `^[a-z0-9_-]{1,32}$`. Descriptions 1-100
  characters — the longest in the catalogue is currently *exactly* 100.
- At most 25 options, 25 subcommands, and 25 choices per option. 29 `Players`
  columns are settable, which is why `/sandbox` has both `set-stat` and
  `set-meta`.
- A command cannot mix subcommands with top-level options, and one rejected
  command fails the whole deploy `PUT` — so a bad catalogue entry takes every
  command down, not just its own.
- `events/interactionCreate.js` returns early on anything that is not a chat
  input command, so buttons, select menus and autocomplete are dropped today.
  Any component UI needs that handler extended or a per-message collector.

## THINGS AGENT #2 FOUND HELPFUL

Notes from the session that added the null guards, the content cap, the
`/listgames` gamestate filter, `placePlayerOnBoard` and the Twin
consolidation. Same deal as above: written down rather than rediscovered.

### "There was an error while executing this command!" is a symptom

That string is `events/interactionCreate.js` catching anything that escapes.
It is almost never a bug in the command's own logic — it is usually the
Discord boundary rejecting a reply, or a null row read one line too early.
Four causes found in one session:

- **Empty content.** Discord will not send `{ content: '' }`, so a `present()`
  that builds a string in a loop fails when the loop body never runs. The fix
  is words, not a guard: see `NOTICES` in `commands/_messages.js`.
- **Content over 2000 characters.** `toDiscord` caps it now, so this one is
  handled centrally — but only for `content`.
- **An attachment path that does not exist.** `AttachmentBuilder` does not read
  the file until send time, so a missing icon fails as an unhandled error
  rather than a missing image. Never build one by hand; see the icon path
  section above.
- **A null row read straight into a property access.** The big one, below.

When a command "errors", reach for the reply shape before the logic.

### A fixture that cannot occur hides the bug it documents

Three separate bugs this session were invisible because a test built a state
the game never produces, and every one of those tests was passing:

- a dead player with a non-null `Tile_ID`, which hid `/resurrect` never
  putting anyone back on the board;
- a `className: 'Twin'` with `Health_Points2` but no `Tile_ID2`, which hid the
  body swap and reads as a player who already lost a body;
- an icon attached at a path nothing writes.

**Build fake rows from what the writers actually write.** If you are unsure,
find the write and copy its shape. `tests/integration/helpers/seed.js` and
`assertBoardConsistent` exist for exactly this; a real schema catches what a
hand-built object will not.

### `playerDeathLogic` is guard clauses that `return`

Before adding a branch there, check it can be reached. The chain returns
early several times, and the guards are not consistent with each other — the
first excludes Twins and null killers, weird death case #0 immediately below
excludes neither. That is why case #0 handles every Twin revive where body 1
went down (see the note in the Twin block). It also used to dereference
`killer.Kills` on an environmental death (`damagePlayer(null, ...)` from a
fire tile) whenever the victim had `Pharoh_HP > 0` — **that is fixed**: the
kill credit and `ChaosEventDeathCheck` are both behind a `killer != null`
guard, matching the branch above.

A branch written without checking reachability is dead code that reads as
behaviour.

### One row, many writes: beware the stale object

`playerDeathLogic` receives `victim` once and then writes to it repeatedly.
Sequential `if`s all test the ORIGINAL values, so an earlier branch's write is
invisible to a later one — a revive was being undone by a clear branch below
it that still saw the pre-revive hp. Use `else if` when exactly one outcome
should happen, and re-read the row when a later decision depends on an earlier
write. `damagePlayer` already re-reads for this reason, and `/sandbox ap-tick`
re-reads the game row each pass.

### Give a DB helper an injectable `db`

A `utils` helper that writes is normally unreachable from a unit test, because
`utils` uses its own module-level `models` while a logic file is handed
`deps.models`. The usual answer is to stub the helper, which means the thing
you extracted to enforce an invariant is never exercised. `placePlayerOnBoard`
takes `{ db = models }` instead, and the logic file passes `deps.models` — one
definition, still tested. Worth doing for anything that must not drift.

### `test.failing` is a question, not a broken test

`utils.deathLogic.test.js` carried one for the Twin body swap, flagged on PR
#92 and waiting on a game-rule decision. It is a good pattern: the suite stays
green, the finding does not get lost, and when the rule is decided the test
becomes a normal `it`. If you find one, the answer is a decision from the
maintainer, not a code change.

### `main` moves under you

Four merges landed during this session. Before opening a PR, re-fetch; before
claiming CI is green, check the run for the head sha you actually pushed
rather than the newest run in the list, which may be someone else's push to
`main`.
