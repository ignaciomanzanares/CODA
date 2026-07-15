# Docker — dev reproducible y smoke de imágenes de producción

Un solo `Dockerfile` multi-stage (raíz del monorepo) con tres targets útiles:

| Target | Uso |
| --- | --- |
| `dev` | Imagen para el compose de desarrollo (código por bind mount, node_modules de la imagen) |
| `api` | Runtime de producción del **API y el worker** (mismo image; el worker solo cambia el CMD) |
| `web` | Build estático de `apps/web` servido por nginx, replicando el contrato de `vercel.json` |

**Este setup NO cambia el deploy actual** (Render runtime Node + Vercel). Migrar
Render a runtime Docker es una decisión aparte; las imágenes ya quedan listas
para eso si se decide.

## Desarrollo

```bash
docker compose up --build
```

- Web (vite + HMR): http://localhost:5173
- API (tsx watch): http://localhost:5000 — `GET /health` reporta DB/Redis
- Postgres: `localhost:5433` (user/pass/db: `coda`) — **dev igual a prod**: se
  acaba la divergencia SQLite/Postgres del dual-dialecto
- Redis: interno — activa la cola BullMQ: `POST /api/documents/upload` responde
  **202 + jobId** y el servicio `worker` procesa (el dev local sin Redis caía a
  procesamiento síncrono y nunca ejercitaba este camino)

El servicio one-shot `db-init`: compila `@coda/db`, crea el schema con
`drizzle-kit push` **solo si la BD está virgen** (sobre una BD ya inicializada,
push podría botar los índices que crean las migraciones) y aplica
`migrations/*.sql` (idempotentes vía `_migrations`).

Notas:
- **Cambio de dependencias** (package.json): `docker compose down -v && docker compose up --build`
  (los node_modules viven en volúmenes nombrados que tapan los del host).
  `down -v` también borra `pgdata`; si quieres conservar la BD, borra solo los
  volúmenes `node_modules*` (`docker volume rm coda_node_modules ...`).
- Seed de datos demo: `docker compose exec api npm run seed:demo`
- Los `.env` locales (`apps/api/.env`) no interfieren: dotenv no pisa variables
  ya presentes en el entorno, y el compose define las suyas.
- HMR sin detectar cambios → descomenta `CHOKIDAR_USEPOLLING` en el servicio `web`.

## Smoke de las imágenes de producción

```bash
docker compose -f docker-compose.prod.yml up --build
```

- Web por nginx: http://localhost:8080 (headers de seguridad de `vercel.json`,
  `sw.js` e `index.html` en `no-cache`, `/assets/` immutable, SPA fallback con
  los `index.html` pre-renderizados)
- API compilada (`dist/`), `NODE_ENV=production`, migraciones vía `db-init`

⚠️ Los secretos del compose prod son **dummies para smoke local** — nunca
usarlos en un deploy real. La CSP local omite `upgrade-insecure-requests`
(rompería el smoke por http); un deploy real detrás de TLS debe reponerla
(ver `docker/web-security-headers.inc.template`).

## Build de imágenes sueltas (deploy)

```bash
# API/worker (misma imagen; el worker usa: npm run worker:start -w @coda/api)
docker build --target api -t coda-api .

# Web (las VITE_* se hornean en el bundle → pasar el API real)
docker build --target web \
  --build-arg VITE_API_URL=https://api.codafinance.cl \
  -t coda-web .
```

## Decisiones de diseño (por qué así)

- **Debian (glibc), no alpine**: `canvas`, `onnxruntime-node` y `better-sqlite3`
  usan prebuilds glibc. `mupdf`/`tesseract.js` son WASM (ver `docs/OCR_DEPLOY.md`).
- La imagen `api` conserva la **estructura del monorepo**: `node_modules` raíz
  (symlink de workspace `@coda/db` → `packages/`), `packages/dist`,
  `migrations/` + `scripts/run-migrations.mjs` (el entrypoint las corre al boot,
  como el startCommand de Render; `RUN_MIGRATIONS=false` las delega a `db-init`
  en compose) y `apps/api/src/ml/artifacts` (el fallback ONNX se resuelve por
  `cwd=apps/api → src/ml/artifacts/current`, ver `modelRegistry.ts`).
- **OCR español pre-seedeado**: el build ejecuta tesseract.js una vez para dejar
  `spa.traineddata` cacheado en `apps/api/` (si el build no tiene red, el
  runtime lo descarga on-demand).
- El Postgres del compose no tiene TLS; `drizzle.config.ts` agrega
  `sslmode=require` si falta (pensado para Neon) → `db-init` define
  `DATABASE_URL_MIGRATE` con `sslmode=disable` explícito.
