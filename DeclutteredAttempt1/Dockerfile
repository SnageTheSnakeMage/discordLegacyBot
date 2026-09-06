# syntax=docker/dockerfile:1

# One Node version for every stage. The previous file built under
# node:20-alpine and ran under node:24-alpine3.23; the image it produced
# could not require('canvas') at all (the native binding was missing from
# both stages), so the bot could never start from it. Native addons are also
# compiled against a specific NODE_MODULE_VERSION - measured here as 115 for
# Node 20 and 137 for Node 24 - so copying them across that boundary is a
# latent failure even once the binding builds. Pinning one version removes
# both problems.
ARG NODE_VERSION=24-alpine

# ---------- deps: compile native modules once ----------
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
RUN apk add --no-cache python3 make g++ pkgconfig cairo-dev jpeg-dev pango-dev giflib-dev
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---------- test: the stage CI runs; never deployed ----------
FROM deps AS test
WORKDIR /app
COPY . .
RUN npx eslint . \
 && npm test -- --maxWorkers=2 \
 && npm run test:integration

# ---------- prod-deps: production dependency tree only ----------
FROM deps AS prod-deps
WORKDIR /app
RUN npm prune --omit=dev

# ---------- runtime ----------
FROM node:${NODE_VERSION} AS runtime
WORKDIR /app

# runtime shared libraries for canvas (not the -dev headers), plus a font -
# canvas renders no text without one
RUN apk add --no-cache cairo jpeg pango giflib pixman freetype fontconfig ttf-dejavu

# non-root user owning only what the bot must write
RUN addgroup -S bot && adduser -S bot -G bot

COPY --from=prod-deps --chown=bot:bot /app/node_modules ./node_modules
COPY --chown=bot:bot . .

# the test stage needs tests/ in the build context, so .dockerignore cannot
# exclude them - drop the test-only files from the shipped layer instead
RUN rm -rf tests jest.config.js eslint.config.js __mocks__ Dockerfile* docker-compose.yml

# the database lives on a volume; LEGACY_DB_STORAGE points into it
RUN mkdir -p /data /app/Logs /app/tiles/players && chown -R bot:bot /data /app/Logs /app/tiles
ENV LEGACY_DB_STORAGE=/data/database.db
VOLUME ["/data"]

USER bot

# healthy = the heartbeat file is fresh. ready.js refreshes it only while
# the Discord client reports Ready, so a live process with a dead gateway
# connection goes unhealthy instead of lingering.
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
  CMD node scripts/healthcheck.js

# bootstrap-db.js creates the schema and seeds Classes when the volume is
# empty, then no-ops forever after. Without it a fresh volume gives the bot
# a database with no tables. `exec` keeps node as PID 1 so it still gets
# SIGTERM on `docker stop`.
CMD ["sh", "-c", "node scripts/bootstrap-db.js && exec node index.js"]
