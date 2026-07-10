---
name: verify
description: Launch CODA (API + web) locally with seeded demo data to verify web/API changes end-to-end in a real browser.
---

# Verificar CODA end-to-end (dev local, SQLite)

## Build / launch

```bash
npm install                      # canvas necesita: apt-get install -y libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev pkg-config
npm run build -w @coda/db        # requerido antes de `npm run check` (apps/api importa packages/dist)

# Schema SQLite — OJO: `npm run db:reset:sqlite` escribe en repo/data/ pero el runtime
# lee packages/data/coda.db; push directo a la ruta real (y su seed `packages/src/seed.ts` no existe):
mkdir -p packages/data && SQLITE_PATH=$PWD/packages/data/coda.db DIALECT=sqlite npm run db:push -w @coda/db

# API en :5000 — AUTH_COOKIE_ENABLED es imprescindible para que la sesión del navegador
# sobreviva un reload (el frontend personal es cookie-first y no persiste el token):
cd apps/api && AUTH_COOKIE_ENABLED=true AUTH_COOKIE_SECURE=false npm run dev

# Web en :5173 (proxy /api → :5000):
cd apps/web && npm run dev
```

## Datos de prueba

`npm run seed:demo` es solo-Postgres. Para SQLite, insertar directo vía drizzle desde
`apps/api` (mismo patrón que `src/tests/deleteUserData.test.ts::seedUserWithData`):
usuario (`hashPassword` de `src/middleware/auth.js`), cuenta + `transactions` +
`balances`, `creditScores`, `transactionalScores`, `financialGoals`, y
`documentUploads` con `tipo:'cartola'` (`parsedData` con `transacciones:[{tipo:'abono'|'cargo',monto}]`)
y `tipo:'cmf'` (`parsedData: {"deudaTotalVigente":N}` — formato legacy que
`normalizeCmfData` completa). El panel exige ≥1 doc cartola (`documentCount`) y la
salud financiera exige cartola + cmf.

## Drive (Playwright)

- Instalar `playwright` en un dir temporal; lanzar con
  `executablePath: '/opt/pw-browsers/chromium'` y `args: ['--no-proxy-server']`
  (sin eso, el proxy del contenedor rompe localhost con ERR_TUNNEL_CONNECTION_FAILED).
- Login por UI: `/iniciar-sesion`, inputs `#email` / `#password`, submit; esperar
  a que la URL salga de `iniciar-sesion` antes de navegar a `/panel`.
- Esperar contenido real (p. ej. un texto del componente nuevo) — `networkidle`
  no basta: el widget del asistente sigue haciendo polling.
- Flags de build: reiniciar vite con `VITE_ENABLE_...=true` (se hornean al arrancar).

## Gotchas

- `apps/web` tests: `npm run test -w @coda/web` (vitest, rápido y verde).
- Selectores por texto: el menú/footer duplican links (`/plan`, `/salud-financiera`)
  ocultos; clickear por texto único del componente, no por `a[href=...]`.
