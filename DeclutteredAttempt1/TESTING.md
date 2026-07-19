# Unit Testing Framework & Plan for Discord Bot Commands

This document describes the framework and plan for unit testing all slash commands in the social real-time strategy Discord bot (players spend currency/AP to attack, last standing wins; dead players vote on chaos events).

---

## 1. Repository Context

- **Commands**: Each command in `commands/*.js` exports `data` (SlashCommandBuilder) and `execute(interaction)`.
- **Execution flow**: `interactionCreate.js` looks up `interaction.client.commands.get(interaction.commandName)` and calls `command.execute(interaction)`.
- **Dependencies**: Commands depend on:
  - **utils** (`../utils`): `models`, `getOldestActiveGameId()`, `checkGameState()`, `getTileCordinatesOfLine()`, `revertTileToBlank()`, `movePlayerToTile()`, `moveFromTiletoTile()`, `playerDeathLogic()`, `getRandomInt()`, `dbLayerIDtoCommonLayerID()`, etc.
  - **Database (Sequelize)**: `models.Games`, `models.Players`, `models.Tiles`, `models.Classes`, `models.Layers` (findByPk, findOne, findAll, update).
  - **Enums**: `GAMESTATES`, `ChaosEvents` from `enums.js`.
- **Interaction usage**: Commands typically `deferReply()` then read options (`getInteger`, `getString`, `getUser`) and call `editReply()` (or sometimes `reply()` / `followUp()`).

---

## 2. Testing Strategy

- **Unit test scope**: Test each command’s `execute()` in isolation by mocking:
  - The **interaction** (Discord ChatInputCommandInteraction-like object).
  - The **utils** module (and thus all DB access and shared helpers).
- **No real DB or Discord**: Do not hit the real SQLite DB or Discord API; use Jest mocks for `utils` and, if needed, for `enums`.
- **Goals**:
  - Assert correct **interaction** usage: `deferReply`, `editReply` / `reply` / `followUp` with expected content or embeds.
  - Assert **validation paths**: e.g. “player not in game”, “not enough AP”, “game in registration”, “target not on tile”.
  - Assert **success paths**: e.g. correct final message and that no unexpected errors are thrown.

---

## 3. Test Framework Components

### 3.1 Jest Configuration

- Use the **root** `jest.config.js` (project root of “Decluttered Attempt 1”):
  - `testEnvironment: 'node'`
  - `testMatch: ['**/tests/**/*.test.js']`
  - `setupFilesAfterEnv: ['<rootDir>/tests/setup.js']`
  - `collectCoverageFrom: ['commands/**/*.js', 'utils.js', '!commands/decommissioned/**']`
- Run tests from project root: `npm test` (or `npx jest`).
- Prefer a **single** Jest config at the project root; `tests/jest.config.js` can be removed or kept only if you need a different config when running from inside `tests/`.

### 3.2 Global Setup (`tests/setup.js`)

- Set globals that commands or utils expect (e.g. `global.LAYERS`, `global.tileCache`) so that required modules don’t throw when loaded.
- Keep setup minimal; avoid starting real DB or Discord client.

### 3.3 Mocks & Helpers

| Helper | Purpose |
|--------|--------|
| `tests/helpers/mockInteraction.js` | Factory `createMockInteraction({ options, user, replied, deferred })` returning an object with `deferReply`, `reply`, `editReply`, `followUp`, `options.getInteger/getString/getUser`, `user`, `replied`, `deferred`, all Jest mocks. |
| `tests/helpers/mockUtils.js` | Factory or shared mock for `utils`: mock `models` (Games, Players, Tiles, Classes, Layers) with `findByPk`, `findOne`, `findAll`, `update` returning Jest mock implementations; mock `getOldestActiveGameId`, `checkGameState`, and any other utils used by the command under test. |

- For each test file, use `jest.mock('../../utils')` (or the correct relative path to `utils`) and then configure `utils.getOldestActiveGameId`, `utils.checkGameState`, and `utils.models` as needed for that command.
- Optionally add `tests/helpers/mockModels.js` that exports a reusable “fake” models object (e.g. with chainable `findByPk().mockResolvedValue(game)` pattern) to avoid repeating model mock setup in every test file.

---

## 4. Command Test Template

For each command file `commands/<name>.js`:

1. **Test file**: `tests/commands/<name>.test.js`.
2. **Mock utils** at the top:
   - `jest.mock('../../utils')` (adjust path so it resolves to project root `utils.js` from `tests/commands/`).
   - In `beforeEach`, set `utils.getOldestActiveGameId`, `utils.checkGameState`, and the relevant `utils.models.*` methods to return values that suit the test case (e.g. active game, player in game, tile, class).
3. **Interaction**: Use `createMockInteraction({ options: { ... }, user: { id, username } })` so that `getInteger('game')`, `getString('direction')`, `getUser('target')`, etc. return the values your test needs.
4. **Assertions**:
   - `expect(interaction.deferReply).toHaveBeenCalled()` (and optionally `toHaveBeenCalledWith()` if you use `{ ephemeral: true }` etc.).
   - For validation failures: `expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('...') }))` (e.g. “Player not found”, “not enough AP”).
   - For success: `expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.any(String) }))` or match embeds if the command uses them.
   - Ensure `reply` is not called when the command uses `deferReply` + `editReply` (unless the command intentionally uses `reply` in error paths before defer).

---

## 5. Categorization of Commands (Testing Priority & Approach)

Commands can be grouped by how much game/DB state they need and how many branches they have. This drives test data and mock complexity.

| Category | Commands | Approach |
|----------|----------|----------|
| **List/read-only** | `listGames`, `stats`, `board`, `checkTarget` | Mock `models.Games.findAll` / `findOne` / `findByPk`, `models.Players.findOne`, `models.Tiles`, `models.Classes`; mock `getOldestActiveGameId`, `checkGameState`. Test: no game, no player, active game + player, and success output. |
| **Game ID + player** | `move`, `shoot`, `store`, `retrieve`, `upgrade`, `warp`, `gift` | Same as above plus game-specific options (direction, distance, target user, coordinates). Test validation (not in game, wrong game state, not enough AP, invalid tile/target) and one success path. |
| **Class / ability** | `build`, `cook`, `deliver`, `dig`, `exorcise`, `freeze`, `heal`, `hide`, `hotPotato`, `lock`, `resurrect`, `snipe`, `swap`, `trap`, `weaponize` | Include class in mock `Players`/`Classes`; mock any class-specific utils (e.g. `revertTileToBlank`, `playerDeathLogic`). Test “wrong class” or “ability not available” and one success path. |
| **Dev / admin** | `createGame`, `changeGamestate`, `reloadCommands`, `override`, `punish`, `timestop`, `timestop_dev`, `grid_dev` | Mock permissions or dev checks if present; mock DB updates; test success and optionally “not allowed”. |
| **Registration** | `register` | Mock game state (e.g. REGISTRATION), `models.Games.findByPk`, `models.Players.findOne`/`create`; test “already registered”, “game full”, success. |
| **Misc** | `burn`, `conjure`, `smoke`, `stab` | Same pattern: mock utils + models, options, then validation and success. |

---

## 6. Implementation Plan (Order of Work)

1. **Infrastructure**
   - Ensure `tests/setup.js` exists and sets `global.LAYERS` (and `global.tileCache` if needed).
   - Add `tests/helpers/mockUtils.js` (and optionally `mockModels.js`) with reusable mock factories.
   - Extend `mockInteraction.js` if needed (e.g. `getChannel`, `getBoolean` for future commands).
   - Use a single Jest config at project root; run `npm test` from project root.

2. **Simple commands first**
   - `listGames`: mock `models.Games.findAll`; assert `deferReply` + `editReply` with a string containing game info.
   - `stats`: mock game, player, class, tile; assert `deferReply` and either `editReply` or `reply` with embeds/content; test “player not found”.
   - `board`: mock game, layers, tiles; assert image or description in reply.

3. **Core gameplay commands**
   - `move`: mock game, player, class, tiles, `checkGameState`, `getOldestActiveGameId`; test “player not found”, “not enough AP”, and one successful move (assert `editReply` content and that `models.Players.update` / `movePlayerToTile` are triggered via utils mock).
   - `shoot`: mock game, player, target player, tiles, path; test “not in game”, “not enough AP”, “target not on tile”, “out of range”, and one success.

4. **Remaining commands**
   - Add one test file per command following the same pattern: mock utils (and enums if needed), create interaction with options, run `execute(interaction)`, assert interaction calls and, where useful, that specific utils were called (e.g. `checkGameState` with expected gamestate).

5. **Coverage and CI**
   - Aim for high coverage on `commands/**` (excluding `decommissioned`); fix or document commands that are hard to test (e.g. heavy Canvas usage) with targeted mocks or integration tests later.

---

## 7. Example Test (High-Level)

See `tests/commands/listGames.test.js` for a full working example. Summary:

- **Mock `discord.js`** so that when the command is required, `SlashCommandBuilder` is a constructor (otherwise loading the command throws). Use a chainable mock that returns `this` from `setName`, `setDescription`, etc.
- **Mock `utils`** (or the path the command uses, e.g. `../../utils`) so that `utils.models.Games.findAll` (and any other used methods) are Jest mocks you can control.
- Use **`createMockInteraction({ options: {} })`** for the interaction.
- **Assert**: `deferReply` called; `editReply` (or `reply`) called with expected content. If the command uses `.then()` without returning (e.g. current `listGames`), add `await new Promise(resolve => setImmediate(resolve))` after `execute()` so the callback runs before assertions.

(Note: `listGames` currently calls `interaction.editReply(gameList)` with a string; Discord.js typically expects `editReply({ content: gameList })`. The test accepts either string or `{ content }` for flexibility.)

---

## 8. Summary

- **Framework**: Jest, node environment, mocks for `utils` and interaction; no real DB or Discord.
- **Plan**: One test file per command under `tests/commands/`; shared helpers in `tests/helpers/`; start with list/read-only commands, then move/shoot, then class-specific and dev commands.
- **Per test**: Mock utils (and models) for the scenario, build interaction with the right options, run `execute(interaction)`, assert `deferReply`/`editReply`/`reply` and optionally that the right utils were called.

This gives you a repeatable structure to add unit tests for all commands and improve coverage over time.

---

## 9. Running Tests

From the project root (**Decluttered Attempt 1**):

```bash
npm test
```

To run only command tests or a single file:

```bash
npm test -- --testPathPattern=listGames
npm test -- tests/commands
```
