# Protocol: changing a class

Read this before adding a class, renaming one, or changing any class's
stats, colour or description.

A class is **not** just a row of data. Thirty-two of the thirty-eight class
names are hard-coded as string literals in production code, and the game
has already shipped bugs from every mistake this document exists to
prevent. The rule that matters:

> **A class name is an identifier, not a label.** Changing it is a code
> change that happens to also touch data. Changing it in the seed alone
> silently disables the class.

---

## The four sources that must agree

| # | Source | What it holds | Who updates it |
|---|---|---|---|
| 1 | `database/seed/classes.csv` | The 38 class rows a fresh install gets | You, in the PR |
| 2 | `database/database.db` | The live game's rows | Maintainer, by hand on the host |
| 3 | The [class sheet](https://docs.google.com/spreadsheets/d/1-Wn2_q8c1k2TmlVb-KDunRGIuzC5yuqH3L4XcIIy4G4/edit) | What players read | Maintainer, in Google Sheets |
| 4 | Production code | Behaviour keyed off names and ids | You, in the PR |

**Only (1) and (4) are in the repo.** A PR that changes a class is not
finished when CI is green — it is finished when the maintainer has applied
the same change to (2) and (3). Say so explicitly in the PR description.

The seed is not authoritative over the live database. `bootstrap-db.js`
seeds `Classes` **only when the table is empty**, so on an existing volume
a seed edit changes nothing. An existing game needs a manual `UPDATE`.

---

## Before you touch anything: the four checks

Run these first. They take a minute and they are how you find out what a
change actually costs.

```bash
cd DeclutteredAttempt1

# 1. Is this class name matched anywhere in production code?
grep -rn "'<ClassName>'\|\"<ClassName>\"" --include=*.js commands/ utils.js events/ index.js | grep -v '\.test\.'

# 2. Is its Class_ID hard-coded anywhere?
grep -rn "Class_ID *[!=]==\? *[0-9]" --include=*.js commands/ utils.js | grep -v '\.test\.'

# 3. Which tests name it?
grep -rln "<ClassName>" tests/

# 4. Does it need a Players column that does not exist yet?
python3 -c "import sqlite3;print([d[1] for d in sqlite3.connect('database/database.db').execute('PRAGMA table_info(Players)')])"
```

---

## Where classes are wired into the code

This is the real list, current as of this document. **Re-derive it with the
greps above rather than trusting this table** — it goes stale.

### Class-name gates in commands

Every class command rejects anyone whose `Class_Name` does not match a
literal. Renaming the class without editing its command means **the class
is locked out of its own ability**:

| Class | File | What breaks if missed |
|---|---|---|
| Pyromainiac | `commands/Class Commands/burn.logic.js:68` | `/burn` rejects every Pyromainiac |
| Chef | `cook.logic.js:77` | `/cook` unusable |
| Hunter | `hide.logic.js:78` | `/hide` unusable |
| Gravedigger | `dig.logic.js:72` | `/dig` unusable |
| Exorcist | `exorcise.logic.js:83` | `/exorcise` unusable |
| Necromancer | `resurrect.logic.js:98` | `/resurrect` unusable |
| Medium | `override.logic.js:55` | `/override` unusable |
| Oracle | `board.logic.js:57` | Oracle loses all-layer sight |
| Clockwatcher | `gift.logic.js:51` | Timestop exemption lost |
| Glutton | `move.logic.js:476` | Double move cost not applied |
| Spy | `move.logic.js:540` | Move reply stops auto-deleting |
| Twin / Pharoh / Chef | `stats.logic.js:80,151,159,162` | `/stats` shows the wrong panel |

Plus `Doctor`, `Snowman`, `Guardian`, `Druid`, `Smoker`, `Minesweeper`,
`Blacksmith`, `Switchmate`, `Mailman`, `Hot Potato`, `Sniper`, `Fencer`,
`Construction Worker`, `Dimensional Hopper`, `Cloudborn`, `Lava Diver`,
`Immutable`, `Cannibal`, `Hitman` in their own command files.

### Class logic in `utils.js`

| Lines | Function | Classes |
|---|---|---|
| `82–88` | AP distribution lookups | Lava Diver, Glutton, Immutable, Chef, Hitman, Pyromainiac, Snowman |
| `330–385` | `classRemoval` | Average, Twin, Cloudborn, Hitman, Pharoh, Robot, Minesweeper, Medium, Glutton, Hoarder, Protagonist |
| `534` | registration | Twin |
| `758` | `getRandomClass` | Average (never rolled) |
| `1094–1097` | kill credit | Twin, Hitman, Cannibal, Minesweeper |
| `1123–1190` | `playerDeathLogic` | Twin, Hitman, Cannibal, Minesweeper |
| `1328–1350` | `hotPotatoSwap` | Twin, Hitman, Protagonist, Glutton, Robot, Cannibal |

**`hotPotatoSwap` is the one people forget.** `/hotPotato` swaps classes,
so any class with state in a `Players` column needs a case here to move
that state. Without one the swap returns `undefined` and the player sees a
literal `undefined` in the reply.

### Hard-coded `Class_ID`

- `commands/Class Commands/checkTarget.logic.js:49` — bare `player.Class_ID != 10` (Hitman)
- `commands/Player Commands/move.logic.js:94–97` — `CLOUDBORN_CLASS_ID = 6`,
  `ROBOT_CLASS_ID = 19`, `STORMCHASER_CLASS_ID = 15`, used at lines 306, 310
  and 320

So **Cloudborn (6), Hitman (10), Stormchaser (15) and Robot (19) have
load-bearing ids.** Named constants make them greppable but no less
fragile: change one of those four ids and the class silently loses its
terrain rules or its storm bonus, with no error anywhere.

**Ids are load-bearing.** Never renumber an existing class: `Players.Class_ID`
is a foreign key, so renumbering silently reassigns every living player's
class. New classes take the next free id.

### Class-specific `Players` columns

`Hitman_Target`, `Pharoh_HP`, `Meals` (Chef), `cCOverides` (Medium),
`Tile_ID2` / `Health_Points2` / `Damage2` / `Range2` / `Free_Move2` (Twin).

A new class needing persistent state needs a new column — which means a
migration, because `sequelize.sync()` creates missing *tables* but never
alters existing ones. An existing game will not gain the column on its own.

---

## Procedure: changing an existing class's stats, colour or description

The safe case. No code changes needed.

1. Edit the row in `database/seed/classes.csv`. Keep the `id` unchanged.
2. `npx jest tests/bootstrapSeed.test.js` — catches malformed rows,
   non-numeric stats, bad colours.
3. Seed a scratch database and eyeball the row:
   ```bash
   rm -rf /tmp/seedchk && mkdir -p /tmp/seedchk
   LEGACY_DB_STORAGE=/tmp/seedchk/d.db LEGACY_DB_LOGGING=0 node scripts/bootstrap-db.js
   sqlite3 /tmp/seedchk/d.db "select * from Classes where Class_Name='<ClassName>'"
   ```
4. `npx jest && npx eslint .`
5. In the PR, give the maintainer the exact `UPDATE` for the live database
   and the matching sheet edit.

**Watch for:** a stat change that contradicts the class's own description
(`Robot` says "increased max HP" — its `max_hp` must stay above 12), and a
`range` of 0, which means the class cannot reach any tile at all.

---

## Procedure: renaming a class

The dangerous case. **This is a code change.**

1. Run check 1 and check 3 above. Every hit is a required edit.
2. Rename in `database/seed/classes.csv` — the `class` column **and** any
   occurrence inside its own `description`.
3. Rename every production-code literal the grep found.
4. Rename in the tests the grep found, plus
   `tests/integration/helpers/seed.js` (`CORE_CLASSES`) and
   `tests/bootstrapSeed.test.js` if the name is in its list.
5. Check player-visible copy that embeds the name: slash-command
   descriptions in `<command>.js`, embed field labels in `stats.logic.js`.
6. Confirm nothing is left:
   ```bash
   grep -rn "<OldName>" --include=*.js --include=*.csv . | grep -v node_modules | grep -v __mocks__
   ```
7. `npx jest && npx eslint .`
8. Seed a scratch database and confirm the new name is present and the old
   one is gone.
9. Give the maintainer the `UPDATE Classes SET Class_Name=...` for the live
   database. **A live game is broken between the code deploying and that
   UPDATE running** — the code will look for a name the database does not
   have yet. Deploy and update together, or during a quiet period.

> The tests will not always save you. A test that fakes
> `Class_Name: 'NewName'` and asserts the command succeeds passes whether
> or not the seed has that name — the fake and the code agree, and the seed
> is never consulted. The scratch-database step in (8) is what actually
> checks the seed.

---

## Procedure: adding a new class

1. **Pick the next free id.** Never reuse a retired class's id — old
   `Players` rows may still point at it.
2. Add the row to `database/seed/classes.csv`. Every stat must be a number;
   `range` must be at least 1; `color` is six hex digits.
3. Decide whether it needs persistent state. If yes, add the `Players`
   column to `database/Models/Players.js` **and** write the migration for
   the live database — `sequelize.sync()` will not add it to an existing
   one.
4. If it has a command, follow the parse/run/present split in `TESTING.md`:
   `<name>.js` (thin adapter) + `<name>.logic.js` (no discord.js import),
   with tests. `_messages.js` needs wording for any new rejection code.
5. Wire it into every `utils.js` site that needs it — at minimum ask:
   - Does `classRemoval` need to undo its state?
   - Does `hotPotatoSwap` need to move its state?
   - Does `playerDeathLogic` need a kill-credit case?
   - Does AP distribution treat it specially?
6. Add it to `CORE_CLASSES` in `tests/integration/helpers/seed.js` if
   anything looks it up by name.
7. Update the count assertion in `tests/bootstrapSeed.test.js` (it pins 38).
8. `npx jest && npx eslint .`, then seed a scratch database and confirm the
   new row.
9. Tell the maintainer: the `INSERT` for the live database, any migration,
   and the new sheet row.

**Note on the player cap.** The README says two of each class, so the cap
is `2 × class count`. Adding a class raises it. `game.playerMax` is checked
in `register.js` but **is not a `Games` column**, so the full-game gate
never fires — see the quirks doc. Do not assume it enforces anything.

---

## Pre-merge checklist

- [ ] `classes.csv` edited; ids unchanged for existing classes
- [ ] `npx jest` green, `npx eslint .` reports 0 errors
- [ ] Scratch database seeded and the changed rows inspected
- [ ] For a rename: zero grep hits for the old name outside `node_modules`
- [ ] For a new class: `classRemoval`, `hotPotatoSwap`, `playerDeathLogic`
      and AP distribution each considered and the decision written down
- [ ] Any new `Players` column has a migration, not just a model edit
- [ ] PR description tells the maintainer exactly what to run against the
      live database and what to change in the sheet

---

## Known drift

These differences between the sheet and the database are outstanding and
deliberate, not oversights. Re-check them when touching a class:

- **Speedster** and **Bully** exist in the sheet with no `Classes` row —
  they cannot be rolled.
- **Druid**: sheet says 3AP to conjure, database says 5AP.
- **Construction Worker**: sheet says 2AP to build, database says 3AP.

Players read the sheet. Where these disagree, someone is being misled.
