/**
 * scripts/deploy.sh - the only thing that touches the live bot.
 *
 * It is shell, so it is tested the way shell is testable: a fake `docker`
 * earlier on PATH than the real one records every call and answers the two
 * questions the script asks it (which volume the container mounts, and
 * whether the container is healthy yet). Nothing here needs docker, a
 * daemon, or a network - the assertions are about ORDER and ROLLBACK, which
 * is the part a human cannot check by running it once and seeing it work.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'deploy.sh');
const DIGEST = 'ghcr.io/owner/repo@sha256:aaaa';
const OLD_DIGEST = 'ghcr.io/owner/repo@sha256:bbbb';

/** a `docker` that logs its arguments and answers from env knobs */
const FAKE_DOCKER = `#!/usr/bin/env bash
echo "$* | IMAGE_DIGEST=\${IMAGE_DIGEST:-}" >> "$FAKE_LOG"
case "$*" in
  "compose ps -q bot")
    printf '%s' "\${FAKE_CID:-}" ;;
  inspect*Mounts*)
    printf 'legacy_legacy-db' ;;
  inspect*Health*)
    # each call consumes one line of the health script; the default is healthy
    if [ -n "\${FAKE_HEALTH_FILE:-}" ] && [ -s "\$FAKE_HEALTH_FILE" ]; then
      head -n 1 "\$FAKE_HEALTH_FILE"
      tail -n +2 "\$FAKE_HEALTH_FILE" > "\$FAKE_HEALTH_FILE.rest"
      mv "\$FAKE_HEALTH_FILE.rest" "\$FAKE_HEALTH_FILE"
    else
      printf 'healthy'
    fi ;;
  run\\ --rm*)
    exit "\${FAKE_BACKUP_EXIT:-0}" ;;
  *) exit 0 ;;
esac
`;

/**
 * Runs deploy.sh against a throwaway deploy dir.
 * `health` is the sequence of statuses `docker inspect` reports, one per
 * poll; omit it for a container that is healthy immediately.
 */
function runDeploy({
  digest = DIGEST, env: withEnv = true, previous = null, health = null,
  backupExit = 0, cid = 'cafe1234',
} = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deploy-'));
  const binDir = path.join(dir, 'bin');
  const deployDir = path.join(dir, 'legacy-bot');
  fs.mkdirSync(binDir);
  fs.mkdirSync(deployDir);
  fs.writeFileSync(path.join(binDir, 'docker'), FAKE_DOCKER, { mode: 0o755 });
  if (withEnv) fs.writeFileSync(path.join(deployDir, '.env'), 'DISCORD_TOKEN=x\n');
  if (previous) fs.writeFileSync(path.join(deployDir, 'current-digest'), `${previous}\n`);

  const logFile = path.join(dir, 'calls.log');
  const healthFile = path.join(dir, 'health');
  if (health) fs.writeFileSync(healthFile, `${health.join('\n')}\n`);

  const result = spawnSync('bash', [SCRIPT, digest], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH}`,
      HOME: dir,
      LEGACY_DEPLOY_DIR: deployDir,
      LEGACY_HEALTH_TRIES: '3',
      LEGACY_HEALTH_DELAY: '0',
      FAKE_LOG: logFile,
      FAKE_CID: cid,
      FAKE_BACKUP_EXIT: String(backupExit),
      ...(health ? { FAKE_HEALTH_FILE: healthFile } : {}),
    },
  });

  const calls = fs.existsSync(logFile)
    ? fs.readFileSync(logFile, 'utf8').trim().split('\n').filter(Boolean) : [];
  const recorded = fs.existsSync(path.join(deployDir, 'current-digest'))
    ? fs.readFileSync(path.join(deployDir, 'current-digest'), 'utf8').trim() : null;
  return {
    code: result.status,
    out: `${result.stdout}${result.stderr}`,
    calls,
    recorded,
    deployDir,
  };
}

/** the calls that actually change the running bot, in the order they happened */
const MUTATIONS = /^(run --rm|pull|compose up|compose down)/;
const mutations = (calls) => calls
  .map((c) => (MUTATIONS.exec(c) || [])[1])
  .filter(Boolean);

describe('deploy.sh - refusing to run', () => {
  it('refuses a tag, because a tag can be moved and a digest cannot', () => {
    const { code, out, calls } = runDeploy({ digest: 'ghcr.io/owner/repo:v1.2.3' });
    expect(code).not.toBe(0);
    expect(out).toMatch(/never by tag/);
    expect(calls).toEqual([]); // and nothing was touched
  });

  it('refuses when the host has no .env, rather than starting a bot with no token', () => {
    const { code, out, calls } = runDeploy({ env: false });
    expect(code).not.toBe(0);
    expect(out).toMatch(/\.env is missing/);
    expect(calls).toEqual([]);
  });
});

describe('deploy.sh - the happy path', () => {
  it('backs up BEFORE it pulls, then brings compose up on the new digest', () => {
    const { code, calls, recorded } = runDeploy();
    expect(code).toBe(0);
    // the order is the guarantee: a pull that precedes the backup is a
    // deploy that can destroy state it never saved
    expect(mutations(calls)).toEqual(['run --rm', 'pull', 'compose up']);
    expect(calls.some((c) => c.startsWith(`pull ${DIGEST}`))).toBe(true);
    expect(calls.some((c) => c.startsWith('compose up') && c.endsWith(`IMAGE_DIGEST=${DIGEST}`))).toBe(true);
    expect(recorded).toBe(DIGEST); // so the next deploy knows what to roll back to
  });

  it('reads the volume off the container instead of guessing its name', () => {
    // compose scopes the volume to the project (legacy_legacy-db); an
    // unqualified `-v legacy-db:/data` would create a new empty one and back
    // up nothing at all
    const { calls } = runDeploy();
    const backup = calls.find((c) => c.startsWith('run --rm'));
    expect(backup).toContain('legacy_legacy-db:/data');
    expect(backup).not.toContain(' legacy-db:/data');
  });

  it('skips the backup on a first deploy, when there is no container yet', () => {
    const { code, calls } = runDeploy({ cid: '' });
    expect(code).toBe(0);
    expect(calls.some((c) => c.startsWith('run --rm'))).toBe(false);
    expect(calls.some((c) => c.startsWith('compose up'))).toBe(true);
  });

  it('aborts if the backup fails, before anything touches the live bot', () => {
    const { code, out, calls } = runDeploy({ backupExit: 1 });
    expect(code).not.toBe(0);
    expect(out).toMatch(/backup failed/);
    expect(calls.some((c) => c.startsWith('pull'))).toBe(false);
    expect(calls.some((c) => c.startsWith('compose up'))).toBe(false);
  });
});

describe('deploy.sh - rollback', () => {
  // the healthcheck reflects the Discord connection, so "unhealthy" here is
  // a bot that booted and never logged in - exactly the case a deploy must
  // not leave running
  const NEVER_HEALTHY = ['starting', 'starting', 'unhealthy'];

  it('rolls back to the digest that was live when the new one never goes healthy', () => {
    const { code, out, calls, recorded } = runDeploy({
      previous: OLD_DIGEST,
      health: [...NEVER_HEALTHY, 'healthy'], // healthy again once rolled back
    });
    expect(code).not.toBe(0);
    const ups = calls.filter((c) => c.startsWith('compose up'));
    expect(ups).toHaveLength(2);
    expect(ups[0].endsWith(`IMAGE_DIGEST=${DIGEST}`)).toBe(true);
    expect(ups[1].endsWith(`IMAGE_DIGEST=${OLD_DIGEST}`)).toBe(true);
    expect(out).toMatch(/rolled back to/);
    // and the failed digest is NOT recorded, so the next deploy still knows
    // which one was last good
    expect(recorded).toBe(OLD_DIGEST);
  });

  it('says the bot is down when the rollback is unhealthy too', () => {
    const { code, out } = runDeploy({
      previous: OLD_DIGEST,
      health: [...NEVER_HEALTHY, ...NEVER_HEALTHY],
    });
    expect(code).not.toBe(0);
    expect(out).toMatch(/ROLLBACK IS ALSO UNHEALTHY/);
    expect(out).toMatch(/backups/); // and points at the file to restore
  });

  it('stops the container when there is no previous digest to go back to', () => {
    const { code, out, calls } = runDeploy({ health: NEVER_HEALTHY });
    expect(code).not.toBe(0);
    expect(calls.some((c) => c.startsWith('compose down'))).toBe(true);
    expect(out).toMatch(/no previous digest recorded/);
  });
});
