FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json* ./
COPY packages/database/package.json packages/database/
COPY packages/shared/package.json packages/shared/
COPY backend/package.json backend/
RUN npm install

COPY packages/database packages/database
COPY packages/shared packages/shared
COPY backend backend

RUN npm run build:shared && npm run build:database && npm run build:backend

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production

# libvips32 is needed by sharp at runtime. The docker CLI + compose plugin are
# needed by /api/admin/git-update, which shells out to `docker compose
# restart` on the host via the mounted docker socket (see docker-compose.yml).
RUN apt-get update && apt-get install -y --no-install-recommends \
    libvips32 ca-certificates curl gnupg git \
    && install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc \
    && chmod a+r /etc/apt/keyrings/docker.asc \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian bookworm stable" \
       > /etc/apt/sources.list.d/docker.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends docker-ce-cli docker-compose-plugin \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/node_modules node_modules
COPY --from=build /app/packages packages
COPY --from=build /app/backend/dist backend/dist
COPY --from=build /app/backend/package.json backend/package.json

WORKDIR /app/backend
EXPOSE 3001
CMD ["node", "dist/index.js"]
