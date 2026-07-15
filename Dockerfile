# syntax=docker/dockerfile:1
# ============================================================
# CODA — Dockerfile multi-stage (monorepo, context = raíz)
#
# Targets:
#   dev  → imagen para docker-compose de desarrollo (código por bind mount)
#   api  → runtime de producción del API y del worker (mismo image, distinto CMD)
#   web  → build estático de apps/web servido por nginx
#
# Base Debian (glibc) obligatoria: canvas, onnxruntime-node y better-sqlite3
# usan prebuilds glibc — NO cambiar a alpine/musl. mupdf y tesseract.js son
# WASM y @napi-rs/canvas trae binarios propios (ver docs/OCR_DEPLOY.md).
# ============================================================

# ------------------------------------------------------------
# base — runtime común: Node 22 + libs de sistema del `canvas` legacy
# (usado por enhanceImageForOcr) + dumb-init como PID 1.
# ------------------------------------------------------------
FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends \
      dumb-init \
      libcairo2 libpango-1.0-0 libpangocairo-1.0-0 \
      libjpeg62-turbo libgif7 librsvg2-2 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ------------------------------------------------------------
# deps — node_modules completo (incluye devDeps). Imagen full de
# bookworm: trae python3/gcc por si algún prebuild nativo no aplica
# y node-gyp tiene que compilar.
# ------------------------------------------------------------
FROM node:22-bookworm AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/package.json packages/
RUN npm ci \
    # garantizar que existan los dirs que el compose tapa con volúmenes
    && mkdir -p node_modules apps/api/node_modules apps/web/node_modules packages/node_modules

# ------------------------------------------------------------
# dev — para docker-compose de desarrollo. El código llega por bind
# mount (.:/app); los node_modules de ESTA imagen tapan los del host
# vía volúmenes nombrados (ver docker-compose.yml).
# ------------------------------------------------------------
FROM base AS dev
ENV NODE_ENV=development
COPY --from=deps /app /app
# comando real lo define docker-compose (tsx / vite / db-init)
CMD ["node", "--version"]

# ------------------------------------------------------------
# build — compila @coda/db (prebuild del api), @coda/api y @coda/web.
# Las VITE_* se hornean en el bundle del web en ESTE paso.
# ------------------------------------------------------------
FROM deps AS build
COPY . .
RUN npm run build -w @coda/api

ARG VITE_API_URL=http://localhost:5000
ARG VITE_ENV=production
ARG VITE_ENABLE_CODA_EMPRESAS=false
ARG VITE_ENABLE_ONBOARDING=true
ARG VITE_ENABLE_RISK_DUAL_SCORE=false
# En Vite, process.env tiene prioridad sobre los archivos .env → los ARG mandan.
ENV VITE_API_URL=$VITE_API_URL \
    VITE_ENV=$VITE_ENV \
    VITE_ENABLE_CODA_EMPRESAS=$VITE_ENABLE_CODA_EMPRESAS \
    VITE_ENABLE_ONBOARDING=$VITE_ENABLE_ONBOARDING \
    VITE_ENABLE_RISK_DUAL_SCORE=$VITE_ENABLE_RISK_DUAL_SCORE
RUN npm run build -w @coda/web

# ------------------------------------------------------------
# pruned — build sin devDependencies (tsx/vitest/typescript/drizzle-kit fuera)
# ------------------------------------------------------------
FROM build AS pruned
RUN npm prune --omit=dev

# ------------------------------------------------------------
# api — runtime de producción del API **y** del worker.
#   API:    CMD por defecto (npm run start -w @coda/api)
#   worker: override del CMD → npm run worker:start -w @coda/api
# Conserva la estructura del monorepo que el runtime espera:
#   - node_modules raíz con el symlink de workspace @coda/db → /app/packages
#   - packages/dist (main de @coda/db)
#   - migrations/ + scripts/run-migrations.mjs (entrypoint, como en Render)
#   - apps/api/src/ml/artifacts (fallback ONNX: modelRegistry lo resuelve
#     por cwd=apps/api → "src/ml/artifacts/current")
# ------------------------------------------------------------
FROM base AS api
ENV NODE_ENV=production
COPY --chown=node:node --from=pruned /app/package.json /app/package-lock.json ./
COPY --chown=node:node --from=pruned /app/node_modules ./node_modules
COPY --chown=node:node --from=pruned /app/packages/package.json ./packages/package.json
COPY --chown=node:node --from=pruned /app/packages/dist ./packages/dist
COPY --chown=node:node --from=pruned /app/packages/node_modules ./packages/node_modules
COPY --chown=node:node --from=pruned /app/apps/api/package.json ./apps/api/package.json
COPY --chown=node:node --from=pruned /app/apps/api/dist ./apps/api/dist
COPY --chown=node:node --from=pruned /app/apps/api/node_modules ./apps/api/node_modules
COPY --chown=node:node apps/api/src/ml/artifacts ./apps/api/src/ml/artifacts
COPY --chown=node:node migrations ./migrations
COPY --chown=node:node scripts/run-migrations.mjs ./scripts/run-migrations.mjs
COPY --chown=node:node docker/api-entrypoint.sh /usr/local/bin/api-entrypoint.sh
RUN chmod +x /usr/local/bin/api-entrypoint.sh
USER node
# Pre-seed del OCR español: ejecutar tesseract.js una vez puebla el cache
# (spa.traineddata en cwd=apps/api) exactamente como el runtime lo espera.
# Si falla (sin red en el build), el runtime lo descarga on-demand.
RUN cd apps/api && \
    (node --input-type=module -e "const {createWorker}=await import('tesseract.js'); const w=await createWorker('spa'); await w.terminate();" \
     && echo "OCR: spa.traineddata pre-seedeado" \
     || echo "WARN: no se pudo pre-seedear spa.traineddata; se descargará en runtime")
EXPOSE 5000
ENTRYPOINT ["dumb-init", "--", "api-entrypoint.sh"]
CMD ["npm", "run", "start", "-w", "@coda/api"]

# ------------------------------------------------------------
# web — estáticos de apps/web servidos por nginx, replicando el
# contrato de vercel.json (headers, SPA fallback, cache). La CSP
# usa ${API_ORIGIN} (envsubst del entrypoint oficial de nginx).
# ------------------------------------------------------------
FROM nginx:1.27-alpine AS web
COPY docker/web.nginx.conf.template /etc/nginx/templates/default.conf.template
COPY docker/web-security-headers.inc.template /etc/nginx/templates/security-headers.inc.template
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
ENV API_ORIGIN=http://localhost:5000
EXPOSE 8080
