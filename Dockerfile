# Pinned Node 22 for a reproducible build. better-sqlite3 is a native module, so the
# runtime stage must share the base image with the stage that installed it.
FROM node:22-bookworm-slim AS base
WORKDIR /app
# Build toolchain, needed only if a prebuilt binary is unavailable for this platform.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM base AS build
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY configs ./configs
# The graph view's client assets, vendored rather than fetched from a CDN so the
# deployment depends on nothing external.
COPY static ./static
EXPOSE 3000
CMD ["node", "dist/server/index.js"]
