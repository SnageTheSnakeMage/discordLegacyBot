# Boards

A board is one game's `Layers` rows plus every `Tiles` row hanging off them.
Before `/create-board` the only way to get one was to run
`database/tileTableHydration.sql` by hand — 630 `INSERT`s at hard-coded
`Layer_ID`s, which only ever fit the database that happened to be open.

Now a board is a text file you can draw, and `/create-board` builds it for
whichever game you name.

```
/create-board                                   -> lists the presets
/create-board preset:sandbox game:3             -> builds it
/create-board preset:sandbox game:3 replace:true -> rebuilds it
```

Dev-only, like every other command in `commands/Developer Commands/`.

---

## The file format

Presets live in `database/boards/` as `<name>.board`. The name you pass to
`/create-board` is the filename without the extension.

```
# comments are '#' plus a space
description: small two-layer sandbox board

layer Arena
.........
.~~...FF.
.~G...F..
.........
..#.+.#..
.........
..S...B..
.SS..BBG.
.........
vvvvvvvvv
layer Vault
#######
#..G..#
#.,...#
#..+..#
#...C.#
#..G..#
#######
```

**Rows and columns.** Row 1 is `Y_Position` 1, column 1 is `X_Position` 1 —
the same orientation `utils.GenerateGameGridImage` draws in, so the file
looks like the rendered board. Every row in a layer must be the same width;
the width and height become the layer's `X_Bound` and `Y_Bound`.

**Stacking.** A line of `v` characters between two layer blocks means *the
next layer is below this one*. Layers are created in file order, so the top
of the file is the top of the stack and is layer 1 to a player
(`/board layer:1`), with `Layer_Above` / `Layer_Below` chained for you.

**No implicit border.** What you draw is what you get. If you want a Void rim,
draw one (`legacy-fourlayer` does); if you want the map to run to the edge,
just don't.

### Characters

| char | tile | | char | tile |
|---|---|---|---|---|
| `.` | blank, checkerboarded | | `+` | Heal |
| `1` | Blank1 (pinned) | | `B` | Bush |
| `2` | Blank2 (pinned) | | `C` | Chest |
| `V` | Void | | `,` | Smoke |
| `#` | Wall | | `G` | Gateway_Open |
| `x` | Wall_Damaged | | `L` | Gateway_Locked |
| `~` | Ice | | `F` | Fire |
| `S` | Storm | | | |

`.` picks Blank1 or Blank2 from the tile's own coordinates, so the checker
pattern can never drift. `1` and `2` pin one explicitly — that is how the old
hand-tuned boards, which have a dozen off-pattern blanks, survive being
exported and re-imported unchanged.

Add your own character with a `legend` line before the first layer:

```
legend Z Ice
```

Those are the only 14 tile types that have a texture in `tiles/environment`;
`parseBoard` rejects anything else rather than inserting a tile the renderer
cannot draw.

Two gotchas worth knowing, both consequences of `#` being the wall character:
a comment must be `#` *plus a space* (`###` is a row of walls), and a
`#`-only divider line is map, not decoration.

---

## Shipped presets

| preset | layers | from |
|---|---|---|
| `sandbox` | 9×9, 7×7 | hand-drawn; the one to copy when starting a new board |
| `legacy-fourlayer` | 11×11, 9×9, 9×9, 8×8 | `tileTableHydration.sql` layers 1–4 |
| `legacy-threelayer` | 11×11, 9×9, 9×9 | `tileTableHydration.sql` layers 5–7 |

The two `legacy-*` presets are the playtest boards, exported tile for tile.
The SQL called a gateway `Gateway`, which is not a `Tile_Type` any code or
texture knows — the export rewrote all 16 of them to `Gateway_Open`, matching
what the live database already had.

---

## Porting a board that already exists

`scripts/export-board.js` turns a board you already have into a preset.

From the old SQL:

```bash
node scripts/export-board.js --from-sql database/tileTableHydration.sql --name legacy --stdout
```

From a database file — a downloaded production volume, say:

```bash
LEGACY_DB_STORAGE=./ProdDatabase.db node scripts/export-board.js --from-db --game 3 --name playtest
```

It writes `database/boards/<name>.board` (or prints it with `--stdout`) and
reports the layer sizes it found. Exporting a whole SQL file that holds two
boards gives you one preset with all of the layers in it; split it into two
files at the `vvv` separator you want to break at.

---

## Adding a new board

1. Copy `database/boards/sandbox.board` to `database/boards/<yours>.board`.
2. Draw it. Keep every row the same width, and separate layers with `vvv`.
3. `npx jest tests/boardPresets.test.js` — the suite parses every file in
   `database/boards/`, so a typo, a ragged row or an unknown character fails
   there rather than half way through an insert.
4. `/create-board preset:<yours> game:<id>` in Discord.

`/create-board` is a new slash command, so it needs registering once: run the
Deploy workflow with "register commands" checked (see README).

## What `/create-board` will not do

- **Build over an existing board.** A game that already has layers is
  rejected unless you pass `replace:true`.
- **Delete tiles players are standing on.** `Players.Tile_ID` points straight
  at a `Tiles` row; replacing a board under a standing player would leave
  them pointing at a deleted row, so `replace:true` is refused while anyone in
  the game has a `Tile_ID` or `Tile_ID2`.
- **Place anybody.** It builds terrain. Registration and spawning are
  unchanged.
