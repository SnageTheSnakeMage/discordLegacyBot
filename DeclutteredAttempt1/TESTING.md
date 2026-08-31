# Testing Legacy Bot — command refactor + test suite

Running this document end to end closes **#75 (rewrite commands for better testing)** and **#74 (create proper tests)**. They are one job: the commands cannot be meaningfully tested in their current shape, and any suite written against that shape tests the mocking, not the game.

- **Part 0** — verified current state. Read it first.
- **Part 1** — the refactor prompt (**#75**). Separates each command's game logic from Discord so the logic can be called directly.
- **Part 2** — the unit test prompt (**#74**), written against the refactored shape. **No `discord.js` mock, no `jest.mock` of `utils`.**
- **Part 3** — integration tests, step by step.

Do them in order. Part 2 is not achievable without Part 1; that is the whole point.

For CI/CD see `CI_CD_PROMPT.md`, after all three parts.

---

## Part 0 — Ground truth

Verified by running it. Re-verify before trusting; the repo moves.

### The suite cannot run today

**Blocker 1 — `tests/setup.js` is missing a global that `utils.js` needs at import time.** `utils.js:20` runs `globalThis.topLogger.child(...)` at module scope. `index.js` sets it; `tests/setup.js` sets only `tileCache` and `CommandExecutionLogger`. Any test that reaches `utils.js` throws `Cannot read properties of undefined (reading 'child')` before the first assertion.

```bash
node -e "require('./tests/setup.js'); console.log(typeof globalThis.topLogger)"   # -> undefined
```

**Blocker 2 — 38 of 40 test files import helpers that do not exist.** `tests/helpers/` contains only `mockModels.js`. The files import `helpers/mockDiscord` (38), `helpers/mockInteraction` (38) and `helpers/mockUtils` (37). The three that import none of them (`board.test.js`, `gift.test.js`, `tests/utils.test.js`) all reach `utils.js`, so they hit Blocker 1 instead. **All 40 fail.**

```bash
ls tests/helpers/
grep -rho "helpers/[a-zA-Z]*" tests/ | sort | uniq -c
```

**Blocker 3 — environment, not repo.** On a checkout whose `node_modules` was installed on another platform, `require('canvas')` fails with `invalid ELF header` and `node_modules/.bin/jest` is not executable. Jest then fails during config validation with a misleading complaint about `tests/setup.js`, which is **not** a `jest.config.js` problem — the same failure reproduces in a throwaway project outside this repo. Fix with `rm -rf node_modules && npm ci`.

### `discord.js` never needed mocking

This matters because it justifies the whole approach below. The real library loads and builds a command definition offline, with no token and no network:

```bash
node -e "
const {SlashCommandBuilder} = require('discord.js');
console.log(new SlashCommandBuilder().setName('board').setDescription('x').toJSON());
"
```

A whole command module loads too, once `canvas` is available. So `helpers/mockDiscord` was never solving a real problem — it existed because the tests replaced `utils` wholesale and then had to replace everything else that touched it. **Delete that idea.** The reason command logic is hard to test is not `discord.js`; it is that the logic and the Discord conversation are interleaved in the same functions.

### What is actually blocking testability

`board.js` and `gift.js` already gesture at the right shape with `execute` / `inputValidation` / `logic`. The split does not pay off yet because:

1. **`inputValidation(interaction)` takes the interaction and replies to it.** `board.js` calls `interaction.editReply(...)` and then `return`s `undefined` on every rejection path, so `logic(undefined)` runs next and throws. Validation cannot be tested without a fake interaction, and its rejection results are not values you can assert on.
2. **`logic()` constructs `discord.js` objects.** `board.js` returns `new AttachmentBuilder(...)`. A layer that builds library types is a layer you must mock the library to test.
3. **Shared helpers reply to interactions.** `utils.checkGameState(gamestate, isClockwatcher, interaction)` decides *and* sends the message *and* returns a bare boolean. Every command that calls it inherits a dependency on a live interaction.
4. **Rejections are messages, not values.** "Not enough AP" exists only as an English string passed to `editReply`. Nothing can assert on the *reason* without string-matching prose that changes whenever the wording does.

That last point is why the existing tests assert `deferReply` was called: it is the only observable they have.

### What this costs today — three live bugs of exactly the kind the refactor exposes

`utils.checkGameState` switches on `GAMESTATES.FINISHED`, and `board.js` switches on `GAMESTATES.PAUSED`. Neither exists:

```bash
node -e "const G=require('./enums.js').GAMESTATES; console.log(G.FINISHED, G.PAUSED, Object.keys(G).join(','))"
# undefined undefined ACTIVE,DEV_PAUSED,OVER,TIMESTOPPED,FINALE,REGISTRATION,INACTIVE,SANDBOX
```

So the "game is over" branch is dead (`OVER` is the real name), the "game is paused" branch in `board.js` is dead (`DEV_PAUSED`), and **`FINALE` is not handled at all** — it falls through to `default` and throws, meaning every command throws during a finale. A pure `checkGameState` with a table-driven test over `Object.values(GAMESTATES)` catches all three on the first run. The current one cannot be tested without an interaction, so nobody ever ran it.

---

## Part 1 — Refactor prompt (closes #75)

> Everything to the end of Part 1 is the prompt. Paste it with Part 0.

### Objective

Restructure every command so its game logic is a plain async function that takes plain data and returns plain data. Discord stays at the edges. After this, testing the logic requires no Discord fake of any kind — not a mocked module, not a fake interaction.

Do **not** change game behaviour in this refactor. It is a move-and-reshape. Behaviour changes and bug fixes go in separate commits, clearly labelled, so a reviewer can tell restructuring from rewriting.

### Target architecture

Each command becomes two files:

| File | Imports `discord.js`? | Contains |
|---|---|---|
| `commands/<Category>/<name>.js` | **yes** | `data` (the `SlashCommandBuilder`), and `execute(interaction)` — the adapter |
| `commands/<Category>/<name>.logic.js` | **never** | `parse`, `run`, `present` — everything else |

`<name>.logic.js` importing `discord.js`, directly or transitively, is the one hard failure condition of this refactor. Enforce it with lint (see below), not with discipline.

**The four functions.**

```js
// <name>.logic.js  — no discord.js anywhere in this file

// 1. parse(rawOptions, actor) -> input
//    Pure. Plain object in, plain object out. No DB, no I/O, no throwing on
//    business rules - only on structurally impossible input.
//    rawOptions: { game: 3, x: 4, y: 2, target: '456' }  (ids as strings, not User objects)
//    actor:      { discordId: '123', username: 'snage' }

// 2. async run(input, deps) -> CommandResult
//    All game logic and all database access. Never sees an interaction.
//    deps = { models, utils, now, random } - defaulted to the real ones, so
//    production callers pass nothing and tests pass fakes without jest.mock.

// 3. present(result) -> reply descriptor
//    Pure. CommandResult in, { content } or { files: [{ buffer, name }] } out.
//    Plain objects only - no EmbedBuilder, no AttachmentBuilder.
```

**The `CommandResult` contract.** Every `run` resolves to one of:

```js
{ ok: true,  kind: 'moved',        data: { ... } }
{ ok: false, reason: 'NOT_ENOUGH_AP', data: { needed: 4, has: 2 } }
```

`reason` is a stable machine-readable code from a shared enum (`enums.js` → `REJECTIONS`), never prose. Tests assert on `reason`; `present()` turns it into English. This is what lets a wording change stop breaking tests, and it is the single most important part of the contract.

`run` throws only for genuine faults (DB unavailable, invariant violated). Rejections a player can cause are returned, not thrown.

**The adapter.** `execute` becomes uniform enough to be nearly boilerplate:

```js
// <name>.js
const { SlashCommandBuilder, AttachmentBuilder, MessageFlags } = require('discord.js');
const logic = require('./board.logic');

module.exports = {
  data: new SlashCommandBuilder() /* ... unchanged ... */,

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const input = logic.parse(readOptions(interaction), readActor(interaction));
    const result = await logic.run(input);
    await interaction.editReply(toDiscord(logic.present(result)));
  },
};
```

`readOptions`, `readActor` and `toDiscord` are three shared helpers in `commands/_adapter.js`. `toDiscord` is the only place `AttachmentBuilder` and `EmbedBuilder` are ever constructed. Error handling lives in `events/interactionCreate.js`, which already has a try/catch — delete the duplicated try/catch from each command rather than copying it 40 times.

### Prerequisite refactors (shared; do these before any command)

1. **`utils.checkGameState` must return a verdict, not send a message.**

   ```js
   // was: checkGameState(gamestate, isClockwatcher, interaction) -> bool, replies as a side effect
   // now:
   checkGameState(gamestate, isClockwatcher)   // -> { blocked: false } | { blocked: true, reason: 'GAME_OVER' }
   ```

   Pure, synchronous, no interaction. While you are in there: `GAMESTATES.FINISHED` should be `OVER`, and `FINALE` needs a real case instead of falling into `default` and throwing (Part 0). Fix those in a **separate commit** from the signature change so the behaviour fix is reviewable on its own. Update all callers.

2. **Add `REJECTIONS` to `enums.js`** — one frozen object of rejection codes (`NOT_IN_GAME`, `NOT_ENOUGH_AP`, `OUT_OF_RANGE`, `WRONG_CLASS`, `TILE_FULL`, `TARGET_NOT_ON_TILE`, `GAME_OVER`, `GAME_PAUSED`, `TIME_STOPPED`, `PLAYER_DEAD`, …). Grow it as you convert commands.

3. **Create `commands/_adapter.js`** with `readOptions(interaction, spec)`, `readActor(interaction)` and `toDiscord(descriptor)`. This file imports `discord.js`; nothing under it does.

4. **Create `commands/_deps.js`** — the default dependency bundle every `run` falls back to:

   ```js
   const utils = require('../utils');
   module.exports = {
     models: utils.models,
     utils,
     now:    () => Date.now(),
     random: (max) => utils.getRandomInt(max),
   };
   ```

   `now` and `random` live here so time- and chance-dependent commands become deterministic in tests without stubbing globals.

5. **Create `commands/_messages.js`** mapping every `REJECTIONS` code to player-facing text, so wording lives in one file.

6. **Add the boundary lint rule.** In `.eslintrc`, an override for `**/*.logic.js`:

   ```js
   'no-restricted-imports': ['error', { paths: [
     { name: 'discord.js', message: 'Logic files must not import discord.js - keep Discord in the adapter.' }
   ]}]
   ```

   Add `commands/_adapter.js` to the same restriction list for `*.logic.js` too. This rule is what keeps the boundary from eroding six months from now.

### Worked example — `board.js`

Today `inputValidation` replies to the interaction and returns `undefined` on rejection; `logic` builds an `AttachmentBuilder`. After:

```js
// board.logic.js
const { GAMESTATES, REJECTIONS } = require('../../enums.js');
const defaultDeps = require('../_deps');           // { models, utils }

function parse(raw, actor) {
  return {
    gameId:   raw.game  ?? null,
    layer:    raw.layer ?? null,
    body:     raw.body === 2 ? 2 : 1,
    discordId: actor.discordId,
  };
}

async function run(input, deps = defaultDeps) {
  const { models, utils } = deps;
  const gameId = input.gameId ?? await utils.getOldestGameId(input.discordId);
  const game   = await models.Games.findByPk(gameId);
  if (!game) return { ok: false, reason: REJECTIONS.NO_SUCH_GAME };

  const player = await models.Players.findOne({ where: { Game_ID: gameId, Discord_ID: input.discordId } });
  if (!player) return { ok: false, reason: REJECTIONS.NOT_IN_GAME };

  const playerClass = await models.Classes.findByPk(player.Class_ID);
  const verdict = utils.checkGameState(game.GAME_STATE, playerClass.Class_Name === 'Clockwatcher');
  if (verdict.blocked) return { ok: false, reason: verdict.reason };

  const layerId = input.layer !== null
    ? await utils.commonLayerIDtoDbLayerID(gameId, input.layer)
    : (await models.Tiles.findByPk(input.body === 2 ? player.Tile_ID2 : player.Tile_ID)).Layer_ID;

  const buffer = await utils.GenerateGameGridImage(gameId, layerId, player.Player_ID);
  return { ok: true, kind: 'board', data: { buffer, gameId, layerId } };
}

function present(result) {
  if (!result.ok) return { content: messageFor(result.reason, result.data) };
  return { files: [{ buffer: result.data.buffer, name: 'grid.png' }] };
}
```

`run` is now callable from a test with two plain objects and a fake `models`. Note what disappeared: the interaction, the `AttachmentBuilder`, the duplicated gamestate switch, and the `undefined` return path.

### Order of work

1. Prerequisites 1–6 above.
2. **`board` and `gift`** — they already have the split, so they are the cheapest conversions and they prove the shape. Do not proceed until both are converted, tested, and reviewed.
3. **`listGames`, `stats`** — read-only, few branches.
4. **`move`, `shoot`** — the highest-value commands and the most branches. `move.js` is being actively rewritten (`80628d7c`); **coordinate before touching it** rather than conflicting.
5. **Class commands** — 24 files, all the same shape. Batch them.
6. **Dev commands** — keep the `interaction.user.id != process.env.DEV_ID` gate in the adapter, and pass `isDev` into `run` as data.

Convert one command per commit. Each commit: the two files, the deleted old test, the new test. A 40-command big-bang PR is unreviewable.

### Acceptance criteria for Part 1

- Every command has a `.logic.js` sibling, and `grep -rl "discord.js" commands/*/*.logic.js` returns nothing.
- The lint rule from prerequisite 6 is on and passing.
- No `.logic.js` file references `interaction` — `grep -rn "interaction" commands/*/*.logic.js` returns nothing.
- `utils.checkGameState` takes two arguments and returns an object.
- Every rejection path returns a `REJECTIONS` code; no player-facing English appears in any `.logic.js`.
- The bot still works: run it against a test guild and exercise `board`, `move`, `shoot` and `gift` by hand. This refactor has no test coverage while it is in progress, which is exactly why it goes first and in small commits.

---

## Part 2 — Unit test prompt (closes #74)

> Prompt continues. Assumes Part 1 is done for the command you are testing.

### What changed

You are testing `run(input, deps)`: plain data in, plain data out. So:

- **No `jest.mock('discord.js')`.** Tests of `.logic.js` never load it. Delete `helpers/mockDiscord` from the plan; it is not needed.
- **No `jest.mock('../../utils')`.** Pass fakes through `deps`. Module mocking was the source of the "everything is stubbed so nothing is tested" problem; dependency injection removes the need.
- **No `helpers/mockInteraction` for logic tests.** A small `fakeInteraction` is still worth having for the handful of adapter tests in §"Testing the adapter", but 90% of tests never touch it.

The only helper that survives is `mockModels.js`, and it needs fixing first.

### Step 0 — Unblock the harness

1. `tests/setup.js` must set every global that module scope reads:

   ```js
   const pino = require('pino')
   const silent = pino({ level: 'silent' })    // no pino-pretty transport: it spawns a worker and Jest hangs
   globalThis.topLogger = silent
   globalThis.CommandExecutionLogger = silent
   globalThis.tileCache = globalThis.tileCache || {}
   ```

2. Delete `tests/jest.config.js` — a stale second config whose `testMatch` (`**/__tests__/**`) matches nothing.

3. Add to the root `jest.config.js`: `clearMocks: true`, `restoreMocks: true`, `testTimeout: 10000`.

4. `rm -rf node_modules && npm ci && npx jest --listTests` must exit 0.

### Step 1 — Fix `mockModels.js`

It is the one surviving helper and it currently lies. `createFakeGame` returns a `GAMESTATES` field and `AP_Amount`; `createFakePlayer` returns `MAX_DMG`. None are columns. Check every field against `database/Models/*.js` — no model uses a Sequelize `field:` mapping, so **the attribute name is the column name**. A fixture with an invented column makes a test pass against code that would fail on the real database, which is the exact bug class #79 was about.

Then add:

```js
// createDeps({ models, utils }) -> a complete deps object with real utils and fake models by default,
// so a test overrides only what it cares about:
//   const deps = createDeps({ models: { Players: { findOne: async () => player } } });
// Include deterministic `now` and `random` so time- and chance-dependent commands are stable.
```

### Step 2 — The shape of a test

```js
const logic = require('../../../commands/Player Commands/gift.logic');
const { createDeps, createFakePlayer, createFakeGame } = require('../../helpers/mockModels');
const { REJECTIONS } = require('../../../enums.js');

describe('gift', () => {
  it('rejects when the giver does not have the AP', async () => {
    const deps = createDeps({ models: {
      Games:   { findByPk: async () => createFakeGame({ GAME_STATE: 'ACTIVE' }) },
      Players: { findOne:  async () => createFakePlayer({ Action_Points: 1 }) },
    }});

    const result = await logic.run({ gameId: 1, discordId: '123', targetDiscordId: '456', amount: 5 }, deps);

    expect(result).toEqual({ ok: false, reason: REJECTIONS.NOT_ENOUGH_AP, data: { needed: 5, has: 1 } });
  });
});
```

No `jest.mock`. No interaction. No `discord.js`. The assertion is on the decision, not on whether a reply was sent.

### Step 3 — What every command's `run` must cover

Six cases. Where one does not apply, write a one-line comment saying why rather than silently omitting it.

1. **Every rejection has a test asserting its `reason` code**, and asserting **no writes happened**: `expect(deps.models.Players.update).not.toHaveBeenCalled()`.
2. **Gamestate gate** — parameterised over `Object.values(GAMESTATES)` so a new state cannot be added without a test failing. This is the test that catches the `FINALE` bug from Part 0.
3. **Boundaries** — exactly-enough AP vs one short; exactly at max range vs one beyond. Off-by-one is the most common real bug here.
4. **Success path** asserts the returned `data` **and** the exact write payload:

   ```js
   expect(deps.models.Players.update).toHaveBeenCalledWith(
     { Action_Points: 3 }, { where: { Player_ID: 1 } }
   );
   ```

   Assert the payload, not just that `update` was called — column names are the thing most likely to be wrong.
5. **`parse` is tested separately** and is pure: defaults applied, absent options become `null`, `body` coerced to 1 or 2.
6. **`present` is tested separately** and is pure: every `REJECTIONS` code maps to non-empty text. A single table-driven test over the whole enum prevents a code that renders as `undefined`.

### Step 4 — Testing the adapter

Thin, so test it thinly. One file, `tests/commands/adapter.test.js`, covering `commands/_adapter.js`:

- `readOptions` pulls declared options off a fake interaction and returns plain values (a `User` becomes its id string).
- `toDiscord({content})` and `toDiscord({files:[{buffer,name}]})` produce what `editReply` expects — this is the only test that constructs `AttachmentBuilder`, using the **real** `discord.js`.

Plus one smoke test per command asserting `data.toJSON().name` is right and `execute` is a function. That is all the adapter coverage needed; the logic tests carry the weight.

### Step 5 — Order of work, and retiring the old tests

1. **Pure functions in `utils.js` first — no mocks, no deps, no refactor needed.** `getTileCordinatesOfLine`, `getDirection`, `inputPathToArray`, `verifyinputPath`, `addStartToPathArray`, the price-scaling helpers, and the newly-pure `checkGameState`. Table-driven with `it.each`. Highest value per line in the suite, and it needs none of the infrastructure above — **start here, today, before Part 1 is finished.** Issue #88 is exactly this.
2. **DB-touching utils with fake models**: `getAllPlayersOnTile`, `removePlayerFromTile`, `getSurroundingTiles`, `getSpawnpointTile`, `classRemoval`, `playerDeathLogic`. `playerDeathLogic` is the highest-risk function in the codebase — twin bodies, pharaoh revive HP, five killer-class branches. Its own file, every branch.
3. **Command logic**, in the same order Part 1 converts them.

**Delete the old test file in the same commit that converts its command.** Do not migrate them; they assert `deferReply` was called and carry the mocking pattern being removed. The per-command case registry in `tests/COMMAND_TEST_REFACTOR_PROMPT.md` §"Command test case registry" is still a good inventory of *what to cover* — mine it for cases, ignore its mocking guidance, which this document supersedes.

### Definition of done for Part 2

- `npx jest` exits 0 from `DeclutteredAttempt1/` after a clean `npm ci`.
- **`grep -rn "jest.mock" tests/` returns nothing** except in `adapter.test.js`, if at all.
- No test file imports `discord.js` except `adapter.test.js`.
- Every test asserts a returned value or a write payload; none asserts only that a reply happened.
- `npx jest --coverage`: ≥80% branch coverage on `commands/**/*.logic.js`, ≥70% on `utils.js`.
- Mutation check: pick five tests at random, break the line each covers, confirm each goes red. A test that stays green is deleted and rewritten.

### Anti-patterns — reject in review

- `jest.mock` of `utils` or `discord.js` in a logic test.
- Asserting on player-facing prose instead of a `REJECTIONS` code.
- Fixtures with columns absent from `database/Models/`.
- `setTimeout`/`setImmediate` waits to let un-awaited promises settle. If you need one, something isn't awaited — that's a bug to report, not to sleep around.
- Snapshots over reply strings; they lock in typos and rot on every copy edit.
- Tests written to match current buggy behaviour. Write the correct assertion and mark it `test.failing()` or `test.todo()`.

---

## Part 3 — Integration tests, step by step

Unit tests with fake models cannot catch a column name that does not exist: a fake happily accepts `models.Players.update({Trapped: false})`; SQLite does not. Integration tests exist for that class, plus multi-step state transitions.

**Definition here:** real Sequelize, real models, real schema, real `run()` functions, against an **in-memory SQLite database**. Canvas stays faked. No network, no bot token, no committed `database.db`.

After Part 1 these are unusually easy — `run(input, deps)` takes real models as readily as fake ones, so an integration test is a unit test with `deps.models` pointing at a real database.

### Step 1 — Make the database injectable (prerequisite)

`utils.js` builds Sequelize at module scope with a hard-coded path. Change it to:

```js
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: process.env.LEGACY_DB_STORAGE || './database/database.db',
  logging: process.env.LEGACY_DB_LOGGING === '1' ? console.log : false,
});
```

Export `sequelize` from `utils.js` so tests can `sync()` and `close()`.

### Step 2 — The harness

`tests/integration/helpers/testDb.js`:

```js
if (process.env.LEGACY_DB_STORAGE !== ':memory:') {
  throw new Error('integration tests must run against :memory: - refusing to touch a real database');
}
const utils = require('../../../utils');
const { sequelize, models } = utils;

async function freshDb() { await sequelize.sync({ force: true }); return models; }
async function closeDb()  { await sequelize.close(); }

module.exports = { freshDb, closeDb, sequelize, models, utils };
```

Set `LEGACY_DB_STORAGE=':memory:'` in the integration project's `globalSetup` so it is set before `utils.js` is required. Call `freshDb()` in `beforeEach`, not `beforeAll` — per-test isolation is worth the cost, and a leaked row is the hardest failure to read.

**Verify before continuing:** a test calling `freshDb()` then `models.Tiles.create({...})` must succeed. If `sync()` fails on the associations in `database/init-models.js`, fix that first — it means the schema cannot be created from the models at all.

### Step 3 — Seed a known board

Do not reuse `database/tileTableHydration.sql` (651 lines, a full production board). Build a deterministic 5×5 single-layer fixture — enough for every movement, range and adjacency case, and small enough that failures are readable.

`tests/integration/helpers/seed.js` exports:

- `seedGame(overrides)` → one `Games` row, `GAME_STATE: 'ACTIVE'`, known `moveCost`/`shootCost`/`fireDmg`/`mineDmg`.
- `seedLayer(gameId, {width, height})` → a `Layers` row plus `width*height` `Blank1` tiles, 1-indexed.
- `seedPlayer(gameId, {discordId, className, x, y, ...stats})` → the `Classes` row if absent, the `Players` row, **and** the matching `Tiles.PlayerN` slot. Setting both sides is the point — it is the invariant #78 is about.
- `assertBoardConsistent(layerId)` → asserts that for every player, exactly one tile references them and `Players.Tile_ID` points back at it. **Call it at the end of every integration test.**
- `boardAscii(layerId)` → a string rendering of tile types and occupants, for readable failure output.

No randomness. A seeded board must be byte-identical every run.

### Step 4 — First test: prove the harness reaches the real database

Pick a behaviour that a fake `models` cannot catch. The mine path is the canonical one — it was broken precisely because `endTile.Trapped` (capital T) is not the `trapped` column, and no mock-based test could ever have seen it:

```js
const { freshDb, closeDb, models, utils } = require('../helpers/testDb');
const { seedGame, seedLayer, seedPlayer, assertBoardConsistent } = require('../helpers/seed');
const moveLogic = require('../../../commands/Player Commands/move.logic');

it('a mine damages whoever steps on it and is consumed', async () => {
  await freshDb();
  const game   = await seedGame();
  const layer  = await seedLayer(game.Game_ID, { width: 5, height: 5 });
  const walker = await seedPlayer(game.Game_ID, { discordId: '1', x: 1, y: 1, Health_Points: 5 });
  const trapper= await seedPlayer(game.Game_ID, { discordId: '2', x: 5, y: 5, className: 'Minesweeper' });

  const mined = await models.Tiles.findOne({ where: { Layer_ID: layer.Layer_ID, X_Position: 2, Y_Position: 1 } });
  await mined.update({ trapped: true, trapper: trapper.Player_ID });

  const result = await moveLogic.run({ gameId: game.Game_ID, discordId: '1', path: 'right,1;' }, { models, utils });

  expect(result.ok).toBe(true);
  expect((await models.Players.findByPk(walker.Player_ID)).Health_Points).toBe(5 - game.mineDmg);
  const cleared = await models.Tiles.findByPk(mined.Tile_ID);
  expect(cleared.trapped).toBe(false);
  expect(cleared.trapper).toBeNull();
  await assertBoardConsistent(layer.Layer_ID);
});
```

**Acceptance for Step 4:** check out `fb7e453c` (the commit immediately before #92 merged) and confirm this test **fails** there, then confirm it passes on `main`. If it passes on both, your harness is not hitting the real database.

### Step 5 — Cover the state transitions, in this order

Each spans multiple tables, which is why it needs integration coverage:

1. **Registration** — `registerPlayer` creates a `Players` row *and* claims a `Tiles.PlayerN` slot; a Twin claims two distinct tiles. Assert both sides.
2. **Movement** — AP deducted, `Players.Tile_ID` and both tile slots updated, old tile vacated, `assertBoardConsistent` passes.
3. **Shooting** — damage applied, walls block, range enforced, `Wall` → `Wall_Damaged` → destroyed.
4. **Death** — `playerDeathLogic` end to end, then each special case separately: Twin (one body vs both), Pharaoh revive HP, Hitman target bonus, Cannibal AP, Minesweeper mines cleared on death.
5. **AP distribution** — `distributeAP` over a seeded board: AP granted and capped at `MAX_AP`, overflow to `MISSED_AP`, fire/lava damage, doomsday and timestop counters persisted.
6. **Chaos events** — one test per implemented event asserting its stated rule. Cheapest integration tests to write; pure game rules over a known board.

### Step 6 — Determinism

- **Randomness** — spawn selection, bush misses and class assignment go through `utils.getRandomInt`. After Part 1 it arrives via `deps.random`; inject a seeded PRNG. Never assert on an unseeded outcome.
- **Time** — `distributeAP` reads `lastAPDistributionTimestampInMS`. Inject `deps.now` and seed the timestamp explicitly.
- **Ordering** — never assert on `findAll` order without an explicit `order:` clause. SQLite's default order is not a contract.
- **Board rendering** — `board.test.js` currently compares against `tests/testFiles/10x10Blank1Board.json`, a golden PNG buffer. It will break on any `canvas`, font or library bump and tell you nothing. Assert image dimensions and that a buffer was produced; keep pixel comparison out of CI.

### Step 7 — Separate the two suites

```js
// jest.config.js
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
      globalSetup: '<rootDir>/tests/integration/globalSetup.js',   // sets LEGACY_DB_STORAGE=':memory:'
      maxWorkers: 1,                                               // one in-memory DB at a time
    },
  ],
};
```

```json
"test": "jest --selectProjects unit",
"test:integration": "jest --selectProjects integration",
"test:all": "jest",
"test:coverage": "jest --coverage"
```

`.dockerignore` currently excludes `tests` and `jest.config.js`, so tests cannot run inside the built image. That is handled by a dedicated build stage — see `CI_CD_PROMPT.md`.

### Definition of done for Part 3

- `npm run test:integration` passes on a clean checkout with no `.env`, no network, and no `database/database.db` present.
- The Step 4 mine test fails at `fb7e453c` and passes on `main`.
- `assertBoardConsistent()` is called at the end of every integration test and passes.
- Total integration runtime under 60 seconds.
- The `testDb.js` guard makes it impossible to run integration tests against a real database file.
