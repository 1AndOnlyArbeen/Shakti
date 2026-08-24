# syntax=docker/dockerfile:1.7
#
# Multi-stage build with two useful end targets:
#
#   development  — full deps + nodemon, source bind-mounted by compose
#   production   — prod deps only, non-root, no toolchain, smallest surface
#
#   docker build --target production -t tempu-backend:prod ./backend
#
# Debian slim rather than alpine: bcrypt is a native module with glibc prebuilds,
# so we avoid shipping a python3/make/g++ toolchain just to compile it on musl.

# ---------- base ----------------------------------------------------------
FROM node:22-slim AS base
ENV NODE_ENV=production \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false
WORKDIR /app
# curl is the healthcheck probe; --no-install-recommends keeps it to ~1MB.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# ---------- deps: production dependency tree only -------------------------
FROM base AS deps
COPY package*.json ./
# BuildKit cache mount: npm's cache survives between builds, so a changed
# dependency re-resolves in seconds instead of re-downloading the world.
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev

# ---------- dev-deps: adds nodemon, prettier, etc. ------------------------
FROM base AS dev-deps
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci

# ---------- development ---------------------------------------------------
FROM base AS development
ENV NODE_ENV=development
COPY --from=dev-deps /app/node_modules ./node_modules
COPY --chown=node:node . .
# multer's diskStorage does not create its destination and throws if missing.
RUN mkdir -p public/temp public/docs && chown -R node:node public
USER node
EXPOSE 8002
CMD ["npm", "run", "dev"]

# ---------- production ---------------------------------------------------
FROM base AS production
COPY --from=deps /app/node_modules ./node_modules
COPY --chown=node:node . .
RUN mkdir -p public/temp public/docs && chown -R node:node public
# Never run as root: a container escape should not land on uid 0. The node user
# is uid 1000, which also matches the host user on this machine, so bind-mounted
# files stay writable.
USER node
EXPOSE 8002
# Compose sets init: true (PID 1 reaping), so no tini needed here.
CMD ["node", "src/index.js"]
