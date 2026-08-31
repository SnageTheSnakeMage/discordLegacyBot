# CI/CD prompt — GitHub Actions + Docker for Legacy Bot

Companion to `TESTING.md`. **Do `TESTING.md` first.** A pipeline whose test step runs a suite that cannot load produces a green check that means nothing, which is strictly worse than having no pipeline: it converts "we don't know" into "we were told it's fine".

- **Part 0** — verified current state of the build and deploy setup.
- **Part 1** — the prompt.

---

## Part 0 — Ground truth

Verified against this repo. Re-check before trusting.

### There is no CI

No `.github/` directory exists. Nothing runs on push, on pull request, or on merge. Every check in PR #92 was run by hand.

### The Dockerfile will not produce a working image

`DeclutteredAttempt1/Dockerfile` builds in one Node version and runs in another:

```dockerfile
FROM node:20-alpine AS builder
...
RUN npm ci                      # compiles canvas + sqlite3 against Node 20's ABI

FROM node:24-alpine3.23         # different major version
COPY --from=builder /app/node_modules ./node_modules
```

`canvas` and `sqlite3` are native addons. They are compiled against a specific `NODE_MODULE_VERSION`, which changes with every Node major, and a binary built for one will not load in another. Check it yourself with `docker run --rm node:20-alpine node -p process.versions.modules` and the same for `node:24-alpine` — the two numbers differ, and that is the whole bug. The bot will fail at `require('canvas')` on first start. **Pin one Node version and use it in both stages.** This is the same failure class that makes the suite unrunnable on this checkout (see `TESTING.md` Blocker 3), so it is worth understanding once and encoding in CI.

Also in that file:

- The runtime stage installs `cairo-dev jpeg-dev pango-dev giflib-dev`. Those are build-time headers. A runtime stage needs the shared libraries (`cairo`, `jpeg`, `pango`, `giflib`, and typically `pixman`, `freetype`, `fontconfig`, plus a font package or `canvas` renders no text). The comment "including dev headers for bindings" suggests this was a workaround for a load failure — which was probably the ABI mismatch above, not missing headers.
- No `USER` directive: the bot runs as root.
- No `HEALTHCHECK`, so an orchestrator cannot tell a wedged process from a healthy one.
- `COPY . .` copies the whole build context including `database/database.db`, which is committed to git.

### The database does not survive a rebuild

`docker-compose.yml` mounts `./data:/app/data`, but the SQLite file lives at `./database/database.db` — `utils.js` hard-codes `storage: './database/database.db'`. Nothing in `/app/database` is on a volume, so **every image rebuild resets every game**. This is the most damaging problem in the current setup and it is silent: the bot starts fine, with an empty board.

The fix pairs with `TESTING.md` Part 3 Step 1 — make the path configurable via `LEGACY_DB_STORAGE`, point it at a mounted volume in compose, and stop shipping `database.db` in the image.

### Other blockers to resolve before wiring a pipeline

| Issue | Why it matters for CI/CD |
|---|---|
| `database/database.db` is committed | Real game data in git history; gets baked into every image by `COPY . .` |
| Two `package.json` files (repo root and `DeclutteredAttempt1/`) with different dependency sets — root has `mysql2` + `@sequelize/mysql`, the app has `sqlite3` | Ambiguous build context and dependency graph; Dependabot and `npm audit` will report against the wrong one |
| `.dockerignore` excludes `tests` and `jest.config.js` | Tests cannot run inside the image; CI needs a dedicated stage |
| `.dockerignore` contains literal Windows paths (`G:\LegacyBotDiscord\package-lock.json`) | Dead entries; signals the file was never validated |
| No `engines` field in `package.json` | Nothing pins the Node version that CI, Docker and contributors must agree on |
| `deploy-commands.js` registers slash commands with Discord | A deploy-time side effect against a rate-limited external API — must not run on every container start or every CI run |
| Secrets in use: `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID`, `DEV_ID` | `DISCORD_TOKEN` is full control of the bot account; treat leakage as account compromise |

---

## Part 1 — The prompt

> Everything below is the prompt. Paste it together with Part 0.

### Role and objective

You are setting up CI/CD for a Node.js Discord bot that runs a persistent multi-day game with real players. Build a pipeline that is **secure** (a compromised dependency or a pull request from a stranger cannot exfiltrate the bot token or publish an image) and **reliable** (a green check means the bot actually starts, and a deploy cannot silently destroy live game state).

Two properties matter more than speed here:

1. **State is irreplaceable.** The SQLite database holds an in-progress multi-day game. A deploy that resets it cannot be undone.
2. **The bot token is a full account credential.** Anyone holding it can act as the bot in every guild it is in.

Optimise for those. A five-minute pipeline that cannot leak the token beats a ninety-second one that can.

### Constraints

- Do not add a hosted CI service, a container registry other than GHCR, or a cloud provider unless the maintainer asks. GitHub Actions + GHCR only.
- Do not introduce a database server. The game runs on SQLite; migrating to Postgres is a separate decision, not a CI task.
- Do not weaken a test to make the pipeline green. If tests fail, the pipeline is telling the truth.
- Every workflow file must be readable by someone who has never used GitHub Actions. Comment the non-obvious parts.

### Phase 1 — Repo hygiene (prerequisites; the pipeline is unsound without these)

1. **Stop tracking the database.** `git rm --cached DeclutteredAttempt1/database/database.db`, add it to `.gitignore`. It is in history — if it ever contained anything sensitive, treat that as already public. Ship an empty schema plus a seed script instead, and have the container create the DB on first run if the volume is empty.
2. **Pin the Node version** in one place and reference it everywhere: `"engines": { "node": ">=20 <21" }` in `DeclutteredAttempt1/package.json`, plus a `.nvmrc`. The same version goes in both Docker stages and in `setup-node`. Pick the version currently in the runtime image's LTS line and stay on it.
3. **Decide what the repo root is.** Either make `DeclutteredAttempt1/` the only Node project (delete the root `package.json`) or declare an npm workspace. Do not leave two unrelated dependency graphs; every dependency tool will pick the wrong one.
4. **Rewrite `.dockerignore`.** Remove the Windows absolute paths. Keep excluding `node_modules`, `.git`, `.env`, `*.log`, `database/database.db`. **Stop excluding `tests` and `jest.config.js`** — a test stage needs them, and the final stage will not copy them anyway.
5. **Make the DB path configurable** — `process.env.LEGACY_DB_STORAGE` as described in `TESTING.md` Part 3 Step 1. Everything else in this document assumes it.

### Phase 2 — Rebuild the Dockerfile

Requirements:

- **One Node version across all stages.** Declare it once: `ARG NODE_VERSION=20.x.y` and use `FROM node:${NODE_VERSION}-alpine` in every stage. This is the ABI fix from Part 0.
- **Three stages:**
  - `deps` — build toolchain (`python3 make g++ pkgconfig` plus `cairo-dev jpeg-dev pango-dev giflib-dev`), `npm ci`, compiles the native addons.
  - `test` — copies `deps` output plus the full source, runs `npm run lint` (if present), `npm test` and `npm run test:integration`. CI targets this stage. It is never deployed.
  - `runtime` — runtime shared libraries only (`cairo jpeg pango giflib pixman` plus `ttf-dejavu` or another font package, since `canvas` silently renders no text without one), then production dependencies and application source.
- **Production dependencies only in the final stage.** Run `npm ci --omit=dev` in a separate stage, or prune. Jest and its tree do not belong in a deployed image.
- **Non-root.** Create a user, `chown` the app and data directories, `USER` before `CMD`. The container writes only to the database volume.
- **`HEALTHCHECK`** that proves the bot is actually connected, not merely that the process exists. Have the bot write a heartbeat file (or expose a tiny HTTP endpoint) on `ClientReady` and refresh it on an interval; the healthcheck asserts freshness. A `pgrep node` healthcheck is worse than none — it reports healthy while the bot sits disconnected.
- **Deterministic installs.** `npm ci` only, never `npm install`. The lockfile is the contract.
- **No secrets in build args or `ENV`.** Build args land in image metadata and are readable by anyone who can pull the image.
- **Order layers by change frequency**: package files and `npm ci` before `COPY . .`, so source edits don't recompile `canvas` (a slow build).

Update `docker-compose.yml` alongside it:

- Mount a named volume at the database directory and set `LEGACY_DB_STORAGE` to a path inside it. **Verify by rebuilding twice and confirming game state survives.** This is the single most important acceptance test in this document.
- Keep `restart: unless-stopped`.
- Add `logging` with rotation limits; `combined.log` is already in the repo and unbounded logs fill disks.
- Keep secrets in `.env`, out of git, referenced by `env_file`.

### Phase 3 — The CI workflow (`.github/workflows/ci.yml`)

Triggers: `pull_request`, and `push` to the default branch and `cursord`.

```yaml
permissions:
  contents: read          # nothing else; add per-job only where needed
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
```

Jobs:

1. **`lint`** — add ESLint if absent. Configure it to catch this codebase's actual failure modes, which are not stylistic:
   - `no-undef` with `"env": {"node": true}` — this catches the leaked globals (`playersInTile`, `diver`, `killerClass`) that PR #92 fixed, and would have caught `game` being undefined in `cook.js`.
   - `require-await`, `no-return-await`, `no-async-promise-executor`, and `eslint-plugin-promise`'s `promise/catch-or-return` plus `promise/always-return` — this is issue #68 encoded as lint rules, so the class of bug cannot come back. Note that the rule people reach for first, `no-floating-promises`, needs type information and is therefore unavailable on plain JS; the closest practical substitute is `promise/catch-or-return`, or adopting `// @ts-check` with JSDoc types on `utils.js` so typed linting becomes possible later.
   - `no-unused-vars`.
   Run it non-blocking for one week to size the backlog, then make it required.
2. **`unit`** — `setup-node` with `cache: npm`, `npm ci`, `npm test`. Upload coverage as an artifact.
3. **`integration`** — `npm run test:integration`. No secrets, no network.
4. **`build`** — `docker build --target test` so the image build and the tests inside it are both proven. Do **not** push on pull requests.
5. **`smoke`** — start the runtime image with a dummy `DISCORD_TOKEN` and assert it gets as far as attempting a Discord login rather than crashing on a missing native module. This is what would have caught the ABI mismatch. Assert on the specific expected failure (invalid token), not merely a non-zero exit.

Matrix: none needed. One Node version, one platform — matching production exactly is worth more here than breadth.

### Phase 4 — Security requirements (all mandatory)

**Workflow permissions.** Set `permissions: contents: read` at the top of every workflow and grant more only on the specific job that needs it (`packages: write` on the publish job alone). The default token is far broader than any job here needs.

**Never use `pull_request_target` on this repo.** It runs with a writable token and repository secrets in the context of a fork's code. There is no job here that needs it. If a future one seems to, that is the moment to ask rather than to copy a snippet.

**Fork pull requests must not see secrets.** Actions withholds them by default — keep it that way. That means no job triggered by `pull_request` may require `DISCORD_TOKEN`. If a test needs a token, that test is misdesigned; see `TESTING.md`.

**Pin every third-party action to a full commit SHA**, not a tag: `uses: actions/checkout@<40-char-sha>  # v4.x.y`. Tags are mutable and are a known supply-chain vector. Resolve the SHAs yourself when you write the workflow — do not copy SHAs out of this document or any other, since an unverified SHA is worse than a tag.

**`npm ci`, never `npm install`, in CI.** Fail the build if the lockfile is out of date rather than silently resolving new versions.

**Dependency scanning.** Add `.github/dependabot.yml` for `npm` and `github-actions`, weekly, grouped. Run `npm audit --audit-level=high` in CI — advisory at first, blocking once the existing backlog is cleared. `canvas` and `sqlite3` pull large native trees; expect noise and triage it rather than muting it.

**Image scanning.** Scan the built image with Trivy (or equivalent) for HIGH/CRITICAL OS and library CVEs before publish. Upload SARIF to code scanning so results land in the Security tab instead of scrolling past in logs.

**Secrets policy.**
- `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID`, `DEV_ID` live in GitHub Environment secrets on a `production` environment with a required reviewer, not in repository secrets. That gates deploys behind a human.
- Never `echo` a secret, never pass one as a build arg, never write one into an image layer.
- Document a rotation procedure: regenerate in the Discord developer portal, update the environment secret, redeploy. If the token ever reaches a log, rotate immediately — masking is not containment.
- Add a secret-scanning step (gitleaks or GitHub's own) so a token cannot be committed silently. Given `.env` handling here and a committed `database.db`, assume this will fire at least once.

**Registry.** Publish to GHCR with the job-scoped `GITHUB_TOKEN` and `packages: write`. Do not create a long-lived personal access token for this. Enable build provenance/attestation and SBOM generation in `docker/build-push-action` so a published image can be traced to the commit that produced it.

**Branch protection** on the default branch: require the `lint`, `unit`, `integration` and `build` checks, require a pull request, disallow force pushes. CI is advisory until this is on.

### Phase 5 — CD (`.github/workflows/deploy.yml`)

Deploy is where this project can lose real player data, so it is deliberately conservative.

- **Trigger on tags, not on merge.** `on: push: tags: ['v*']`. Merging to the default branch builds and publishes an image; promoting it to the live bot is a separate, deliberate act.
- **Require the `production` environment** with a reviewer. One human confirmation before a running game is touched.
- **Back up before deploying.** The first deploy step copies the SQLite file out of the volume to a timestamped artifact. Fail the deploy if the backup fails. Test the restore path at least once by hand — an untested backup is not a backup.
- **Deploy by digest, not by tag.** `image: ghcr.io/...@sha256:...`. Tags move; digests don't, and this is what makes rollback exact.
- **Slash-command registration is its own step**, run only when a command's `data` has actually changed. Discord rate-limits global command registration; do not run `deploy-commands.js` on every container start. A separate manually-triggered `workflow_dispatch` job is the right shape.
- **Verify after deploy.** Poll the healthcheck for up to N seconds; if it does not go healthy, roll back to the previous digest automatically and report failure. A deploy that leaves the bot down is worse than one that never started.
- **Announce nothing to players from CI.** No webhook posting into the game's guild from a workflow.

### Acceptance criteria

The pipeline is done when all of these hold:

1. A pull request from a fork runs lint, unit, integration and build, and has access to **no** secrets. Verify by adding a step that prints `${{ secrets.DISCORD_TOKEN == '' }}` on a fork PR — it must print `true`.
2. `docker build --target runtime` produces an image that starts, loads `canvas` and `sqlite3` without an ABI error, and reaches a Discord login attempt.
3. `docker compose up`, play a turn, `docker compose down`, rebuild the image, `docker compose up` — **the game state is still there.** Do this manually before calling the work complete.
4. The container runs as a non-root user (`docker inspect` confirms) and its healthcheck reports unhealthy when the bot is disconnected but the process is alive. Test by revoking the token.
5. Every `uses:` in every workflow is a 40-character SHA.
6. No workflow grants more than `contents: read` except the publish job (`packages: write`) and any job using OIDC (`id-token: write`).
7. A published image can be traced back to its commit via its attestation.
8. Deploying a bad image and rolling back has been rehearsed once, on a test guild, with a copy of the database.

### Review checklist for the resulting PR

- [ ] Same Node version in `.nvmrc`, `engines`, every Dockerfile stage, and `setup-node`
- [ ] `npm ci` everywhere; no `npm install` in any workflow or Dockerfile
- [ ] No secret referenced by any job reachable from `pull_request`
- [ ] No `pull_request_target` anywhere
- [ ] Final image contains no dev dependencies, no `tests/`, no `.env`, no `database.db`
- [ ] Database volume verified across a rebuild (criterion 3 above), by hand
- [ ] Backup step runs before any deploy step and its failure aborts the deploy
- [ ] `deploy-commands.js` is not invoked on container start
- [ ] Healthcheck reflects Discord connectivity, not process liveness
- [ ] Rollback path documented in `README.md` and rehearsed once

### What to report back rather than guess

Ask the maintainer instead of choosing for them:

- Where the bot is hosted today, and whether the deploy target is reachable from GitHub Actions (this decides between SSH deploy, a pull-based agent like Watchtower, and manual promotion).
- Whether a staging guild exists for smoke-testing a real login before production.
- Whether the committed `database.db` ever held anything sensitive, which determines whether history needs rewriting rather than just untracking the file.
