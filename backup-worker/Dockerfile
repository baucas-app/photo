FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json* ./
COPY packages/database/package.json packages/database/
COPY packages/shared/package.json packages/shared/
COPY backup-worker/package.json backup-worker/
RUN npm install

COPY packages/database packages/database
COPY packages/shared packages/shared
COPY backup-worker backup-worker

RUN npm run build:shared && npm run build:database && npm run build:worker

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules node_modules
COPY --from=build /app/packages packages
COPY --from=build /app/backup-worker/dist backup-worker/dist
COPY --from=build /app/backup-worker/package.json backup-worker/package.json

WORKDIR /app/backup-worker
CMD ["node", "dist/index.js"]
