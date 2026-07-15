#!/bin/sh
# Entrypoint del runtime API/worker.
# Aplica las migraciones versionadas ANTES de arrancar — mismo orden que el
# startCommand de Render (render.yaml). Son idempotentes vía la tabla _migrations
# y no-op si DATABASE_URL no es Postgres.
# RUN_MIGRATIONS=false las delega (p. ej. docker-compose las corre en db-init
# para que API y worker no compitan aplicándolas a la vez).
set -e

if [ "${RUN_MIGRATIONS:-true}" != "false" ]; then
  node scripts/run-migrations.mjs
fi

exec "$@"
