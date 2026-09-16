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
describes this split in full, `QUIRKS.md` records known broken and surprising
behaviour that tests deliberately pin, `CI_CD_PROMPT.md` covers the pipeline
and the container build, and `BOARDS.md` and `CHANGING_CLASSES.md` are the
gameplay references.

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
  path bug below. Fixing behaviour inside a refactor hides both changes.

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

### Known bug, not yet fixed

`registerPlayer` writes the player icon to `tiles/players/<Discord_ID>.png` on
its non-Twin branch, but the renderer reads
`tiles/players/<Discord_ID>_<gameId>.png` (`utils.js:726`). Only the Twin
branch writes the path that is read, so **every non-Twin player renders as
`default.png`**.

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
