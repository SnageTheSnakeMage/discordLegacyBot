# Quirks and strange behaviours in `cursord`

Everything below was found while converting the command layer to the
`parse`/`run`/`present` architecture and writing tests against it. Every entry
describes **`cursord` as it stands today** — the branch you are reading this on.

Two kinds of entry:

- **Broken** — the code cannot do what it says. A crash, a comparison that can
  never be true, a write that never happens. These are bugs by any reading.
- **Quirk** — the code works, but does something surprising. Some of these are
  probably intentional. None of them were changed on the test branch; they were
  written down and pinned by a test so they can't drift silently.

The `test-suite` branch (PR #93) fixes the **Broken** entries and pins the
**Quirks** exactly as they are. Nothing here has been changed on `cursord`.

---

## Table of contents

- [1. Systemic patterns](#1-systemic-patterns) — things that repeat across many commands
- [2. Commands that could never run at all](#2-commands-that-could-never-run-at-all)
- [3. Per-command oddities](#3-per-command-oddities)
- [4. Engine-level bugs in `utils.js`](#4-engine-level-bugs-in-utilsjs)
- [5. Infrastructure oddities](#5-infrastructure-oddities)

---

## 1. Systemic patterns

These are not one-off mistakes. Each one appears in a dozen or more commands,
which is why they're worth fixing at the pattern level rather than file by file.

### 1.1 `player.Class` is not a column — the class gate is a no-op or a wall

The `Players` table has `Class_ID` (an FK to `Classes`). It does **not** have a
`Class` column. But a whole family of class-gated commands is written as:

```js
if (player.Class != "Necromancer") { /* reject */ }
```

`player.Class` is always `undefined`, so `undefined != "Necromancer"` is always
true and **every caller is rejected, including actual Necromancers.** The command
is unusable by the exact class it exists for.

Affected: `/resurrect`, `/snipe`, `/cook`, `/deliver`, `/hotPotato`, `/swap`,
`/weaponize`. In `/checkTarget` the same idea appears as a loose
`player.Class_ID != 10` — a hard-coded id rather than a name lookup.

### 1.2 `utils.getOldestGameId()` called with no argument

The surviving definition of this helper throws `"missing playerDiscordID"` for a
falsy id. Roughly twenty commands call it with no argument on the default-game
path (i.e. whenever the optional `game` option is omitted). Every one of those
invocations dies — usually into a local `catch` that reports
`An error occurred: undefined`.

Affected (non-exhaustive): `/build`, `/burn`, `/dig`, `/exorcise`, `/freeze`,
`/heal`, `/hide`, `/hotPotato`, `/lock`, `/punish`, `/retrieve`, `/resurrect`,
`/shoot`, `/snipe`, `/store`, `/swap`, `/trap`, `/warp`.

Related: `/cook` calls it with no id *by design intent* but the option
description promises the caller's oldest game; `/timestop`, `/timestop_dev` and
`/override` call `utils.getOldestActiveGame`, **which does not exist at all**
(TypeError); `/register` uses the oldest REGISTRATION game across *all* players,
not the actor's.

### 1.3 `isClockwatcher` is hard-coded `false` everywhere

Every gamestate gate in the codebase is
`checkGameStateAndReply(gamestate, false, interaction)`. The middle argument is
"is this player a Clockwatcher", and it is `false` in **every single call site**.

Consequence: the Clockwatcher's entire class ability — acting during a timestop —
does not work. A `TIMESTOPPED` game blocks the Clockwatcher along with everyone
else. Most of these commands never even load the player's class row.

Affected: essentially every gated command (~28 call sites).

### 1.4 Success messages name the tile's *previous* type

The tile-transform commands read the tile row, update it via
`models.Tiles.update(...)` — which does **not** refresh the in-memory row — and
then build the success message from the stale row. So the player is always told
what the tile *was*, never what it became:

> You have made a **Blank1** tile on coordinates (2, 1) on layer 1!

Affected: `/build`, `/burn`, `/conjure`, `/dig`, `/exorcise` (tile mode),
`/freeze`, `/heal`, `/hide`, `/lock`, `/smoke`.

The wording is also inconsistent between siblings: `/burn` prefixes the username
(`snage made a ...`), `/dig`, `/freeze`, `/heal` and `/hide` do not
(`You have made a ...`).

### 1.5 Nothing can die

**This is the big one.** Every damage path in the codebase does:

```js
await models.Players.update({ Health_Points: newHP }, { where: ... });
await utils.playerDeathLogic(attacker, victimRow);   // <- stale row
```

`victimRow` still holds the **pre-damage** `Health_Points`, so the death check
always sees a healthy player. No mine, fire tile, shot, stab or snipe has ever
registered a kill. Victims are left at or below zero HP, alive, still occupying
a tile, and no attacker's `Kills` counter ever increments.

Fixing it means re-reading the row (or passing post-damage HP) at every damage
site. That is a *game-rule* change — players would start actually dying — so it
is documented and covered by a `test.failing()` in
`tests/integration/movement.test.js` rather than changed silently.

`/snipe` additionally calls `playerDeathLogic(victim, sniper)` — the arguments in
the opposite order from `/shoot`, so the sniper is passed in the victim slot.

### 1.6 No dead-player checks

Most class commands never check `player.Dead`. A dead Doctor can heal, a dead
Snowman can freeze, a dead Hunter can hide, a dead Chef can cook, a dead Mailman
can deliver, a dead Minesweeper can plant mines, a dead Clockwatcher can stop
time, a dead Switchmate can swap, a dead Necromancer can resurrect.

`/burn` is one of the few that *does* check, which is why the inconsistency is
visible.

### 1.7 A Twin's second body is invisible to everything

`Players.Tile_ID2` (the Twin's second body) is never consulted by any targeting
code. Only `Tile_ID` is compared. So a Twin's second body cannot be shot,
sniped, stabbed, punished or swapped — and `/swap` moving a Twin only moves one
of their bodies.

### 1.8 No `MAX_AP` / `MAX_HP` clamping

`/cook` (+2 AP, +1 HP to the customer, +1 AP to the chef), `/deliver`,
`/retrieve` and `/store` all write directly with no cap check. A player with
`MAX_AP: 10` can be pushed to 12.

### 1.9 Targets are looked up by `Discord_ID` with no `Game_ID` filter

`/shoot`, `/stab` and `/punish` find the target with
`Players.findOne({ where: { Discord_ID } })`. A row belonging to a *different
game* can satisfy it. (`/snipe` does filter by `Game_ID`, so even this is
inconsistent between siblings.)

### 1.10 Tile occupancy is written on only one side

Several commands update `Players.Tile_ID` without touching the destination
tile's `PlayerN` slot or vacating the old one — leaving the board's two sources
of truth disagreeing (this is issue #78). `/swap` and `/warp` both do this;
`/resurrect` does the inverse, claiming a tile slot without repointing
`Players.Tile_ID`.

### 1.11 Rejection ordering is inconsistent between siblings

Which check runs first varies command to command with no discernible rule.
`/burn` checks the missing tile before the dead check; `/conjure` does the
opposite. `/build` checks AP *before* the gamestate gate, so a broke builder in a
paused game is told about their AP. `/heal`, `/hide` and `/freeze` all report the
gamestate before a bad coordinate. `/warp` reports a missing layer before it
reports that the game is over.

All of these orderings were preserved and pinned by tests, since changing them
changes what players see.

### 1.12 Per-command `try/catch` blocks swallow crashes into a generic message

Nearly every command wraps its body in `try { ... } catch (e) { reply("An error
occurred: " + e.message) }`. That is why so many of the crashes listed here went
unnoticed for so long — they surfaced as a vague error string rather than a stack
trace. `/hide`'s version was itself buggy:
`'An error occurred: ' + error.message || 'Unknown error'` binds as
`(str + msg) || ...`, so the fallback could never render.

---

## 2. Commands that could never run at all

Each of these throws on **every single invocation**, before doing any work.

| Command | What throws |
|---|---|
| `/cook` | Reads `game.GAME_STATE` but never defines `game` — ReferenceError |
| `/deliver` | Same: gamestate check reads an undefined `game` |
| `/freeze` | Never defines `playerClass`, `playerTile`, `tileInRange` or `tileToChange` (present in the sibling `/burn`, dropped from this copy) |
| `/hide` | Same three undefined variables as `/freeze` |
| `/smoke` | `switch (game.GAMESTATES)` — no such column — over a bare `GAMESTATES` identifier the file never imports. ReferenceError on the first case |
| `/snipe` | Builds the attack path from `targetTile` on the line **above** `const targetTile = ...` — a TDZ ReferenceError |
| `/stab` | `findByPk(...).X_Position` reads a property off the un-awaited promise; plus two undeclared variables (`targetTile`, `attackPath`) |
| `/warp` | `if (!newLayer)` reads a variable declared only inside a later, narrower block |
| `/upgrade` | Three `logger.debug(...)` calls reference an undefined `logger` (the file defines `logger200`) |
| `/register` | Every helper references `logger200`, which is scoped to `execute()` — the default-game path, phase check, full-game check, the already-registered check and *the error handler itself* all crash |
| `/resurrect` | Calls `utils.commonLayerIDtoDbLayerID`, which exists only in the deleted `__mocks__/utils.js` |
| `/stats` | Calls `utils.dbLayerIDtoCommonLayerID` — same, mock-only |
| `/timestop` | Writes `GAMESTATES.TIMESTOPPED` but never imports `enums.js` |
| `/timestop_dev` | Compares against a bare `GAMESTATES` the file never imports; also reads `GAME_STATE` off an un-awaited promise |
| `/retrieve`, `/store`, `/swap`, `/hotPotato`, `/weaponize` | All call an undefined helper `deferReply(interaction)` / `deferredReply(interaction)` before any logic runs |
| `/override` | References an out-of-scope `client` for the dead-chat channel lookup |
| `/reloadCommands` | Scans `path.join(__dirname, 'commands')`, i.e. `commands/Developer Commands/commands`, which does not exist — ENOENT on the first `readdirSync` |
| `/punish` | The `/shoot` loop was copy-pasted but `amount` is declared nowhere — ReferenceError after possibly writing a `Wall_Damaged` |
| `/lock` | `Tile_Type != "Gateway_Open" \|\| Tile_Type != "Gateway_Locked"` can never be false, so every invocation replies "You cannot lock a non-gateway tile!" and all three writes below are unreachable |
| `/databaseCall` | The entire source file is commented out. It exports `{}`, so `index.js` skips it with a warning — `/call-db` was never a registered command |

---

## 3. Per-command oddities

### `/exorcise`

- Tile mode gates on **3 AP but deducts 4**, so an exorcist with exactly 3 AP
  succeeds and is written to `Action_Points: -1`.
- Class-removal mode charges its 16 AP **to the target**
  (`target.Action_Points - 16` where `Player_ID` = the target's). The exorcist
  pays nothing.
- A targeted user who isn't in the game resolves to a null target and the
  command **silently falls into tile mode**, blanking the tile and charging 4 AP.
- Range is always measured to the inputted x/y coordinates, even in
  class-removal mode. The target's actual position is never consulted.
- The gateway-tile rejection only applies when no target resolves — so class
  removal works while standing on a gateway.
- `utils.classRemoval(victim)` is called with one argument; the helper needs the
  exorcist as the second, so exorcising a Twin or a revive-holding Pharaoh
  crashes inside `utils` on `excorist.Kills`.
- The insufficient-AP message says **"dig a tile"** — copy-pasted from `/dig`.

### `/hotPotato`

- Requires 12 AP and **never deducts it**. The swap writes only `Class_ID`.
- `utils.hotPotatoSwap` returns `undefined` for classes with no special case, and
  the success line concatenates it verbatim — the player sees a trailing literal
  **`undefined`**.
- The victim's tile is looked up constrained to the actor's own layer, so a
  victim on another layer reads as "not on the tile provided" rather than out of
  range.

### `/timestop`

- **No gamestate gate at all.** Works in every state including `OVER` and
  `DEV_PAUSED`. Re-stopping an already-timestopped game just resets
  `timestopTurns` to 4.
- The 12 AP is a threshold only and is never deducted, so a Clockwatcher can
  stop time repeatedly, for free, forever.
- The AP threshold (12) and turn count (4) are hard-coded rather than read from
  the game row, while the *reported minutes* come from the game row.

### `/checkTarget`

- The success message reads `X_Position`, `Y_Position`, `Layer_ID` and `Class`
  off the target's `Players` row. **None of those are `Players` columns.** The
  player sees:

  > Target: `<@id>`  (undefined, undefined) layer: undefined, Class: undefined

  (including the double space, which is pinned byte-identically.)

### `/punish`

- The class is unimplemented (issue #84). It writes nothing and charges no AP —
  the legacy AP deduction sat *after* the loop that always threw.
- Its AP cost is a flat 4 rather than `game.shootCost`, and the
  not-enough-AP message still says "shoot".
- Reads `getInteger('body')`, an option its builder never declares.
- Out-of-range message: `That tile is 1 tiles out of range!`

### `/deliver`

- **Self-delivery nets a loss.** Both updates target the same `Player_ID`, so the
  deduct write lands last and wins.
- No range or layer check at all — a Mailman delivers to anyone, anywhere.
- Success message has no space: `You have delivered 3AP to postbox!`

### `/swap`

- **The command is free.** The description advertises 4 AP; no AP is ever checked
  or deducted.
- Only `Players.Tile_ID` moves. The `Tiles.PlayerN` occupancy slots are never
  rewritten.
- The same-tile guard requires layer, X and Y to all match, so identical
  coordinates *on a different layer* are a legal swap.
- Success line has no trailing punctuation: `You have swapped places with snage`

### `/warp`

- The required boolean is registered as `up-or-down` but read as
  `getBoolean('up?')`, which always returns `null` — so **warp always went down**
  and silently ignored the player's input.
- A misplaced closing brace put the teleport write and both success replies
  inside the non-gateway branch, so warping *from* a `Gateway_Open` tile chose a
  destination and then did nothing: no write, no reply, interaction left hanging.
- Splice-while-iterating with `for...in`: removing an index shifts the next tile
  into it and the loop moves past it, so **every other** full gateway (and every
  other wall/void/locked tile) survives the filter and can be warped onto.
- The hopper branch nests two `for...in` loops over the same array, the inner
  shadowing the outer's variable, so the whole filter pass re-runs once per
  surviving index — removing more than a single pass would and re-rolling the
  destination each time.
- The class test is loose (`player.Class_ID == hopperClass?.Class_ID`), so a
  player with a `null Class_ID` counts as a Dimensional Hopper when the class row
  is missing.
- Missing-layer wording is missing a space: `Could not find alayer below layer: 1`

### `/upgrade`

- `utils.getUpgradePrice` **never returns** its computed `returnedCost`, so
  `price` was always `undefined`: the affordability check could never be true and
  the reply said "for undefined AP".
- That helper also wraps its whole damage branch in `if (initalCost == 12)`,
  making the cost-14 and cost-16 rungs unreachable, and calls
  `getDamagePriceScaled` as a bare identifier (it's a method on `utils`).
- The confirmation flow could **never confirm**: `ButtonBuilder`/`ButtonStyle`
  were never imported and `response` was never assigned, so the inner catch
  always replied "Confirmation not received within 1 minute, cancelling..." and
  every upgrade write was dead code.
- The cost ladder advances exactly **one rung per command** however many steps
  were bought (buying 3 HP costs 4+5+7=16 but only moves `HP_COST` 4 → 5).
- At the top rung the cost stays put and the scaled formula charges an odd
  default-branch price (`HP_COST 10`, amount 1 ⇒ **37 AP**, not 10).
- Buying for body 2 checks the **body 1** stat against the cap and pays out of
  the shared columns.
- Cap messages have no space before the number (`past5!`) for range and damage,
  but do for health (`past 10!`).

### `/shoot`

- A bush-miss against an **intact** wall says "You missed a damaged wall" and the
  wall gets damaged anyway — the miss burns an extra shot instead of sparing it.
- A bush-miss on the target tile still damages the target with the remaining
  shots; it falls through to the hit.
- The full `shootCost × amount` is deducted even when every shot hits walls and
  the target is never touched.
- Wall messages put the newline *before* the exclamation mark (`...2,1\n!`) and
  the hit message has a `$` after the damage number.

### `/snipe`

- Collateral players take `1 × Damage × (DMG_BUFF+1)` but the message announces
  `amount × Damage × (DMG_BUFF+1)`. **The number written and the number said
  disagree.**
- The "zipped by" tile-type test `(Tile_Type != 'Wall' || Tile_Type !=
  'Wall_Damaged')` is a tautology, so an unoccupied wall reports *both* the wall
  line and the zip line.
- The `DMG_BUFF` reset is the last statement of the loop body, **after** the
  target-tile `break` — so it runs once per tile crossed and never on the tile
  the shot lands on.
- The sniper's own tile is the first tile of the path and is never excluded, so a
  sniper takes collateral damage from their own shot.
- Snipe pierces walls (neither damaging nor destroying consumes a shot), unlike
  `/shoot`.
- The target is named by username while collateral players are pinged with
  `<@id>`.

### `/stab`

- The write applies `min(amount × Damage × (DMG_BUFF+1) × 2, MAX_DAMAGE)` —
  doubling *inside* the cap — while the message reports
  `amount × Damage × (DMG_BUFF+1)`, neither doubled nor capped.
- A bush miss decrements `amount` *after* `requiredAP` was taken from it, so the
  Fencer pays for the missed stab and sees "You hit ... for 0$ damage".
- Cost is the raw stab count (1 AP each, not `game.shootCost`), and `amount` is
  never validated — a **negative amount heals the target and refunds AP**.
- The same-tile test compared `shootersTile.PlayerN` (a `Player_ID` FK) against
  the target's **Discord snowflake**, a comparison that never matched.

### `/retrieve` and `/store`

- An omitted `amount` is **not** defaulted to 1 despite the option description.
  It stays `null`, passes every check (`AP < null` is false), coerces to 0 in
  both writes, and renders as `You have retrieved null AP from the chest!`
- **Negative amounts pass every check** (`CHEST_AMOUNT < -3` is false) and run the
  transfer backwards.
- No dead gate, no `MAX_AP` clamp.

### `/override`

- The gate is `!player.Dead || Class_Name != "Medium"` — so only a player who is
  **both dead AND a Medium** passes, despite the message saying "Dead or Medium".
- **No gamestate gate at all:** a dead Medium can override in every state
  including `OVER`, `DEV_PAUSED` and `TIMESTOPPED`.
- The chaos council poll itself is untouched on success — only the `cCOverides`
  decrement and the `Games.overrider` write happen (issue #85).
- The poll choice is read as `getInteger('pollOption')` though the option is
  registered as `option`, so it was always `null`.

### `/register`

- The "game is full" gate compares against `game.playerMax`, **which is not a
  `Games` column**, so `count >= undefined` is always false and the gate never
  fires. A test with 999 players still registers successfully.
- The default game is the oldest `REGISTRATION` game across **all** players, not
  the actor's.
- A *fault* while looking up an existing registration counts as "not registered"
  and registration proceeds anyway.
- Icon validation runs after the game/phase/full checks, so a bad icon on a
  non-registering game reports the phase instead.
- `handleRegistrationError`'s cleanup `destroy` read `registrationData` out of
  scope and was gated on `!error.message == "..."` — a comparison that is never
  true. A dead write guarding a where-clause that could never be built.

### `/changeGamestate`

- The update wrote `GAMESTATES.gamestateNonEnum` — a literal lookup of a key that
  does not exist on the frozen enum — so every invocation wrote
  `GAME_STATE: undefined` into a not-null column **while still replying
  "has been changed to X!"**.
- The "Finished" choice's value is the mixed-case string `'Inactive'`, which is
  not `GAMESTATES.INACTIVE`.
- No existence check on the game: a `Game_ID` matching no row still reports
  success.

### `/createGame`

- `chaos-council-boolean` is declared as an **INTEGER** option but its default is
  the boolean `true` — so an omitted option writes `true` and a supplied option
  writes a number.
- `current-chaos-council-event` is documented as "defaults to null" but has
  always defaulted to the string `'BOOOORRRINNNG'`.
- The confirmation reports `models.Games.count()` taken *after* the insert (how
  many games exist) rather than the new row's `Game_ID`.
- `??` defaults mean an explicitly supplied `0` is kept rather than falling back.

### `/trap`

- No tile-type check: walls, void, fire, `Blank2` and gateways can all be
  trapped.
- No occupancy check and no already-trapped check — re-trapping silently
  overwrites the previous trapper.
- The target tile is looked up only on the player's own `Layer_ID`, so
  cross-layer trapping is impossible.
- `REGISTRATION` is **not** blocked here, unlike most other class commands.
- The player's own tile is trappable (`getTileCordinatesOfLine` includes the
  start tile, and the check is `length <= Range_`).

### `/weaponize`

- The buff **increments** `DMG_BUFF` rather than setting it, so weaponizing an
  already-buffed target stacks the multiplier.
- No default-game lookup at all: the description promises "oldest active game"
  but the code only ever read the option.
- The range check drew its line from `player.X_Position, player.Y_Position` —
  neither is a `Players` column — so it measured from `[undefined, undefined]`.
- Nothing prevents a Blacksmith buffing themselves.

### `/resurrect`

- The success write claims `Player1` on the **resurrectee's own old tile**, not
  the inputted tile, and `Players.Tile_ID` is never repointed — the revived body
  lands back where it died while the caster pays for the chosen tile.
- A layer number that does not exist silently falls back to the caster's own
  layer instead of rejecting.
- `resurrectee.Dead === 0` is a strict integer compare and `{ Dead: 0 }` is
  written back as the number `0` rather than `false`.

### `/stats`

- The Action Points field has odd legacy spacing: `current/ max/missed` — a space
  after the first slash only.
- The default game falls back to `getOldestGameId` (any state), not
  `getOldestActiveGameId` as the option description claims.
- The default switch branch shows the overflow "Pharaoh HP" field for **any**
  non-Pharaoh/Chef/Twin class with `Pharoh_HP > 0`, Spy included.
- A tile whose `Layer_ID` is absent from the game's layer list renders as
  `Layer 0`.
- Current damage displays as `Damage × (DMG_BUFF + 1)` and can **exceed** the
  displayed `MAX_DAMAGE` (e.g. `4/3`).
- Passing a raw number as an embed field value crashes discord.js v14 whenever a
  non-Pharaoh/Chef/Twin had `Pharoh_HP > 0`.

### `/smoke`

- Only `Blank1` smokes — `Blank2` is rejected with "You can only smoke blank
  tiles!" despite the wording.
- The blank-tile guard `Tile_Type != 'Blank1' || Tile_Type == 'Blank2'` has a
  second comparison that can never be true.
- Its dead gamestate switch named `GAMESTATES.FINISHED`, **a state that does not
  exist** (the real name is `OVER`).

### `/listGames`

- Zero games replies with an **empty string** as the message content.
- A null winner renders as the literal text `null`.
- A `CURR_CC_EVENT` missing from the `ChaosEvents` enum renders its description
  as the literal text `undefined`.

### `/build`

- `getBoolean('wall?')` reads an undeclared option name (the declared name is
  `wall`), so `wall` was always `null` — **the command could only ever build
  chests**, and the occupied-tile check could never fire.
- Only walls check for occupants; a chest builds straight over a player.

### `/reloadCommands`

- Modules were re-required as `./${command.data.name}.js` — the **slash name**, in
  the Developer Commands folder rather than the file's own — so `require.resolve`
  threw `MODULE_NOT_FOUND` for essentially every command, and that call sat
  *outside* the try/catch.
- `await interaction.reply(...)` ran once per command file inside the loop, so
  every file after the first threw `InteractionAlreadyReplied`.
- No allow-list of folders: every directory under `commands/` is scanned,
  including `Diagrams` and `decommissioned`.

### `/grid_dev` and `/timestop_dev`

- Both `grid_dev` options are `addStringOption`, so the game id and layer id stay
  **strings** all the way into `utils.GenerateGameGridImage`.
- `grid_dev` has no gamestate gate and no existence check on either id.
- Despite its name, `/timestop_dev` **pauses** (`DEV_PAUSED`); it never sets
  `TIMESTOPPED`.
- `/timestop_dev` has no gamestate gate, no player lookup and no class check —
  any state other than `DEV_PAUSED` becomes `DEV_PAUSED`, including `OVER` and
  `REGISTRATION`.
- Its default-game fallback takes no player id, so a dev pauses the oldest active
  game *overall* rather than one they're in.
- A non-dev caller of either command gets **no reply at all** — the handler
  returns before replying, so Discord shows "the application did not respond".
- An update that matches no rows still reports success.

### `/databaseCall`

- The entire file is commented out, so `/call-db` was never registered.
- `subcommand.setName("update-player")` has no `.setDescription()` — uncommenting
  it throws at require time.
- The builder mixes three subcommands with a top-level required string option.
  Discord rejects that, and `deploy-commands.js` sends every command in one
  `rest.put` — so registering it verbatim would have **failed the deploy of all
  ~40 commands**.
- `execute` switched on `getString('Model')` while the registered option is
  `model`, so the switch subject was always `null`.
- It never deferred or replied on any path.
- Every case body in the switch is empty. The command writes nothing.

---

## 4. Engine-level bugs in `utils.js`

These are not command bugs — they're in the shared helpers, so they affect
everything downstream.

### 4.1 Diagonal lines hang the process

`getTileCordinatesOfLine` had a sign error in its diagonal branch: it decremented
the Y iterator while computing `deltaY` with a `+`. For any diagonal line the
loop condition can never be satisfied, so **the event loop is blocked forever**.
Any command that measures range diagonally (`/shoot`, `/snipe`, `/build`,
`/burn`, `/trap`, `/lock`, `/heal`, `/hide`, `/freeze`, …) hangs the bot.

### 4.2 `getRandomInt(max)` is inclusive of `max`

It uses `Math.round`, not `Math.floor`, so it returns `max` about half as often
as the other values but genuinely returns it. Every caller that used it as an
array index — `getRandomItemInCollection`, `/warp`'s destination picker — can
index one past the end and get `undefined`.

`getRandomItemInCollection` returns `undefined` roughly 1 call in *n+1*.

### 4.3 `getRandomClass` could crash on registration

It called `findByPk(getRandomInt(count))`. On a 1-based `Classes` table
`findByPk(0)` is `null`, and the next line dereferences it — so roughly 1
registration in *(count+1)* crashed. It also assumed contiguous ids.

### 4.4 `getSpawnpointTile` lost its reroll

The reroll branch didn't return its recursive result, so a spawn attempt that
landed on a full tile returned `undefined`.

### 4.5 The `GAMESTATES` enum has gaps

`GAMESTATES.FINISHED` and `GAMESTATES.PAUSED` are referenced in code but **do not
exist** (the real names are `OVER` and `DEV_PAUSED`). `FINALE` exists but was
unhandled in the gamestate switch, so it fell through to a `throw`.

### 4.6 The Glutton stale-read double-grant

The AP distribution path reads the player row, grants AP, and then re-reads a
stale copy for the Glutton bonus — granting from the pre-update value.

### 4.7 `classRemoval` on a Twin

Removing the Twin class zeroes the second body and credits the *exorcist* a kill,
which is reasonable — but the function crashes if the second argument is omitted,
which is exactly how `/exorcise` calls it (see above).

### 4.8 Sequelize logs every query to stdout

`new Sequelize({...})` was constructed without a `logging` option, so the default
`console.log` fires for every single query in production.

### 4.9 `buildChaosCouncilPoll` bare calls

Called as a bare identifier rather than as a method on `utils`, so it throws
`ReferenceError` wherever it's invoked.

---

## 5. Infrastructure oddities

### 5.1 `node_modules` is committed to git

11,615 files of Windows-built dependencies are tracked in the repository. This is
the root cause of the test suite being unrunnable on Linux — `canvas` and other
native modules ship as prebuilt Windows binaries that will not load.

### 5.2 `.dockerignore` uses backslash paths

`docker build` fails outright on the current `.dockerignore`: backslash-separated
paths are a syntax error to the Docker daemon. **The image has never built from
this file.**

### 5.3 The Docker image shipped the test suite

The old `Dockerfile` copied everything, so `tests/`, `jest.config.js`,
`eslint.config.js` and `__mocks__/` all shipped into the production image. The
image also could not `require('canvas')` — the native binding is simply absent
from it.

### 5.4 `interactionCreate.js` logs to a hard-coded Windows path

The pino transport target was `'G:\LegacyBotDiscord\...'`. On any non-Windows
host — including every container — logging fails.

### 5.5 A `__mocks__/utils.js` diverged from the real `utils.js`

Two helpers (`commonLayerIDtoDbLayerID`, `dbLayerIDtoCommonLayerID`) existed
**only** in the mock. Production code called them, so `/resurrect` and `/stats`
crashed in production while looking fine under test. The mock has been deleted on
the test branch; dependency injection replaces it.

### 5.6 `registerPlayer` calls `logger150({...})`

A logger that was never defined at that scope.

---

## Where these are tracked

Most of the systemic patterns already have GitHub issues:

- **#78** — tile occupancy invariant written on only one side
- **#84** — the Punisher class is unimplemented
- **#85** — `/override` doesn't touch the chaos council poll
- **#74 / #75** — no test coverage / commands not testable (addressed by PR #93)

The rest of the per-command entries are pinned by tests on the `test-suite`
branch, so if any of them change, a test fails and says so.
