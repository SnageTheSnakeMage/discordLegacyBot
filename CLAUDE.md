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

`DeclutteredAttempt1/TESTING.md` describes this split in full; `QUIRKS.md` at
the repo root records known broken and surprising behaviour that tests
deliberately pin.

Unit tests never touch the database. `utils.models.*` is stubbed with
`jest.spyOn`; only the integration project seeds a real schema. If a unit test
dies with `SQLITE_ERROR: no such table`, a new query needs a stub.

## Pull requests

When asked to open a PR, also watch it: subscribe to its activity, then fix CI
failures and address review comments until it is green and mergeable, without
being asked again. Report back only when something needs a decision, or when
the PR is done.
