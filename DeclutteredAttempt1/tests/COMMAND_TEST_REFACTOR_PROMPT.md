# Discord Bot Command Test Refactor Prompt

## Role

You are refactoring unit tests for a Discord bot that runs a social RTS battle royale: players move on a layered grid, spend AP, use class abilities, and fight until one player remains.

Your job is to rewrite command tests so they **exercise real game logic** while **only mocking I/O boundaries** (database, Discord, canvas/image generation where appropriate).

---

## Problem to fix

Current tests in `Decluttered Attempt 1/tests/commands/` do this:

```js
jest.mock('../../../utils', () => require('../../helpers/mockUtils').createUtilsMock());
```

`createUtilsMock()` replaces the **entire** `utils` module with `{ models }` only. Tests then stub functions like `getTileCordinatesOfLine`, `checkGameState`, `getUpgradePrice`, etc.—the same logic the command relies on. That means tests only verify "the command called deferReply/editReply," not whether the command behaves correctly.

**Goal:** Command tests should run **real non-database utils logic** and assert on **outcomes** (reply content, DB writes, thrown errors), not on mocked return values for logic under test.

---

## Project layout

| Path | Purpose |
|------|---------|
| `Decluttered Attempt 1/commands/` | Command implementations (`data`, `execute`) |
| `Decluttered Attempt 1/utils.js` | Shared logic + Sequelize `models` |
| `Decluttered Attempt 1/enums.js` | `GAMESTATES`, `ChaosEvents`, etc. |
| `Decluttered Attempt 1/tests/commands/` | One `*.test.js` per command |
| `Decluttered Attempt 1/tests/helpers/mockInteraction.js` | `createMockInteraction()` |
| `Decluttered Attempt 1/tests/helpers/mockUtils.js` | Fake row factories + model mocks |
| `Decluttered Attempt 1/tests/helpers/mockDiscord.js` | `jest.mock('discord.js')` helper |
| `Decluttered Attempt 1/jest.config.js` | `testMatch: ['**/tests/**/*.test.js']` |
| `Decluttered Attempt 1/tests/setup.js` | Sets `global.tileCache` |

Test file mirror path example:

- Command: `commands/Player Commands/board.js`
- Test: `tests/commands/Player Commands/board.test.js`

---

## Mocking rules (critical)

### Always mock

1. **`discord.js`** — keep using `mockDiscord.createDiscordMock()`.
2. **Sequelize / database** — mock `utils.models` only (via partial mock below).
3. **`canvas`** (when testing image commands) — return a minimal buffer so `GenerateGameGridImage` does not need real assets.
4. **Non-deterministic randomness** when behavior branches on it — e.g. `utils.getRandomInt` in bush/stealth paths; stub only for the test case that needs a fixed outcome.

### Do NOT mock (use real implementations)

Pure or mostly-pure utils used by commands:

- `getTileCordinatesOfLine`, `getTileCordinatesOfPath`, `inputPathToArray`, `addStartToPathArray`, `getDirection`
- `getHPAndRangePriceScaled`, `getDamagePriceScaled`, `getUpgradePrice` (when DB inputs are mocked)
- `checkGameState` — run for real; assert on `interaction.editReply` when it blocks the command
- Path/range validation that composes the above

### Partial mock pattern (preferred)

Replace full utils mock with:

```js
jest.mock('discord.js', () => require('../../helpers/mockDiscord').createDiscordMock());

jest.mock('../../../utils', () => {
  const actual = jest.requireActual('../../../utils');
  const { createMockModels } = require('../../helpers/mockUtils');
  return {
    ...actual,
    models: createMockModels(),
  };
});

const utils = require('../../../utils');
```

Then in `beforeEach`, configure only DB mocks:

```js
utils.models.Games.findByPk.mockResolvedValue(createFakeGame());
utils.models.Players.findOne.mockResolvedValue(createFakePlayer());
// etc.
```

### DB-touching utils

Functions like `getOldestGameId`, `dbLayerIDtoCommonLayerID`, `GenerateGameGridImage` query `models`. Two acceptable strategies:

1. **Integration-style (preferred for command tests):** partial mock above + set up `models.*` so the real function runs against fake rows.
2. **Spy only when setup is impractical:** `jest.spyOn(utils, 'GenerateGameGridImage').mockResolvedValue(Buffer.from('fake'))` — still keep range/path/state logic real.

Never mock `getTileCordinatesOfLine` just to force "in range" / "out of range"; set tile coordinates and player `Range_` so the real function decides.

---

## Test structure requirements

Each command test file should include:

1. **Smoke:** exports `data` and `execute`.
2. **Happy path(s):** command succeeds; assert `deferReply`, `editReply` content and/or `files`, and relevant `models.*.update` calls.
3. **Guard rails:** insufficient AP/HP, wrong game state, dead player, invalid target, out of range, wrong class, missing player/game — assert exact or substring error messages from the command.
4. **Class-specific branches:** Oracle layer sight, Twin body 2, Clockwatcher during timestop, Spy hidden on board, etc.
5. **Option permutations:** explicit `game` vs default oldest game; optional args omitted vs provided.

Use descriptive `it('...')` names: `'rejects shoot when target is out of range'`.

Use factories from `mockUtils.js`: `createFakeGame`, `createFakePlayer`, `createFakeClass`, `createFakeTile`, `createFakeLayer`, `createFakeEmptyPlaystate`.

Use `createMockInteraction({ options: { ... }, user: { id: '123' } })`.

For `findOne` / `findByPk` that serve multiple queries, use `mockImplementation(({ where }) => ...)` keyed on `where` fields.

---

## Assertion checklist

For each test case, specify and assert:

| Check | Example |
|-------|---------|
| Discord flow | `deferReply` called; `editReply` or `reply` with expected shape |
| User-facing message | `expect.stringContaining("don't have enough AP")` |
| Attachments | `files: [expect.any(Object)]` for grid commands |
| DB reads | correct model method called with expected `where` |
| DB writes | `update` called with expected field changes |
| Early return | later `update` **not** called when command should fail |
| Utils side effects | real path length, price calculation, etc. (indirectly via outcome) |

---

## Shared game-state matrix (reuse across commands)

Many commands call `checkGameState` or inline `switch (game.GAME_STATE)`. Cover applicable states per command:

| `GAMESTATE` | Typical player command behavior |
|-------------|----------------------------------|
| `ACTIVE` | allowed (if other checks pass) |
| `REGISTRATION` | blocked or special (e.g. board still shows grid) |
| `PAUSED` | blocked — dev-only message |
| `OVER` | blocked — register for new game |
| `TIMESTOPPED` | blocked except `Clockwatcher` class |

Import values from `enums.js` / `utils.GAMESTATES`; do not hardcode magic strings unless the command does.

---

## Work instructions for the LLM

When given **one command** (or one test file):

1. Read the command source in `commands/...`.
2. List every `utils.*` call and classify: **real** vs **mock DB** vs **mock external** (canvas/random).
3. Read the existing test file; delete tests that only assert defer/edit without behavior.
4. Implement the partial-mock pattern if not present.
5. Implement **every test case** listed in the command's section below (user-filled).
6. Fix broken setup (undefined variables, wrong mock shapes, `Tile_ID` vs `Tile_ID2` typos in commands).
7. Run `npm test -- --testPathPattern="<commandName>"` and fix failures.
8. Do not change command production code unless a test reveals a clear bug; if so, note it separately.

**Output:** Updated test file + short summary of cases covered and any gaps/blockers.

---

## Command test case registry

Fill in cases below. Format per case:

```
[case id] short name: setup summary → expected outcome
```

Example:

```
[shoot-03] out of range: shooter (0,0) target (5,5) Range_=3 → editReply contains "out of range", no Players.update
```

---

### Player Commands

#### `board` (`commands/Player Commands/board.js`)

**Test cases:**

```
<!-- FILL IN -->
[board-01] smoke default: registered player, ACTIVE game, no options → defer ephemeral, GenerateGameGridImage with player's current layer, reply with grid.png attachment only
[board-02] explicit game: game=2, player in game 2 → grid for game 2
[board-03] explicit layer: layer=3, ACTIVE → grid for layer 3 (common/DB path via commonOrDB=true)
[board-04] default layer non-Oracle: player on tile layer 2, no layer → auto-resolves layer from player.Tile_ID
[board-05] Twin body 2: Twin class, body=2, no layer → layer from Tile_ID_2
[board-06] Oracle no layer: Oracle class, no layer → layer stays null (Oracle branch skips tile lookup)
[board-07] TIMESTOPPED non-Clockwatcher: → "Time is stopped! only Clockwatchers can use commands at this time."
[board-08] TIMESTOPPED Clockwatcher: Clockwatcher class → grid image returned (no block)
[board-09] DEV_PAUSED / PAUSED: GAME_STATE=DEV_PAUSED → "Game is paused! only the dev can use commands..." (board uses GAMESTATES.PAUSED, which is undefined in enum — may fall through to default ACTIVE behavior unless state string matches)
[board-10] OVER: GAME_STATE=OVER → "Game has ended! only the dev can use commands... Please register for a new game."
[board-11] REGISTRATION with layer: layer provided → grid image + "Game is in registration! only the dev... Please wait for the game to start."
[board-12] REGISTRATION without layer: no layer, non-Oracle → converts DB layer via dbLayerIDtoCommonLayerID, same registration message + image
[board-13] missing player: no Players row for user+game → error catch, editReply with Error: ... (null dereference)
[board-14] missing game: invalid game id → error message via catch
[board-15] GenerateGameGridImage throws: → Error: <message> ephemeral/editReply
[board-16] aliases: command exposes playergrid, grid aliases (export smoke)

```

**Notes:** Oracle can view arbitrary layer; non-Oracle defaults to own layer; Twin `body: 2` uses `Tile_ID2` to determine the layer viewed; `REGISTRATION` still attaches grid image; timestop/pause/over messages.

---

#### `move`

**Test cases:**

```
[move-01] smoke: ACTIVE, registered, 10 AP, blank tile, east×1 → movement response, AP deducted moveCost × tiles, position updated
[move-02] missing player: no player row → "Player not found in game!, please register..."
[move-03] dead player: Dead=true → "Dead players can't use this command."
[move-04] missing tile: Tile_ID invalid → "Current tile not found! please register..."
[move-05] game paused: checkGameState true → paused message, no movement
[move-06] timestopped non-Clockwatcher: → timestop message
[move-07] insufficient AP: distance exceeds AP budget → throw "Player does not enough action points for movement requested."
[move-08] zero distance: distance=0 → minimal/no movement, low AP cost
[move-09] all directions smoke: each of west/east/north/south/northeast/northwest/southeast/southwest with distance 1 on open tile → coordinate changes correctly
[move-10] Twin body 2: Twin, body=2, move body 2 tile → uses Tile_ID_2 as origin
[move-11] Glutton cost: Glutton class → AP cost 2 × moveCost × effective tiles
[move-12] free movement: Free_Move=2, 3-tile move → free tiles reduce billable tiles
[move-13] ice end non-Snowman: path ends on Ice, no path option → "Cannot end a movement on an ice tile..."
[move-14] ice end Snowman: Snowman ending on Ice → allowed
[move-15] ice path required: starting on Ice without path → must provide valid path string
[move-16] invalid path format: malformed path → verifyinputPath throw with bounds/format message
[move-17] path off-layer: path exits bounds → "Invalid input path, make sure your path uses..."
[move-18] valid ice path: on Ice, path="right,2;down,1;" style → completes multi-segment move off ice
[move-19] explicit game: game=2 when player in game 2 → operates on that game
[move-20] default game bug path: no game option → calls getOldestGameId() without user id (throws "missing playerDiscordID" in current utils)
[move-21] wall/void non-Cloudborn: move onto Wall/Void → "cannot move onto void wall or wall damaged tiles"
[move-22] Cloudborn: Class_ID 6 onto Wall/Void → allowed (intended; note !player.Class_ID == 6 bug may invert logic)
[move-23] fire tile enter/leave: move onto/off Fire → HP reduced by fireDmg, death logic invoked
[move-24] smoke tile leave: move off Smoke → tile reverted to blank
[move-25] storm tile: move onto Storm → random surrounding move; Robot +1 HP; Stormchaser +1d4-2 AP
[move-26] trapped tile: Trapped=true with valid trapper → mine damage, trap cleared, death logic
[move-27] trapped no trapper: trapped tile, null trapper → "Mine without trapper found. Please contact snage."
[move-28] full tile: destination has 4 players → "tile is full" in partial response
[move-29] Spy class: successful move → reply deleted after 3s delay
[move-30] layer bounds clamp: move would exceed X_Bound/Y_Bound → coords clamped to max
```

---

#### `shoot`

**Test cases:**

```
[shoot-01] smoke happy path: shooter range ≥ distance, target on (x,y), enough AP, amount=1 → hit message, target HP reduced, AP deducted shootCost × amount
[shoot-02] insufficient AP: Action_Points < shootCost × amount → "You don't have enough AP to shoot that much!"
[shoot-03] game blocked: timestop/pause via checkGameState → guard message, no shot
[shoot-04] tile off board: no tile at (x,y) on layer → "That tile is not on the board!"
[shoot-05] shooter not on board: null shooter tile → "You are not on the board! Are you registered in that game?"
[shoot-06] invalid target user: unregistered Discord user → "That mention does not correspond to a player registered in that game!"
[shoot-07] target wrong tile: target registered but Tile_ID ≠ shot tile → "That player isnt on that tile!"
[shoot-08] out of range: path length − 1 > Range_ → "That tile is N tiles out of range!"
[shoot-09] multi-shot: amount=3, range OK, clear LOS → combined damage amount × Damage × (DMG_BUFF+1), AP shootCost × 3
[shoot-10] wall in path: solid Wall → updated to Wall_Damaged, shot consumed, continues if shots remain
[shoot-11] damaged wall in path: Wall_Damaged → reverted to blank, shot consumed
[shoot-12] bush shooter miss: shooter on Bush, non-Hunter, 50% roll → "You missed a ... wall..." or target miss
[shoot-13] Hunter on Bush: Hunter class → no bush miss penalty
[shoot-14] target on Bush miss: target tile Bush, non-Hunter → possible "You missed the target tile!"
[shoot-15] DMG_BUFF consumed: shooter DMG_BUFF>0 on hit → buff applied then reset to 0
[shoot-16] kill path: damage reduces HP ≤ 0 → playerDeathLogic(shooter, target) invoked
[shoot-17] Twin body 2: body=2 → uses Tile_ID_2 as shooter position for range/LOS
[shoot-18] default game: no game → getOldestGameId() without arg (may throw in current utils)
[shoot-19] missing player row: null player → catch → "An error has occured + ..."
```

---

#### `stats`

**Test cases:**

```
[stats-01] smoke self private: visible=false, no player → ephemeral defer, embed with class/stats/tile/kills, attachments
[stats-02] smoke self public: visible=true → non-ephemeral defer, public embed
[stats-03] other player: player=@other in same game → embed titled with other user's stats
[stats-04] default game: no game → getOldestGameId(interaction.user.id)
[stats-05] explicit game: game=2 → stats from game 2
[stats-06] missing player: no row for target → throws "Player not found in game! Please register..."
[stats-07] game paused/over: checkGameState true → guard message
[stats-08] Spy class: Spy → embed excludes X/Y/Layer fields
[stats-09] Twin class: Twin → adds second body layer/X/Y fields (uses Tile_ID2)
[stats-10] Pharaoh class: Pharaoh → adds Pharaoh HP field
[stats-11] Chef class: Chef → adds Meals field
[stats-12] non-Pharaoh with Pharoh_HP>0: → overflow Pharaoh HP field shown
[stats-13] Soldier/default: includes X, Y, Layer (common layer id)
[stats-14] missing tile: invalid Tile_ID → error on findByPk/embed build
```

---

#### `register`

**Test cases:**

```
[register-01] smoke happy path: REGISTRATION game, valid 80×80 PNG, not registered → registerPlayer called, "Player registered! Use the stats command..."
[register-02] default game: no game → getOldestGamestateGameId(null, REGISTRATION)
[register-03] explicit game: game=3 in REGISTRATION → registers to game 3
[register-04] game not found: invalid id / DB error → "Game not found. Please check the game ID."
[register-05] wrong phase ACTIVE: → "Cannot register for games not in registration phase."
[register-06] game full: Players.count >= playerMax → "Game is full. Please try another game."
[register-07] wrong file type: non-PNG → "The file is a ... file. Player icon must be a PNG file"
[register-08] wrong dimensions: not 80×80 → "Player icon must be exactly 80x80 pixels"
[register-09] already registered: existing row → "You are already registered in this game"
[register-10] Twin spawn collision: Twin rolled, same spawn twice after 20 tries → "Failed to generate spawnpoint for Twin..."
[register-11] registerPlayer failure mid-flight: partial DB row → cleanup destroy (except already-registered error path)
[register-12] class assignment: normal class → single spawn; Twin → two distinct spawn tiles
```

---

#### `gift`

**Test cases:**

```
[gift-01] smoke transfer: giver 5 AP, receiver room, amount=2 → receiver +2, giver −2, success message
[gift-02] default game: no game → getOldestActiveGameId(user.id)
[gift-03] dead giver: Dead=true → "Dead players can't use this command."
[gift-04] game blocked: pause/timestop → guard via checkGameState
[gift-05] insufficient AP: giver AP < amount → "You dont have that much AP to give!"
[gift-06] receiver at cap: receiver near MAX_AP, partial transfer → only fills to max; remainder logic (note: recievingPlayerDiscord typo may break remainder-to-MISSED_AP)
[gift-07] receiver missing: mention not in game → early "Player not found in game!..." (note: first check uses non-awaited findOne — may not work as intended)
[gift-08] giver missing: null giver → catch "Something went wrong!..."
[gift-09] amount=1 minimum: valid 1 AP gift → success
[gift-10] self-gift: giver mentions self → AP net zero (if allowed by DB lookups)
```

---

#### `store`

**Test cases:**

```
<!-- FILL IN -->
```

---

#### `retrieve`

**Test cases:**

```
<!-- FILL IN -->
```

---

#### `listGames`

**Test cases:**

```
<!-- FILL IN -->
```

---

#### `override`

**Test cases:**

```
<!-- FILL IN -->
```

---

#### `upgrade` (Player Commands copy if applicable)

**Test cases:**

```
<!-- FILL IN -->
```

---

#### `warp` (under Player Commands tests)

**Test cases:**

```
<!-- FILL IN -->
```

---

### Class Commands

#### `build`

**Test cases:**

```
[build-01] smoke export: module loads → data + execute defined
[build-02] happy wall: CW, 3+ AP, in-range empty non-gateway tile, wall=true, ACTIVE → tile Wall, AP −3, success message
[build-03] happy chest: CW, 3+ AP, in-range tile with occupant, wall=false, ACTIVE → tile Chest, AP −3, success message
[build-04] wrong class: non-CW player → "You are not a Construction Worker!"
[build-05] invalid tile: coords with no tile on player's layer → "Could not find tile to build on…"
[build-06] out of range: target beyond player.Range_ → "You are not in range…"
[build-07] insufficient AP: Action_Points < 3 → "You dont have enough AP…"
[build-08] gateway tile: Gateway_Open or Gateway_Locked → "You cannot build on a gateway tile!"
[build-09] wall on occupied tile: wall=true and any Player1–4 set → "There is a player on that tile!"
[build-10] game FINISHED: checkGameState blocks before mutation
[build-11] game DEV_PAUSED: blocked by checkGameState
[build-12] game TIMESTOPPED: blocked for non-Clockwatcher
[build-13] missing player/game: no player row or null game → catch/error reply
[build-14] game option: explicit game ID resolves that game instead of default
[build-15] option permutations: wall=true vs wall=false on same blank tile → Wall vs Chest
```

---

#### `burn`

**Test cases:**

```
[burn-01] smoke export: module loads → data + execute defined
[burn-02] happy path: Pyromaniac, alive, 4+ AP, in-range non-gateway tile → Fire, AP −4, username in success message
[burn-03] wrong class: non-Pyromaniac → "You are not a Pyromaniac!"
[burn-04] dead player: player.Dead=true → "Dead players can't use this command."
[burn-05] invalid tile: no tile at coords → "Could not find tile to burn…"
[burn-06] out of range → "You are not in range of the tile you want to burn!"
[burn-07] insufficient AP: < 4 → "You dont have enough AP to burn a tile!"
[burn-08] gateway tile → "You cannot burn a gateway tile!"
[burn-09] game FINISHED / DEV_PAUSED / TIMESTOPPED: blocked via checkGameState
[burn-10] missing player: not registered in game → error catch
[burn-11] game default: no game option → uses getOldestGameId(userId)
[burn-12] occupied tile allowed: tile with players still burns to Fire (no occupant check)
```

---

#### `checkTarget`

**Test cases:**

```
[checkTarget-01] smoke export: module loads → data + execute defined
[checkTarget-02] happy path: Class_ID 10, valid Hitman_Target, ACTIVE → reply with Discord mention, coords, layer, class
[checkTarget-03] wrong class: Class_ID ≠ 10 → "You are not a hitman!"
[checkTarget-04] no target: Hitman_Target null or target row missing → "No current target..."
[checkTarget-05] game FINISHED / DEV_PAUSED / TIMESTOPPED: blocked via checkGameState
[checkTarget-06] missing player: caller not in game → error catch
[checkTarget-07] game option: explicit game ID used for lookup
[checkTarget-08] dead hitman: no dead check in code → still returns target info if class matches
```

---

#### `conjure`

**Test cases:**

```
[conjure-01] smoke export: module loads → data + execute defined
[conjure-02] happy path: Druid, alive, 4+ AP, in-range non-gateway tile → Storm, AP −4
[conjure-03] wrong class → "You are not a Druid!"
[conjure-04] dead player → "Dead players can't use this command."
[conjure-05] invalid tile → "Could not find tile to conjure a storm on…"
[conjure-06] out of range → "You are not in range…"
[conjure-07] insufficient AP → "You dont have enough AP to conjure a storm on a tile!"
[conjure-08] gateway tile → "You cannot conjure a storm on a gateway tile!"
[conjure-09] game state guards: FINISHED / DEV_PAUSED / TIMESTOPPED blocked
[conjure-10] game default: uses getOldestActiveGameId(userId)
[conjure-11] occupied tile: still converts to Storm (no empty-tile check)
```

---

#### `cook`

**Test cases:**

```
[cook-01] smoke export: module loads → data + execute defined
[cook-02] happy path: Chef, Meals > 0, customer on tile at (x,y), in range, ACTIVE → customer +2 AP & +1 HP, chef +1 AP & Meals −1
[cook-03] wrong class: non-Chef → "You are not a Chef!"
[cook-04] no meals: Meals <= 0 → "You don't have enough ingriedients for a meal!…"
[cook-05] customer wrong tile: customer.Tile_ID != customersTile.Tile_ID → "The customer is not on the tile provided!"
[cook-06] out of range → "Your customer is not in range!"
[cook-07] customer not in game: null customer row → "The customer is not in the game!" (check order: runs after tile/range checks)
[cook-08] caller not in game → "You are not in the game!"
[cook-09] game state guards: FINISHED / DEV_PAUSED / TIMESTOPPED blocked
[cook-10] missing game load: game variable undefined before checkGameState → expect runtime error (implementation bug)
[cook-11] option permutations: different customer + matching (x,y) vs mismatched coords
```

---

#### `deliver`

**Test cases:**

```
[deliver-01] smoke export: module loads → data + execute defined
[deliver-02] happy path: Mailman, sufficient AP, valid receiver, ACTIVE → receiver +amount AP, sender −amount AP, success message
[deliver-03] wrong class → "You are not a Mailman!"
[deliver-04] receiver not in game → "The receiver is not in the game!"
[deliver-05] insufficient AP → "You dont have enough AP to deliver!"
[deliver-06] amount=1 minimum: transfer exactly 1 AP
[deliver-07] amount=max AP: transfer all remaining AP
[deliver-08] game state guards: FINISHED / DEV_PAUSED / TIMESTOPPED blocked
[deliver-09] missing player/game: undefined game before state check → runtime error (bug)
[deliver-10] self-deliver: receiver = self → AP unchanged net (still passes guards if AP sufficient)
[deliver-11] dead player: no dead check → still allowed by current code
```

---

#### `dig`

**Test cases:**

```
[dig-01] smoke export: module loads → data + execute defined
[dig-02] happy path: Gravedigger, 4+ AP, empty in-range non-gateway tile → Void, AP −4
[dig-03] wrong class → "You are not a Gravedigger!"
[dig-04] invalid tile → "Could not find tile to dig…"
[dig-05] occupied tile: any Player slot set → "There is a player on this tile!"
[dig-06] out of range → "You are not in range…"
[dig-07] insufficient AP → "You dont have enough AP to dig a tile!"
[dig-08] gateway tile → "You cannot dig a gateway tile!"
[dig-09] game state guards: FINISHED / DEV_PAUSED / TIMESTOPPED blocked
[dig-10] missing player: lookup uses Player_ID: discordId (bug) → expect failure/error
[dig-11] game default: gameId ?? getOldestGameId()
```

---

#### `exorcise`

**Test cases:**

```
[exorcise-01] smoke export: module loads → data + execute defined
[exorcise-02] happy tile blank: Exorcist, 4+ AP (deducts 4), in-range non-gateway tile, no player → revertTileToBlank, AP −4, blank success message
[exorcise-03] happy class removal: Exorcist, 16+ AP, player in range on tile → target class → Average, classRemoval called, AP −16 on exorcist, "removed their class!"
[exorcise-04] wrong class → "You are not a Exorcist!"
[exorcise-05] invalid tile → "Could not find tile to exorcise…"
[exorcise-06] out of range → "You are not in range…"
[exorcise-07] tile mode insufficient AP: < 3 without target → "You dont have enough AP to dig a tile!" (message says dig)
[exorcise-08] class mode insufficient AP: < 16 with target → "You dont have enough AP to remove a class!"
[exorcise-09] gateway without target → "You cannot exorcise a gateway tile!"
[exorcise-10] gateway with target player: allowed (gateway check skipped when target present)
[exorcise-11] game state guards: FINISHED / DEV_PAUSED / TIMESTOPPED blocked
[exorcise-12] option permutations: tile-only vs tile+player branches
[exorcise-13] Twin target: classRemoval strips second body (integration with utils)
[exorcise-14] invalid target user: target not in game → may still enter class branch with null targetPlayer
```

---

#### `freeze`

**Test cases:**

```
<!-- FILL IN -->
```

---

#### `heal`

**Test cases:**

```
<!-- FILL IN -->
```

---

#### `hide`

**Test cases:**

```
<!-- FILL IN -->
```

---

#### `hotPotato`

**Test cases:**

```
<!-- FILL IN -->
```

---

#### `lock`

**Test cases:**

```
<!-- FILL IN -->
```

---

#### `punish`

**Test cases:**

```
<!-- FILL IN -->
```

---

#### `resurrect`

**Test cases:**

```
<!-- FILL IN -->
```

---

#### `smoke`

**Test cases:**

```
<!-- FILL IN -->
```

---

#### `snipe`

**Test cases:**

```
<!-- FILL IN -->
```

---

#### `stab`

**Test cases:**

```
<!-- FILL IN -->
```

---

#### `swap`

**Test cases:**

```
<!-- FILL IN -->
```

---

#### `timestop`

**Test cases:**

```
<!-- FILL IN -->
```

---

#### `trap`

**Test cases:**

```
<!-- FILL IN -->
```

---

#### `upgrade` (Class Commands)

**Test cases:**

```
<!-- FILL IN -->
```

---

#### `weaponize`

**Test cases:**

```
<!-- FILL IN -->
```

---

### Developer Commands

#### `changeGamestate`

**Test cases:**

```
<!-- FILL IN -->
```

---

#### `createGame`

**Test cases:**

```
<!-- FILL IN -->
```

---

#### `grid_dev`

**Test cases:**

```
<!-- FILL IN -->
```

---

#### `reloadCommands`

**Test cases:**

```
<!-- FILL IN -->
```

---

#### `timestop_dev`

**Test cases:**

```
<!-- FILL IN -->
```

---

## Example invocation (paste into LLM chat)

```
Refactor the board command tests using the prompt above.

Command: board
Test file: Decluttered Attempt 1/tests/commands/Player Commands/board.test.js
Command file: Decluttered Attempt 1/commands/Player Commands/board.js

Implement all test cases listed under board in the registry (I have filled them in below).

[Paste your filled-in board cases here]

Run tests and fix until green.
```

---

## Anti-patterns to avoid

- Mocking `utils.getTileCordinatesOfLine.mockReturnValue(...)` to fake range results.
- Mocking `utils.checkGameState.mockResolvedValue(false)` without testing each game state.
- Tests that only assert `deferReply` and `editReply` were called.
- Referencing undefined setup variables (e.g. `fakeClass`, `tile` in current `board.test.js`).
- Mocking the command module under test.
- Committing changes to `database/database.db` from tests.
