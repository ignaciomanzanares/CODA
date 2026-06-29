# Guía de integración de servicios externos (post-overhaul)

Todo el overhaul funciona **sin configurar nada** gracias a fallbacks (blob en Postgres, modelo
local, alertas a log, sin Sentry, sin anonimización-IA apagada). Esta guía es para **activar** lo
que vive detrás de flags cuando aprovisiones cada servicio. Cada sección es independiente.

Resumen de variables de entorno (todas opcionales salvo las ya existentes):

| Variable | Para qué | Si no está |
|---|---|---|
| `BLOB_BACKEND=s3` + `BLOB_*` | Guardar artefactos ML y originales en S3/R2 | Se usa Postgres (`stored_blobs`, cifrado) |
| `SENTRY_DSN` / `VITE_SENTRY_DSN` | Captura de errores backend / frontend | Solo logs |
| `OPS_WEBHOOK_URL` | Alertas de drift y profundidad de cola a Slack/Discord | Solo logs |
| `AI_AUTHORIZED_PROVIDERS` | Whitelist de proveedores de IA con DPA | No restringe (todos con API key) |
| `AI_ANONYMIZE_PAYLOAD=false` | Desactivar anonimización del payload a IA | Anonimizado por defecto (#6) |
| `DEMO_MODE` | Login demo (solo staging) | `false` en prod (cerrado, #4) |
| `RETENTION_JOB_ENABLED=false` | Apagar el job de retención de originales | Corre cada 24h |
| `RANKING_WEIGHTS_JOB_ENABLED=false` | Apagar la reponderación de productos | Corre cada 7 días |
| `QUEUE_DEPTH_ALERT_THRESHOLD` | Umbral de alerta de cola (default 50) | 50 |
| `ORIGINAL_DOC_TTL_DAYS` | TTL del original cifrado (default 30) | 30 |
| `OCR_POOL_SIZE` | Tamaño del pool de workers Tesseract | nº de cores (cap 4) |
| `PG_POOL_MAX` | Conexiones Postgres por instancia | 8 |

## 1. Blob storage S3/R2 (artefactos ML + originales) — #5/#21

1. Crear un bucket en AWS S3 o Cloudflare R2.
2. Setear: `BLOB_BACKEND=s3`, `BLOB_BUCKET`, `BLOB_REGION`, `BLOB_ACCESS_KEY_ID`,
   `BLOB_SECRET_ACCESS_KEY`, y para R2 también `BLOB_ENDPOINT`.
3. Instalar la dep si falta: `npm i @aws-sdk/client-s3 -w @coda/api`.
4. Verificación: subir un documento → debe aparecer un objeto bajo `originals/<userId>/...`.

## 2. Modelo PD en producción (promoción sin redeploy) — #5/#9

El modelo chileno (AUC 0.61) ya viene en `artifacts/current` (fallback versionado). Para promover
uno nuevo sin redeploy:

```bash
npm run ml:make:synth -w @coda/api      # genera datos
npm run ml:train -w @coda/api           # entrena → artifacts/current (o un dir nuevo)
npx tsx apps/api/scripts/promote-model.ts <artifactDir> --apply   # sube al blob + marca production
```

Al boot, `modelRegistry` descarga la versión `production` del blob. El workflow `ml-retrain.yml`
(semanal) entrena y registra `candidate`; la promoción a `production` es manual.

## 3. Sentry (errores) — #27

- Backend: `npm i @sentry/node -w @coda/api` + `SENTRY_DSN`.
- Frontend: `npm i @sentry/react -w @coda/web` + `VITE_SENTRY_DSN`.
- Sin el DSN no se inicializa (no-op). `/metrics` (Prometheus) está siempre activo.

## 4. Alertas a Ops (drift + cola) — #24/#27

Setear `OPS_WEBHOOK_URL` (webhook entrante de Slack/Discord). Recibe alertas de drift de modelo
(PSI) y de saturación de la cola de documentos. Sin él, las alertas van al log.

## 5. Datos a IA con DPA — #6

- `AI_AUTHORIZED_PROVIDERS=anthropic,openai` (CSV) limita el envío de datos a proveedores con
  contrato de tratamiento (DPA) firmado. El DPA en sí es un trámite legal externo.
- El payload se anonimiza por defecto (rangos en vez de montos, sin glosas). `AI_ANONYMIZE_PAYLOAD=false`
  solo para usos internos controlados.

## 6. Doppler (secretos) — #26

Ver [`DOPPLER.md`](./DOPPLER.md). Centraliza los secretos y permite quitar los `sync:false` de
`render.yaml` una vez integrado.

## 7. Neon (Postgres) — #7

Ver la sección "Pool y restauración" en [`DISASTER_RECOVERY.md`](./DISASTER_RECOVERY.md):
usar el connection string con `-pooler`, dimensionar `PG_POOL_MAX`, y correr el ejercicio de
restauración (`scripts/neon-restore-drill.sh`).
