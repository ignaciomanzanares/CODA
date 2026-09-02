#!/usr/bin/env bash
# Corre la batería completa de checks de CI y, si pasa todo, estampa el SHA de HEAD
# en .git/coda-ci-ok. El hook de PreToolUse usa esa marca para dejar pasar `git push`.
#
#   npm run ci:verify
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

fail=0
step() {
  local name="$1"; shift
  echo "──────── $name"
  if "$@"; then
    echo "✔ $name"
  else
    echo "✘ $name" >&2
    fail=1
  fi
}

# @coda/db compilado es prerequisito de `check` (apps/api importa packages/dist).
step "build @coda/db"   npm run build -w @coda/db
step "prettier"         npx prettier --check .
step "lint"             npm run lint
step "check (tsc)"      npm run check
step "tests api"        npm run test:run -w @coda/api
step "tests web"        npm run test -w @coda/web
step "build @coda/web"  npm run build -w @coda/web
step "pwa build check"  npm run test:pwa -w @coda/web

echo "════════"
if [ "$fail" -ne 0 ]; then
  rm -f .git/coda-ci-ok
  echo "CI FALLÓ — el push sigue bloqueado." >&2
  exit 1
fi

git rev-parse HEAD > .git/coda-ci-ok
echo "CI OK — verificado $(git rev-parse --short HEAD). El push está habilitado para este commit."
