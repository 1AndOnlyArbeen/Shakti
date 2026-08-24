# syntax=docker/dockerfile:1.7
#
# Two targets:
#   development — vite dev server with HMR, source bind-mounted by compose
#   production  — static build served by nginx, which also proxies /api to the
#                 backend so the bundle stays host-agnostic (.env.production
#                 already uses a relative /api/v1 base)

# ---------- deps ----------------------------------------------------------
FROM node:22-slim AS deps
WORKDIR /app
ENV NPM_CONFIG_UPDATE_NOTIFIER=false NPM_CONFIG_FUND=false
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

# ---------- development ---------------------------------------------------
FROM node:22-slim AS development
WORKDIR /app
ENV NODE_ENV=development
# --chown matters: node_modules is an anonymous volume in compose, and Docker
# seeds that volume from the image WITH its ownership. Left as root, vite could
# not create node_modules/.vite and crashed with EACCES on dep optimization.
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node . .
USER node
EXPOSE 5173
# --host binds 0.0.0.0; without it vite listens on loopback inside the container
# and the published port answers nothing.
CMD ["npx", "vite", "--host", "0.0.0.0", "--port", "5173"]

# ---------- build ---------------------------------------------------------
FROM node:22-slim AS build
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Vite inlines VITE_* at build time, so this is a build arg, not a runtime env.
# Default is the relative base from .env.production — nginx proxies it.
ARG VITE_API_URL=/api/v1
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# ---------- production ---------------------------------------------------
FROM nginx:1.27-alpine AS production
# /etc/nginx/templates/*.template is rendered through envsubst by the official
# entrypoint at startup, which is how the backend upstream becomes a runtime
# setting instead of something baked into the image.
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
# Restrict substitution to this one variable so nginx's $host, $uri and friends
# are not blanked out by envsubst.
ENV NGINX_ENVSUBST_FILTER=BACKEND_UPSTREAM \
    BACKEND_UPSTREAM=backend:8002
EXPOSE 80
# 127.0.0.1, not localhost: nginx listens on IPv4 only here, and localhost
# resolves to ::1 first inside this image — the probe got connection-refused
# while the site was serving fine.
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
