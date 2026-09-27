#!/bin/sh
set -e

# Applies any pending migrations against DATABASE_URL before the server
# starts, so a fresh deploy doesn't boot against an empty, table-less
# database. Safe to run on every start: a no-op once the schema is current.
# node_modules lives at /app/node_modules (hoisted, workspace-wide), not
# under the backend/ WORKDIR this script runs from.
/app/node_modules/.bin/prisma migrate deploy --schema=/app/packages/database/prisma/schema.prisma

exec node dist/index.js
