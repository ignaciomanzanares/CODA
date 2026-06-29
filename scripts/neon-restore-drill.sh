#!/usr/bin/env bash
# Ejercicio de restauración de Neon: crea un branch point-in-time aislado y mide el RTO real.
# NO toca producción (solo crea un branch nuevo). Ver docs/DISASTER_RECOVERY.md.
# Requiere: NEON_API_KEY, NEON_PROJECT_ID. Opcional: RESTORE_MINUTES_AGO (default 60).
set -euo pipefail

: "${NEON_API_KEY:?Falta NEON_API_KEY}"
: "${NEON_PROJECT_ID:?Falta NEON_PROJECT_ID}"
MINUTES_AGO="${RESTORE_MINUTES_AGO:-60}"
API="https://console.neon.tech/api/v2"
AUTH="Authorization: Bearer ${NEON_API_KEY}"

# Timestamp objetivo (ISO 8601, UTC).
if date -u -d "@0" >/dev/null 2>&1; then
  TARGET=$(date -u -d "-${MINUTES_AGO} minutes" +"%Y-%m-%dT%H:%M:%SZ")   # GNU date
else
  TARGET=$(date -u -v-"${MINUTES_AGO}"M +"%Y-%m-%dT%H:%M:%SZ")            # BSD/macOS date
fi
BRANCH="restore-drill-$(date -u +%Y%m%d-%H%M%S)"

echo "[neon-drill] Creando branch '${BRANCH}' restaurado a ${TARGET}…"
START=$(date +%s)

RESP=$(curl -sS -X POST "${API}/projects/${NEON_PROJECT_ID}/branches" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d "{\"branch\":{\"name\":\"${BRANCH}\"},\"endpoints\":[{\"type\":\"read_write\"}],\"branch_point_in_time\":\"${TARGET}\"}")

BRANCH_ID=$(echo "$RESP" | grep -o '"id":"br-[^"]*"' | head -1 | cut -d'"' -f4 || true)
if [ -z "${BRANCH_ID:-}" ]; then
  echo "[neon-drill] ERROR creando el branch. Respuesta:"; echo "$RESP"; exit 1
fi

# Esperar a que el endpoint esté listo.
for _ in $(seq 1 60); do
  EP=$(curl -sS "${API}/projects/${NEON_PROJECT_ID}/branches/${BRANCH_ID}/endpoints" -H "${AUTH}")
  HOST=$(echo "$EP" | grep -o '"host":"[^"]*"' | head -1 | cut -d'"' -f4 || true)
  [ -n "${HOST:-}" ] && break
  sleep 2
done

END=$(date +%s)
RTO=$((END - START))
echo "[neon-drill] Branch listo: ${BRANCH_ID}"
echo "[neon-drill] Host de restauración: ${HOST:-<no disponible>}"
echo "[neon-drill] RTO medido: ${RTO}s  (registrar en docs/DISASTER_RECOVERY.md)"
echo "[neon-drill] Limpieza: borra el branch cuando termines:"
echo "  curl -X DELETE ${API}/projects/${NEON_PROJECT_ID}/branches/${BRANCH_ID} -H 'Authorization: Bearer \$NEON_API_KEY'"
