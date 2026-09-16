#!/bin/sh
#
# Promote a published image to the live bot. Runs ON the host - either by
# hand, or from the Deploy workflow's `deploy` job when a self-hosted runner
# is registered on the Mac mini. There is no SSH anywhere in that path: the
# job already runs on the machine it is deploying to.
#
# The order is the whole point, and it is the order the README describes:
# back up first and abort if that fails, pull by digest, bring compose up,
# then verify the container actually reports healthy - and roll back to the
# digest that was live before if it does not. A deploy that cannot be rolled
# back is not a deploy, so the digest that succeeded is recorded on the host.
# POSIX sh, not bash: the CI image is node:24-alpine, which has no bash at
# all, so a bash script here cannot be tested by the suite that guards it.
# `pipefail` is not POSIX either, and there is no pipeline to protect.
set -eu

# launchd starts a service with a minimal PATH that has neither Homebrew
# directory on it, so `docker` is missing from the runner even though it
# works in your own shell. This is the single most likely reason a deploy
# that works by hand fails from Actions.
PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

DIGEST="${1:-${IMAGE_DIGEST:-}}"
# Where the host keeps the things that are NOT in git: .env, the backups and
# the record of what is currently live.
DEPLOY_DIR="${LEGACY_DEPLOY_DIR:/Users/chrisanderson/Desktop/legacy-deployed}"
HEALTH_TRIES="${LEGACY_HEALTH_TRIES:-24}"   # x5s = ~2 minutes, as the README says
HEALTH_DELAY="${LEGACY_HEALTH_DELAY:-5}"
CONTAINER=discord-bot
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
COMPOSE_SRC="$SCRIPT_DIR/../docker-compose.yml"

die() { echo "deploy: $*" >&2; exit 1; }

[ -n "$DIGEST" ] || die "no image digest given (pass one as an argument, or set IMAGE_DIGEST)"
# Deploying by tag is the failure this whole pipeline exists to prevent: a tag
# can be moved, so ":v1.2.3" is not a promise about which bits run.
case "$DIGEST" in
  *@sha256:*) ;;
  *) die "refusing to deploy '$DIGEST' - deploys go by digest (...@sha256:...), never by tag" ;;
esac
[ -d "$DEPLOY_DIR" ] || die "$DEPLOY_DIR does not exist - create it and put the bot's .env in it"
[ -f "$DEPLOY_DIR/.env" ] || die "$DEPLOY_DIR/.env is missing - the bot's secrets live on the host, never in the repo"
[ -f "$COMPOSE_SRC" ] || die "no docker-compose.yml beside this script at $COMPOSE_SRC"

# The compose file is versioned in git and the secrets are not, so the file
# is copied to the host directory rather than the .env being copied to the
# checkout - a checkout is disposable and is replaced on every run.
cp "$COMPOSE_SRC" "$DEPLOY_DIR/docker-compose.yml"
cd "$DEPLOY_DIR"

# 1. BACK UP FIRST. The volume is project-scoped (legacy_legacy-db), so it is
#    read off the running container rather than guessed: an unqualified
#    `-v legacy-db:/data` silently creates a NEW empty volume and "backs up"
#    nothing.
container_volume() {
  cid=$(docker compose ps -q bot 2>/dev/null || true)
  [ -n "$cid" ] || return 0
  docker inspect --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}' "$cid"
}

VOLUME=$(container_volume)
if [ -z "$VOLUME" ]; then
  echo "deploy: no existing bot container, so there is no database to back up (first deploy)"
else
  mkdir -p backups
  STAMP=$(date +%Y%m%d%H%M%S)
  # A missing database.db fails here rather than deploying over it: at that
  # point something is wrong with the volume and a human should look.
  docker run --rm -v "$VOLUME":/data -v "$DEPLOY_DIR/backups":/backup alpine \
    cp /data/database.db "/backup/database.$STAMP.db" \
    || die "backup failed - aborting before anything touches the live bot"
  echo "deploy: backed up to backups/database.$STAMP.db"
fi

# `[ -f x ] && VAR=...` would be the obvious line here and it is a trap:
# under `set -e` a false test fails the whole list and exits the script, so a
# first deploy would stop right here.
PREVIOUS=""
if [ -f current-digest ]; then PREVIOUS=$(cat current-digest); fi

# 2. deploy by digest. compose reads IMAGE_DIGEST and refuses to start
#    without it rather than running whatever image it finds.
export IMAGE_DIGEST="$DIGEST"
docker pull "$DIGEST" || die "could not pull $DIGEST"
docker compose up -d

# 3. verify. The healthcheck reflects the Discord connection, not the
#    process: scripts/healthcheck.js only passes while events/ready.js is
#    refreshing the heartbeat, so a bot that boots and fails to log in is
#    unhealthy rather than "up".
wait_for_health() {
  # a counted while loop rather than `seq`, which is not in every base image
  i=1
  while [ "$i" -le "$HEALTH_TRIES" ]; do
    status=$(docker inspect --format '{{.State.Health.Status}}' "$CONTAINER" 2>&1) || status="no such container"
    if [ "$status" = healthy ]; then return 0; fi
    echo "deploy: $status"
    if [ "$i" -lt "$HEALTH_TRIES" ]; then sleep "$HEALTH_DELAY"; fi
    i=$((i + 1))
  done
  return 1
}

if wait_for_health; then
  printf '%s\n' "$DIGEST" > current-digest
  echo "deploy: $DIGEST is live and healthy"
  exit 0
fi

# 4. roll back. current-digest is deliberately NOT updated, so the next
#    deploy still knows which digest was last known good.
echo "deploy: never became healthy after ~$((HEALTH_TRIES * HEALTH_DELAY))s - rolling back" >&2
if [ -n "$PREVIOUS" ]; then
  export IMAGE_DIGEST="$PREVIOUS"
  docker compose up -d
  if wait_for_health; then
    echo "deploy: rolled back to $PREVIOUS" >&2
  else
    echo "deploy: ROLLBACK IS ALSO UNHEALTHY - the bot is down. Restore the newest file in $DEPLOY_DIR/backups by hand" >&2
  fi
else
  docker compose down
  echo "deploy: no previous digest recorded, so the container was stopped rather than rolled back" >&2
fi
exit 1
