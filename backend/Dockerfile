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

# sharp >=0.32 ships its own prebuilt libvips via the @img/sharp-* npm
# optional deps, so no system libvips package is needed. ca-certificates is
# needed for outgoing HTTPS (ml-service calls, refresh flows), git for
# simple-git's admin git-update feature. The docker CLI itself (needed to
# actually run `docker compose restart` from inside that endpoint) is
# deliberately not installed here: pulling in Docker's third-party apt repo
# made the image build fragile in CI, and the feature only applies to the
# source-clone deploy path anyway (see README "Zwei Deploy-Varianten") -
# install it yourself in a custom image if you need that button to work.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates git \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/node_modules node_modules
COPY --from=build /app/packages packages
COPY --from=build /app/backend/dist backend/dist
COPY --from=build /app/backend/package.json backend/package.json

WORKDIR /app/backend
EXPOSE 3001
CMD ["node", "dist/index.js"]
