#!/usr/bin/env bash
# PreToolUse(Bash): bloquea `git push` si la batería completa de CI no corrió
# contra el HEAD actual. Correrla acá adentro tardaría minutos y timeoutearía el
# hook, así que el hook sólo verifica la marca que deja scripts/ci-verify.sh.
set -uo pipefail

cmd=$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("tool_input",{}).get("command",""))' 2>/dev/null) || exit 0
printf '%s' "$cmd" | grep -qE '(^|[;&|[:space:]])git([[:space:]]+-[^[:space:]]+)*[[:space:]]+push([[:space:]]|$)' || exit 0

cd "${CLAUDE_PROJECT_DIR:-$PWD}" || exit 0
head=$(git rev-parse HEAD 2>/dev/null) || exit 0
marker=$(cat .git/coda-ci-ok 2>/dev/null)

if [ "$marker" != "$head" ]; then
  echo "BLOQUEADO: los checks de CI no corrieron contra este commit ($(git rev-parse --short HEAD))." >&2
  if [ -n "$marker" ]; then
    echo "Última verificación: $(git rev-parse --short "$marker" 2>/dev/null || echo "$marker")" >&2
  else
    echo "No hay ninguna verificación previa registrada." >&2
  fi
  echo "Corré:  npm run ci:verify   (prettier · lint · check · tests api+web · build web · test:pwa)" >&2
  exit 2
fi
exit 0
