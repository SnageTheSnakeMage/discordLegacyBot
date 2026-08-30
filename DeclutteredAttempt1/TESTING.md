# Testing Legacy Bot — unit test prompt + integration test guide

This document has three parts:

- **Part 0** — the verified current state of the test suite. Read it before doing anything; the suite does not currently run, for three separate reasons.
- **Part 1** — a self-contained **prompt** for writing the unit test suite. Paste it (with Part 0) into a coding agent, or follow it yourself.
- **Part 2** — a **step-by-step guide** to building integration tests on top of that.

For CI/CD, see `CI_CD_PROMPT.md` in this directory. Do that **after** Parts 1 and 2 — a pipeline that runs a broken suite is worse than no pipeline, because it manufactures a green check.

---

## Part 0 — Ground truth

Everything in this section was verified by running it. Re-verify before trusting it; the repo moves.

### The suite cannot run today. Three independent blockers.

**Blocker 1 — `tests/setup.js` does not define every global that `utils.js` needs at import time.**

`utils.js:21` runs `globalThis.topLogger.child({file: 'utils.js'})` at module scope. `index.js:20` sets `globalThis.topLogger`, but `tests/setup.js` only sets `tileCache` and `CommandExecutionLogger`. So *any* test that requires `utils.js` — directly or through a command — throws `Cannot read properties of undefined (reading 'child')` before a single assertion runs.

Verify:

```bash
node -e "require('./tests/setup.js'); console.log(typeof globalThis.topLogger)"   # -> undefined
```

**Blocker 2 — every test file imports helpers that do not exist.**

`tests/helpers/` contains exactly one file, `mockModels.js`. Across the 40 test files:

| Required module | Test files importing it | Exists? |
|---|---|---|
| `helpers/mockDiscord` | 38 of 40 | **no** |
| `helpers/mockInteraction` | 38 of 40 | **no** |
| `helpers/mockUtils` | 37 of 40 | **no** |
| `helpers/mockModels` | 3 of 40 | yes |

So 38 test files fail at require time regardless of Blocker 1. The three that import none of the missing helpers — `board.test.js`, `gift.test.js` and `tests/utils.test.js` — all require `utils.js`, so they fail on Blocker 1 instead. **All 40 fail.**

`gift.test.js` was migrated to `mockModels` in `fb7e453c`, so the migration is already under way; these counts move as it continues. Re-run the command below rather than trusting the table.

Verify:

```bash
ls tests/helpers/
grep -rho "helpers/[a-zA-Z]*" tests/ | sort | uniq -c
```

**Blocker 3 — environment, not repo: a `node_modules` built for the wrong platform.**

On a Linux checkout with the committed/copied `node_modules`, `require('canvas')` fails with `invalid ELF header` and `node_modules/.bin/jest` is not executable. Jest then fails during config validation with a misleading `Module <rootDir>/tests/setup.js ... was not found`, which is **not** a `jest.config.js` problem — the same failure reproduces in a throwaway project outside this repo. The fix is a clean platform-native install (`rm -rf node_modules && npm ci`), which is also why CI must never reuse a committed `node_modules`.

### What the existing 40 test files are worth

They are scaffolding, not coverage. The dominant pattern is:

```js
jest.mock('../../../utils', () => require('../../helpers/mockUtils').createUtilsMock());
```

`createUtilsMock()` returns `{ models }` and nothing else, so every piece of logic the command actually depends on gets stubbed. A test like that asserts "the command called `deferReply` and then `editReply`" — it passes whether or not the shot hit, the AP was deducted, or the player died. `tests/COMMAND_TEST_REFACTOR_PROMPT.md` already diagnoses this correctly and its per-command case registry (lines 171–776) is genuinely useful. **Keep that registry.** This document supersedes its setup/mocking sections and adds the integration layer it doesn't cover.

Two smaller notes:

- `tests/jest.config.js` is a stale second config with `testMatch: ['**/__tests__/**/*.test.js']`, which matches nothing. Delete it; the root `jest.config.js` is the real one.
- `board.test.js` opens with `const verifiedInputs =` followed by the `beforeEach(...)` call. That parses (the call becomes the initialiser) and the hook still registers, but it is accidental. Fix it when you touch the file.

### The seams

Three things must be faked, and nothing else:

| Seam | Why | How |
|---|---|---|
| **Discord** (`discord.js`) | network + needs a live bot token | mock the module |
| **Database** (`utils.models`) | needs a real DB file | mock the models in unit tests; use a real in-memory DB in integration tests |
| **Canvas** (`canvas`) | native module, needs image assets on disk | mock for everything except the board-rendering tests |

Everything else — `getTileCordinatesOfLine`, path parsing, range and cost maths, `checkGameState`, class branching, death logic — is the thing under test. Mocking it is the failure mode described above.

### Depends on open work

- Unit tests written against `cursord` today will encode current behaviour, including the column-name and `await` bugs fixed in PR #92. **Merge #92 first**, or expect to rewrite assertions.
- Integration tests need `utils.js` to stop hard-coding its database path (Part 2, Step 1). That is a one-line change but it is a prerequisite, not an optional cleanup.

---

## Part 1 — Unit test prompt

> Everything from here to the end of Part 1 is the prompt. Paste it together with Part 0.

### Role and objective

You are writing the unit test suite for a Discord bot that runs a social real-time-strategy battle royale: players occupy tiles on layered grids, spend action points (AP) to move, shoot and use class abilities, and dead players vote on chaos events.

Your objective is a suite where **a failing test means the game is wrong**, and **a passing test means that behaviour is actually exercised**. A test that would still pass with the command's body deleted is worse than no test, because it converts an unknown into a false assurance.

### Non-negotiable rules

1. **Never mock the code under test.** Mock `discord.js`, `utils.models`, and `canvas`. Nothing else. If a test needs `getTileCordinatesOfLine` stubbed to pass, the test is wrong, or the function needs its own test.
2. **Assert on outcomes, not on call plumbing.** `expect(interaction.deferReply).toHaveBeenCalled()` is not a test. Assert the reply *content*, the `models.*.update` payload, or the thrown error.
3. **Every test must be able to fail.** After writing one, break the implementation it covers and confirm it goes red. If it stays green, delete it and start over.
4. **One command per file**, mirroring the source path: `commands/Player Commands/move.js` → `tests/commands/Player Commands/move.test.js`.
5. **No test touches the network, the real database, or the real filesystem.**
6. **Deterministic or it doesn't ship.** Anything reading `Math.random`, `Date.now`, or `setTimeout` gets injected or faked. No `await new Promise(r => setTimeout(r, 50))` to "let things settle" — if you need that, something isn't awaited, which is a bug to report, not to sleep around.

### Step 0 — Unblock the harness (do this first; nothing works until it's done)

1. Add the missing global to `tests/setup.js`. `utils.js` reads `globalThis.topLogger` at import time:

   ```js
   const pino = require('pino')
   const silent = pino({ level: 'silent' })      // no pino-pretty transport in tests: it spawns a worker
   globalThis.topLogger = silent
   globalThis.CommandExecutionLogger = silent
   globalThis.tileCache = globalThis.tileCache || {}
   ```

   Drop the `pino-pretty` transport from the test logger. It starts a worker thread, which makes Jest hang on open handles.

2. Delete `tests/jest.config.js` (stale, matches nothing).

3. Confirm a clean install works on your platform: `rm -rf node_modules && npm ci && npx jest --listTests`. If `canvas` fails to load, you have Blocker 3 — the install, not the code.

4. Add to root `jest.config.js`:

   ```js
   clearMocks: true,
   restoreMocks: true,
   testTimeout: 10000,
   ```

**Acceptance for Step 0:** `npx jest --listTests` prints 40 paths and exits 0.

### Step 1 — Build the four helpers

39 test files already import these. Create them with exactly these names and exports so the existing files resolve; fix the tests' *contents* afterwards, file by file.

**`tests/helpers/mockDiscord.js`**

```js
// createDiscordMock() -> object suitable for jest.mock('discord.js', ...)
// Must provide: SlashCommandBuilder (chainable: every setX/addXOption returns this,
// toJSON() returns {name, description}), EmbedBuilder (chainable), AttachmentBuilder
// (stores the buffer, exposes .attachment), MessageFlags ({Ephemeral: 64}),
// Events, Collection (extend Map), REST/Routes stubs.
// Chainability is what stops command modules throwing at require time.
```

**`tests/helpers/mockInteraction.js`**

```js
// createMockInteraction({ options, user, guild, channel }) -> fake ChatInputCommandInteraction.
// options is a plain object; the returned interaction exposes
// options.getInteger/getString/getUser/getBoolean/getNumber/getChannel reading from it,
// returning null for absent keys (never undefined - commands use ?? defaults).
// deferReply/reply/editReply/followUp are jest.fn() resolving to undefined.
// Track `deferred` and `replied` so tests can assert a command never replies twice.
```

**`tests/helpers/mockUtils.js`** — the important one. It must **not** replace all of `utils`.

```js
// createModelsMock() -> { Games, Players, Tiles, Classes, Layers }, each with
// findByPk/findOne/findAll/create/update/destroy/count as jest.fn().
//
// Re-export the fake row factories from mockModels.js (createFakeGame, createFakePlayer,
// createFakeClass, createFakeTile, createFakeLayer) so tests have one import site.
//
// createUtilsMock() must be DELETED once tests are migrated. Until then, keep it as a
// thin alias of createModelsMock so old files still resolve - but every file you touch
// moves to the partial-mock pattern below and stops calling it.
```

The mocking pattern every test uses:

```js
jest.mock('discord.js', () => require('../../helpers/mockDiscord').createDiscordMock());

jest.mock('../../../utils', () => {
  const actual = jest.requireActual('../../../utils');
  const { createModelsMock } = require('../../helpers/mockUtils');
  return { ...actual, models: createModelsMock() };   // real logic, fake database
});
```

**`tests/helpers/mockCanvas.js`**

```js
// createCanvasMock() -> { createCanvas, loadImage, registerFont } returning a context
// whose drawImage/fillText/etc. are jest.fn(), and canvas.toBuffer() -> a small fixed Buffer.
// Only board/grid tests need this.
```

**Important:** the fake row factories in `mockModels.js` currently carry fields that are not real columns (`GAMESTATES`, `AP_Amount`, `MAX_DMG`). Correct them against `database/Models/*.js` — the model attribute name **is** the column name, since no model uses a Sequelize `field:` mapping. A fixture with an invented column will make a test pass against code that would fail on the real database, which is precisely the bug class PR #92 fixed.

**Acceptance for Step 1:** every existing test file resolves its imports. Failures are now assertion failures, not `Cannot find module`.

### Step 2 — What every command test must cover

Six cases, in this order. Where a case doesn't apply to a command, write a one-line comment saying why rather than silently omitting it.

1. **Contract** — exports `data` and `execute`; `data.toJSON()` has the expected command name.
2. **Wrong game state** — `checkGameState` runs for real; assert the user is told the game isn't accepting this command and that **no** `models.*.update` was called.
3. **Actor invalid** — not in the game / dead / wrong class. Assert the specific message and no writes.
4. **Precondition fails** — not enough AP, out of range, target not on the tile, tile full, tile is a Wall/Void. One test per branch; these are where the real bugs live.
5. **Success path** — assert the reply content **and** the exact write:

   ```js
   expect(utils.models.Players.update).toHaveBeenCalledWith(
     { Action_Points: 3 },
     { where: { Player_ID: 1 } }
   );
   ```

   Assert the *payload*, not just that update was called. Column names are the thing most likely to be wrong.
6. **Nothing is left dangling** — no unhandled rejection, and where a command performs several writes, assert they all happened (a missing `await` shows up as a missing call).

### Step 3 — Order of work

Do them in this order; each step's helpers make the next cheaper.

1. **Pure functions in `utils.js` first — no mocks at all.** `getTileCordinatesOfLine`, `getDirection`, `inputPathToArray`, `verifyinputPath`, `addStartToPathArray`, the price-scaling helpers. Table-driven with `it.each`. This is the highest value per line in the whole suite and it needs none of the infrastructure above. Issue #88 is exactly this.
2. **DB-touching utils with mocked models**: `getAllPlayersOnTile`, `removePlayerFromTile`, `getSurroundingTiles`, `getSpawnpointTile`, `classRemoval`, `playerDeathLogic`. `playerDeathLogic` is the highest-risk function in the codebase — twin bodies, pharaoh revive HP, and five killer-class branches. Give it its own file and cover every branch.
3. **Read-only commands**: `listGames`, `stats`, `board`, `checkTarget`.
4. **Core gameplay**: `move`, `shoot`, `gift`, `upgrade`, `store`, `retrieve`, `warp`.
5. **Class commands** — use the per-command case registry already written in `tests/COMMAND_TEST_REFACTOR_PROMPT.md` §"Command test case registry".
6. **Dev commands** — include the "not the dev" rejection path; `createGame.js` gates on `interaction.user.id != process.env.DEV_ID`.

### Step 4 — Definition of done

- `npx jest` exits 0 from `DeclutteredAttempt1/` on a clean `npm ci`.
- No test stubs a function defined in `utils.js` other than `getRandomInt` (and only in tests that branch on randomness).
- Every test file has at least one assertion on reply *content* or an `update`/`create` payload.
- `npx jest --coverage` reports ≥70% branch coverage on `utils.js` and ≥60% on `commands/**`.
- For each of the seven known-broken behaviours listed at the end of PR #92, there is either a test proving it fixed or an `it.todo()` naming it.
- Mutation check: pick five tests at random, break the line each covers, confirm each goes red.

### Anti-patterns — reject these in review

- `expect(interaction.editReply).toHaveBeenCalled()` as the only assertion.
- `jest.mock('../../../utils')` without `requireActual`.
- Fixtures with columns that don't exist in `database/Models/`.
- `setTimeout`/`setImmediate` waits to let un-awaited promises resolve.
- Snapshot tests over reply strings — they lock in typos and rot on every copy edit. Use `stringContaining` on the part that matters.
- Tests asserting current buggy behaviour because "that's what it does now". Write the test for the correct behaviour and mark it `.failing()` or `.todo()`.

---

## Part 2 — Integration tests, step by step

Unit tests with mocked models cannot catch the single most common bug in this codebase: **a column name that doesn't exist**. A mock happily accepts `models.Players.update({Trapped: false})`; SQLite does not. Integration tests exist to catch exactly that class, plus multi-step state transitions.

**Definition here:** real Sequelize, real models, real schema, real `utils.js` logic, against an **in-memory SQLite database**. Discord and canvas stay mocked. No network, no bot token, no committed `database.db`.

### Step 1 — Make the database injectable (prerequisite)

`utils.js` builds its Sequelize instance at module scope with a hard-coded path:

```js
const sequelize = new Sequelize({ dialect: 'sqlite', storage: './database/database.db' });
```

Change the storage to read an environment variable, defaulting to today's value so production is unaffected:

```js
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: process.env.LEGACY_DB_STORAGE || './database/database.db',
  logging: process.env.LEGACY_DB_LOGGING === '1' ? console.log : false,
});
```

Integration tests then set `process.env.LEGACY_DB_STORAGE = ':memory:'` **before** requiring `utils.js`. Also export `sequelize` from `utils.js` so tests can call `sync()` and `close()`.

> If you would rather not touch `utils.js`, the alternative is dependency injection — pass `models` into every function — which is a much larger refactor and belongs with issue #75, not here.

### Step 2 — Build the test database harness

`tests/integration/helpers/testDb.js`:

```js
process.env.LEGACY_DB_STORAGE = ':memory:';   // must run before utils.js is required

const utils = require('../../../utils');
const { sequelize, models } = utils;

async function freshDb() {
  await sequelize.sync({ force: true });   // drops and recreates every table
  return models;
}

async function closeDb() {
  await sequelize.close();
}

module.exports = { freshDb, closeDb, sequelize, models, utils };
```

Call `freshDb()` in `beforeEach`, not `beforeAll`. Per-test isolation is worth the cost at this scale; a leaked row from a previous test is the hardest kind of failure to read.

**Verify Step 2 before going further:** a test that calls `freshDb()` and then `models.Tiles.create({...})` must succeed. If `sync()` fails on the association definitions in `database/init-models.js`, fix that first — it means the schema can't be created from the models at all, which is worth knowing.

### Step 3 — Seed a known board

Don't reuse `database/tileTableHydration.sql` (651 lines, a full production board). Build a small deterministic fixture — a 5×5 single-layer board is enough for every movement, range and adjacency case, and keeps failures readable.

`tests/integration/helpers/seed.js` should export:

- `seedGame(overrides)` → one `Games` row, `GAME_STATE: 'ACTIVE'`, known `moveCost`/`shootCost`/`fireDmg`/`mineDmg`.
- `seedLayer(gameId, {width, height})` → one `Layers` row plus `width*height` `Tiles` rows, all `Blank1`, `X_Position`/`Y_Position` 1-indexed.
- `seedPlayer(gameId, {discordId, className, x, y, ...stats})` → a `Classes` row if absent, a `Players` row, **and** the matching `Tiles.PlayerN` slot. Setting both sides is the point — it's the invariant issue #78 is about.
- `boardAscii(layerId)` → a string rendering of tile types and occupants, for readable failure output.

Give every seed helper explicit arguments and no randomness. A seeded board must be byte-identical on every run.

### Step 4 — Write the first integration test and prove it catches a real bug

Start with the mine, because it is a known-broken path that unit tests with mocked models cannot catch:

```js
const { freshDb, closeDb, utils } = require('../helpers/testDb');
const { seedGame, seedLayer, seedPlayer } = require('../helpers/seed');
const move = require('../../../commands/Player Commands/move');

describe('mines', () => {
  afterAll(closeDb);

  it('damages a player who steps on a trapped tile and clears the trap', async () => {
    const models = await freshDb();
    const game = await seedGame();
    const layer = await seedLayer(game.Game_ID, { width: 5, height: 5 });
    const walker  = await seedPlayer(game.Game_ID, { discordId: '1', x: 1, y: 1, Health_Points: 5 });
    const trapper = await seedPlayer(game.Game_ID, { discordId: '2', x: 5, y: 5, className: 'Minesweeper' });

    const mined = await models.Tiles.findOne({ where: { Layer_ID: layer.Layer_ID, X_Position: 2, Y_Position: 1 } });
    await mined.update({ trapped: true, trapper: trapper.Player_ID });

    await move.moveFromTiletoTile(/* start */ ..., /* end */ mined, walker, false);

    const after = await models.Players.findByPk(walker.Player_ID);
    expect(after.Health_Points).toBe(5 - game.mineDmg);            // mine fired
    const clearedTile = await models.Tiles.findByPk(mined.Tile_ID);
    expect(clearedTile.trapped).toBe(false);                        // and was consumed
    expect(clearedTile.trapper).toBeNull();
  });
});
```

On `cursord` this fails — the code reads `endTile.Trapped` (capital T) against a `trapped` column, so the branch never runs. On PR #92 it passes. **That contrast is the acceptance criterion for Step 4**: run it on both and confirm red then green. If it passes on `cursord`, your harness isn't hitting the real database.

### Step 5 — Cover the state transitions, in this order

Each of these spans multiple tables, which is why they need integration coverage:

1. **Registration** — `registerPlayer` creates a `Players` row *and* claims a `Tiles.PlayerN` slot; a Twin claims two distinct tiles. Assert both sides.
2. **Movement** — AP is deducted, `Players.Tile_ID` and both `Tiles.PlayerN` slots update, the old tile is vacated. This is issue #78's invariant: after any move, exactly one tile references the player and `Players.Tile_ID` points back at it. Write that as a reusable `assertBoardConsistent(layerId)` helper and call it at the end of **every** integration test.
3. **Shooting** — damage applied, walls block, range enforced, `Wall` → `Wall_Damaged` → destroyed.
4. **Death** — `playerDeathLogic` end to end: `Dead` set, `Tile_ID` nulled, tile slot freed, killer's `Kills` incremented. Then each special case separately: Twin (one body vs both), Pharaoh revive HP, Hitman target bonus, Cannibal AP, Minesweeper mines cleared on death.
5. **AP distribution** — `distributeAP` over a seeded board: AP granted and capped at `MAX_AP`, overflow to `MISSED_AP`, fire/lava tile damage, the doomsday and timestop counters persisting (they are written by the `game.save()` that PR #92 made awaited).
6. **Chaos events** — one test per implemented event asserting its stated rule. These are pure game rules over a known board and are the cheapest integration tests to write.

### Step 6 — Make them deterministic

- **Randomness:** `utils.getRandomInt` drives spawn selection, bush misses and class assignment. Inject a seeded PRNG, or `jest.spyOn(utils, 'getRandomInt')` per test. Never assert on an unseeded random outcome.
- **Time:** `distributeAP` reads `lastAPDistributionTimestampInMS`. Use `jest.useFakeTimers().setSystemTime(...)` and seed the timestamp explicitly.
- **Ordering:** never assert on `findAll` order without an explicit `order:` clause. SQLite's default order is not a contract.
- **Board rendering:** `board.test.js` compares against `tests/testFiles/10x10Blank1Board.json`, a golden PNG buffer. That will break on any `canvas`/font/library bump and tell you nothing useful. Assert image *dimensions* and that a buffer was produced; leave pixel comparison out of CI.

### Step 7 — Separate them from unit tests

Integration tests are slower and have different setup. Split via Jest projects in `jest.config.js`:

```js
module.exports = {
  projects: [
    {
      displayName: 'unit',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/**/*.test.js'],
      testPathIgnorePatterns: ['<rootDir>/tests/integration/'],
      setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
    },
    {
      displayName: 'integration',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/integration/**/*.test.js'],
      setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
      maxWorkers: 1,          // one in-memory DB at a time
    },
  ],
};
```

Scripts:

```json
"test": "jest --selectProjects unit",
"test:integration": "jest --selectProjects integration",
"test:all": "jest",
"test:coverage": "jest --coverage"
```

**Note:** `.dockerignore` currently excludes `tests` and `jest.config.js`, so tests cannot run inside the built image. That is fine — CI runs them in a dedicated build stage instead. `CI_CD_PROMPT.md` covers it.

### Definition of done for Part 2

- `npm run test:integration` passes on a clean checkout with no `.env`, no network, and no `database/database.db` present.
- The Step 4 mine test fails on `cursord` and passes on `main` after #92 merges.
- `assertBoardConsistent()` is called at the end of every integration test and passes.
- Total integration runtime under 60 seconds.
- No integration test writes to `database/database.db`. Add a guard in `testDb.js` that throws if `LEGACY_DB_STORAGE` is not `:memory:`.
