# Production readiness

Estado operativo y checklist interno de CODA. Ultima revision: 2026-06-29.

**Fuente actual del estado productivo:**
[`production-checkpoint.md`](./production-checkpoint.md) resume el estado vigente
post-hardening (PRs #22-#29). Las secciones de este documento que describen las
fases de la migracion auth/CSRF se conservan como **historial** (ya completadas,
ver Roadmap mas abajo) y como referencia de diseno.

Este documento no reemplaza los dashboards de Render, Vercel o Neon. Antes de
un cambio de produccion, confirmar nuevamente el estado en cada proveedor.

## Estado actual

| Componente | Estado |
| --- | --- |
| Web | `https://www.codafinance.cl` |
| API | `https://api.codafinance.cl` (CNAME → `coda-api-fplk.onrender.com`) |
| Health | `GET /health` responde HTTP 200 y `status: ok` |
| Base de datos | Neon/PostgreSQL conectado |
| Redis | Conectado |
| Login demo | `DEMO_MODE=false`; `demo123` no autentica |
| Password reset | Flujo por email validado en produccion |
| 2FA | OTP por email validado en produccion |
| Auth personal | **Cookie-only** (`coda_session`); frontend sin `Authorization: Bearer` en requests personales (C3 completado) |
| Auth Empresas | Bearer/token-based con `jwt_token_empresas` (separado, no se toca) |
| Auth legacy backend | Bearer y token JSON se mantienen por compatibilidad (CLI/clientes externos) |
| CSRF | `CSRF_ENFORCE=true` activo y validado en produccion (Origin/Referer allowlist) |
| Metricas | Implementadas, con `METRICS_ENABLED=false`; token compare timing-safe (#27) |
| Sentry | Implementado, apagado mientras `SENTRY_DSN` no este definido |

La ultima verificacion de produccion se realizo despues del merge de PR #29.
No asumir que este snapshot sigue vigente sin ejecutar el smoke de este
documento.

## PRs de readiness cerrados

| PR | Alcance |
| --- | --- |
| #4 | Hardening, seguridad, Redis, CI y health |
| #5 | Eliminacion real de cuenta en PostgreSQL/Neon |
| #6 | Cierre del bypass de login demo |
| #7 | Email, reset de password y 2FA por email |
| #8 | Color de marca en emails transaccionales |
| #9 | `DEMO_MODE=false` en produccion |
| #10 | Observability core: metricas protegidas, Sentry opcional y redaction |
| #12 | Foundation de auth cookie compatible con Bearer |
| #13 | Frontend productivo usa `https://api.codafinance.cl` |
| #14 | Requests del frontend al API incluyen credentials |
| #15 | Auth cookie activada en produccion y validada con smoke |
| #16 | Documentacion del estado de auth cookie en produccion |
| #17 | Fase C1: frontend personal hidrata sesion desde la cookie (`/api/auth/me`) |
| #18 | Documentacion del split de auth persona/empresas y guardrails C2/C3 |
| #19 | Fase C1.5: capa de datos personal cookie-capable (sin Authorization) |
| #20 | Fase C2: el frontend personal deja de guardar nuevos tokens |
| #21 | Documentacion de la estrategia CSRF previa a C3 |
| #22 | CSRF-1: middleware backend Origin/Referer allowlist (`CSRF_ENFORCE=false`, inerte) |
| #23 | Fase C3: el frontend personal deja de enviar `Authorization: Bearer` (cookie-only) |
| #24 | Delete account no recrea usuarios via JWT/cookie viejo; blacklist TTL corregido |
| #25 | CSP: permitir APIs de tipo de cambio (FX) en `connect-src` |
| #26 | Checkpoint de produccion auth/CSRF (`production-checkpoint.md`) |
| #27 | `/metrics`: comparacion del token timing-safe (`crypto.timingSafeEqual`) |
| #28 | Cleanup: parametro `jwt_token` vestigial en push/Profile (post-C3) |
| #29 | Remocion de componentes demo no montados (OB/PD) |

## Auth: separacion persona / empresas

Estado actual (Fase C1 validada en produccion, merge `d70cbc5`):
- Auth dual activo: cookie httpOnly `coda_session` + `Authorization: Bearer` legacy.
- `coda_session`: `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, sin `Domain`
  (host-only para `api.codafinance.cl`).
- El frontend **personal** hidrata la sesion desde `GET /api/auth/me` (cookie-first);
  `/me` cookie-only sin `Authorization` responde 200.
- Bearer + `localStorage` + token JSON siguen vigentes por compatibilidad;
  login/register siguen devolviendo `token` + `Set-Cookie`.

Decision de arquitectura:
- El flujo **personal** avanza a cookie-first (C2/C3).
- El flujo **empresas** queda temporalmente token-based con `jwt_token_empresas`
  (Bearer/`localStorage`). No se migra a cookie todavia.

Razonamiento:
- Hoy existe **una sola** cookie `coda_session`, host-only para `api.codafinance.cl`.
  Una cookie unica no puede sostener dos sesiones independientes (persona y empresas)
  a la vez; el modelo actual las separa con `jwt_token` y `jwt_token_empresas`.
- Migrar empresas a cookie requeriria un diseno separado, por ejemplo: (a) una cookie
  con **nombre distinto** por contexto; (b) un **contexto unico** de sesion; o
  (c) **mantener Bearer** para empresas. Esa decision queda fuera de C2/C3 personal.

Guardrails para los proximos PRs:
- **C2 personal** puede dejar de guardar `jwt_token` (personal) en `localStorage`;
  la sesion se hidrata desde `/me`.
- **C2 personal NO** debe tocar `jwt_token_empresas`, `user_data_empresas` ni
  `empresasApi`.
- **C3 personal** puede remover los headers `Authorization: Bearer` de los requests
  **personales** al API.
- **C3 NO** debe tocar empresas.
- **CSRF** debe disenarse **antes** de remover Bearer de mutaciones sensibles (el
  header Bearer actua hoy como defensa CSRF implicita; con `SameSite=Lax` + same-site
  el riesgo es bajo pero no nulo). Ver `COOKIE_CSRF_ENABLED`.
- El **backend** debe seguir aceptando `Authorization: Bearer` por
  compatibilidad/rollback (clientes externos, CLI, empresas).

Rollback:
- Cambios frontend C2/C3: revertir el PR + redeploy Vercel (vuelve a sesion
  `localStorage`/Bearer).
- Cookie backend global: `AUTH_COOKIE_ENABLED=false` + redeploy Render, solo como
  rollback backend amplio. Si el frontend ya es cookie-only (post-C3), apagar la
  cookie romperia sesiones; por eso C3 solo despues de validar C1/C2 en produccion.

## Auth CSRF strategy (C3) — COMPLETADO

**Estado: implementado y activo en produccion.** El diseno descrito abajo se
ejecuto en PRs #22 (CSRF-1), CSRF-2 (activacion) y #23 (C3). Se conserva como
referencia de diseno. Ver el Roadmap (marcado done) y
[`production-checkpoint.md`](./production-checkpoint.md) para el estado vigente.

### Estado actual
- Auth personal cookie-first: `coda_session` (HttpOnly, Secure, SameSite=Lax,
  Path=/, sin Domain, host-only en `api.codafinance.cl`). C2 activo: login/
  register/2FA personal ya no guardan `jwt_token`/`user_data` nuevos.
- Bearer legacy sigue existiendo (fallback para tokens viejos y clientes
  externos/CLI).
- Empresas sigue Bearer/token-based con `jwt_token_empresas` (no se toca).

### Problema
- En C3 se remueve el Bearer de las mutaciones personales. El header `Authorization`
  hoy es una capa anti-CSRF implicita (no se puede forjar cross-site); al quitarlo,
  esa capa se pierde.
- `SameSite=Lax` ya bloquea el CSRF clasico (un POST/PUT/PATCH/DELETE cross-site no
  envia la cookie), pero no queremos depender solo de eso (queda el hueco de un
  subdominio same-site comprometido y falta defensa en profundidad).

### Decision
- Control CSRF primario: **validacion de `Origin`/`Referer` contra allowlist** para
  los mutating requests autenticados por cookie.
- **No** implementar double-submit como prerequisito de C3 (implicaria tocar ~31
  call-sites del frontend, FormData y CORS `allowedHeaders`). Queda como hardening
  opcional posterior.

### Diseno previsto
- Middleware backend, gateado por env `CSRF_ENFORCE` (default `false`).
- Aplica solo a metodos mutating: `POST`, `PUT`, `PATCH`, `DELETE`.
- Aplica solo cuando la request esta autenticada por la cookie `coda_session`.
- Exige `Origin` allowlisted (fallback `Referer` allowlisted).
- Con el flag activo: `Origin`/`Referer` invalido o ausente en una mutacion
  cookie-auth -> `403`. Con el flag `false`: comportamiento identico a hoy.

### Skips / exclusiones
- Requests con Bearer valido -> skip (header es CSRF-safe).
- Empresas (Bearer / `jwt_token_empresas`) -> skip.
- CLI / clientes externos con Bearer -> skip.
- Auth bootstrap: `login`, `register`, `forgot-password`, `reset-password`,
  `2fa/verify`, `2fa/resend`, `recover-migration-password` -> skip.
- Publicos: `utils/*`, `share/*` -> skip.
- `GET`/`HEAD`/`OPTIONS` -> skip.

### Allowlist
- `https://www.codafinance.cl`
- `https://codafinance.cl`
- dev local (p. ej. `http://localhost:5173`)
- preview/staging si corresponde (o permitir cuando `NODE_ENV != production`).

### Roadmap (completado)
- **[x] PR CSRF-1 (#22):** middleware backend `apps/api/src/middleware/csrf.ts`
  (`csrfOriginCheck`), montado tras `cookieParser` en `index.ts`. Mergeado con
  `CSRF_ENFORCE=false` (inerte). Sin frontend, sin cambios en CORS `allowedHeaders`.
- **[x] CSRF-2:** `CSRF_ENFORCE=true` activado en Render + smoke de produccion
  validado (ver "Smoke validado" abajo).
- **[x] PR C3 (#23):** removido el Bearer de los requests personales del frontend
  (cookie-only). Gate central en `apps/web/src/lib/api.tsx`: Bearer solo si
  `context === "empresas"`.
- [ ] Opcional posterior (no iniciado): double-submit cookie (`coda_csrf` +
  `X-CSRF-Token`) como defensa en profundidad adicional.

### Rollback
- `CSRF_ENFORCE=false` + redeploy Render -> revierte el enforcement al instante.
- Sin tocar frontend; el Bearer sigue funcionando.

### Smoke validado (CSRF-2, produccion)
- [x] Mutating cookie-auth con `Origin` allowlisted -> 200.
- [x] Mutating cookie-auth sin `Origin` o con `Origin` falso -> 403
  (`CSRF validation failed`).
- [x] Request con Bearer valido (sin cookie) -> pasa (sin Origin-check).
- [x] `login`/`register`/`reset-password` siguen funcionando (CLI incluido).
- [x] Empresas sigue funcionando.
- [x] `GET` no requiere CSRF.

## Variables criticas de Render

Nunca registrar valores secretos en este documento, issues, PRs o logs. La
fuente de referencia para nombres y defaults es `apps/api/.env.example`; el
estado efectivo se confirma en Render.

| Variable | Requisito de produccion |
| --- | --- |
| `NODE_ENV` | `production` |
| `PORT` | Puerto asignado/configurado por Render |
| `DATABASE_URL` | URL TLS de Neon; secreto obligatorio |
| `JWT_SECRET` | Secreto obligatorio de al menos 32 caracteres |
| `JWT_EXPIRES_IN` | Duracion deliberada de los JWT |
| `REDIS_URL` | Redis compartido para OTP/rate limiting multi-instancia |
| `CORS_ORIGINS` | Solo origenes web aprobados |
| `CLIENT_URL` | `https://www.codafinance.cl` para links de email |
| `DEMO_MODE` | Debe permanecer en `false` |
| `DEMO_ALLOWED_EMAILS` | No habilita nada mientras demo mode este apagado |
| `AUTH_COOKIE_ENABLED` | `true` en produccion; `false` sigue como default local/dev |
| `AUTH_COOKIE_SECURE` | `true` |
| `AUTH_COOKIE_SAMESITE` | `lax` |
| `AUTH_COOKIE_DOMAIN` | Vacio: cookie host-only en `api.codafinance.cl` |
| `DEBUG_ENDPOINTS` | Debe permanecer en `false` |
| `METRICS_ENABLED` | `false` hasta aprobar su activacion |
| `METRICS_TOKEN` | Secreto fuerte obligatorio si se habilitan metricas |
| `SENTRY_DSN` | Vacio/ausente mantiene Sentry apagado |
| `SENTRY_TRACES_SAMPLE_RATE` | `0` mientras Sentry este apagado |
| `GMAIL_USER` | Usuario del proveedor Gmail, si se usa Gmail |
| `GMAIL_APP_PASSWORD` | Secreto del proveedor Gmail, si se usa Gmail |
| `RESEND_API_KEY` | Secreto del proveedor preferido, si se usa Resend |
| `RESEND_FROM` | Remitente verificado, si se usa Resend |
| `EMAIL_FROM` | Remitente compartido de fallback |
| `SMTP_HOST` / `SMTP_PORT` | Host y puerto, si se usa SMTP |
| `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | Credenciales/remitente, si se usa SMTP |
| `ENABLE_ONBOARDING` | Feature flag coordinado con el frontend |

Configurar un solo proveedor de email. Sin proveedor operativo, 2FA falla
cerrado y forgot-password no puede entregar el correo.

## Smoke de produccion

Usar una cuenta real controlada o un throwaway creado para el smoke. No pegar
passwords ni tokens en tickets, PRs, logs compartidos o este documento. Respetar
el rate limiter y limpiar siempre la cuenta throwaway.

Definir la URL sin credenciales:

```bash
API_URL=https://api.codafinance.cl
```

### 1. Health

```bash
curl -i "$API_URL/health"
```

- [ ] HTTP 200.
- [ ] `status` es `ok`.
- [ ] Database aparece conectado.
- [ ] Redis aparece conectado.

### 2. Demo apagado

Ejecutar `POST /api/auth/login` con JSON y comprobar:

- [ ] `demo@example.com` + `demo123` responde HTTP 401.
- [ ] Un email inexistente + `demo123` responde HTTP 401.
- [ ] El email inexistente no aparece luego en `users`.
- [ ] Una cuenta real + `demo123` responde HTTP 401.

No activar `DEMO_MODE` para realizar este smoke.

### 3. Auth real y throwaway

- [ ] `POST /api/auth/login` con una cuenta controlada y su password real
  responde HTTP 200.
- [ ] `POST /api/auth/register` crea un email throwaway unico y responde HTTP
  201 con token.
- [ ] `GET /api/auth/me` con `Authorization: Bearer <token>` responde HTTP 200
  para el throwaway.
- [ ] Login/register/2FA verify siguen devolviendo el token JSON y emiten
  `coda_session` con `HttpOnly`, `Secure`, `SameSite=Lax` y sin `Domain`.
- [ ] `GET /api/auth/me` tambien responde HTTP 200 usando solo la cookie.
- [ ] Un Bearer invalido junto con una cookie valida responde HTTP 401, sin
  fallback a la cookie.
- [ ] Un header `Authorization: Basic ...` junto con una cookie valida responde
  HTTP 401.
- [ ] `POST /api/auth/logout` usando solo la cookie responde HTTP 200, limpia
  `coda_session` e invalida el JWT; reutilizar la cookie/JWT anterior responde
  HTTP 401.
- [ ] No imprimir ni persistir el token fuera de la sesion de smoke.

### 4. Email, reset y 2FA

- [ ] `POST /api/auth/forgot-password` para el throwaway responde HTTP 200 con
  mensaje generico.
- [ ] El correo de reset llega al inbox controlado sin revelar datos sensibles.
- [ ] `POST /api/auth/reset-password` acepta una sola vez el token recibido y la
  nueva password permite login.
- [ ] El login de una cuenta controlada con 2FA envia OTP por email.
- [ ] `POST /api/auth/2fa/verify` acepta el OTP vigente y rechaza uno invalido o
  expirado.

Si reset y 2FA ya fueron validados durante la misma ventana de despliegue, una
prueba basica de envio puede ser suficiente para evitar el rate limiter.

### 5. Observability apagado

```bash
curl -i "$API_URL/metrics"
curl -i "$API_URL/metrics?token=test"
```

- [ ] Ambos requests responden 404, 401 o 403.
- [ ] Ninguno devuelve metricas Prometheus.
- [ ] Un token por query param nunca habilita acceso.
- [ ] `METRICS_ENABLED` sigue en `false`.
- [ ] `SENTRY_DSN` sigue vacio/ausente si Sentry no fue aprobado.

### 6. Cleanup y cierre

- [ ] `DELETE /api/profile/account` con el token del throwaway responde HTTP
  200.
- [ ] El throwaway ya no existe y sus filas asociadas quedaron en cero.
- [ ] No quedan archivos, tokens ni variables temporales del smoke.
- [ ] El worktree local queda limpio y `main` sincronizado con `origin/main`.

## Limpieza controlada de Neon

- Nunca borrar usuarios con un patron amplio de email.
- Trabajar solo con una lista exacta y aprobada de emails/user IDs.
- Antes de borrar, contar las filas asociadas y detenerse si aparecen datos
  financieros que no estaban previstos.
- Preferir `DELETE /api/profile/account` con una sesion controlada.
- Sin credenciales, usar `storage.deleteUserData(userId)` para el user ID exacto
  en un script local controlado y dentro de una transaccion cuando aplique.
- Despues de borrar, repetir los counts y confirmar que el total de usuarios
  cambio exactamente en la cantidad aprobada.
- No tocar cuentas reales, de socios/equipo ni cuentas con documentos,
  cartolas, transacciones o gastos sin una aprobacion explicita y especifica.
- No registrar contenidos financieros; solo IDs parciales y conteos.

## Rama de Thomas

- No mergear completa `origin/security/auditoria-remediacion`.
- Integrar cambios selectivos en PRs pequenos creados desde `main` actualizado.
- Observability core ya fue portado manualmente en PR #10.
- Blob store, ML y habitos/recomendaciones permanecen postergados y requieren
  auditoria separada.

## Pendientes

- [x] Fase A JWT cookie foundation (backwards-compatible) implementada tras
  `AUTH_COOKIE_ENABLED`: `authenticate` lee cookie httpOnly o
  `Authorization: Bearer` (Bearer con prioridad estricta); helpers
  `setAuthCookie`/`clearAuthCookie` en `apps/api/src/middleware/authCookie.ts`.
  Produccion lo activa con una cookie host-only en `api.codafinance.cl`; Bearer y
  token JSON siguen vigentes. Rollback: `AUTH_COOKIE_ENABLED=false` y redeploy.
- [x] Dominio API propio `api.codafinance.cl` y `credentials: "include"` en los
  requests del frontend al API.
- [x] Fase C1 (cookie-primary personal): el frontend personal hidrata la sesion
  desde `/api/auth/me` (cookie-first) con Bearer/`localStorage` como fallback.
  Validada en produccion (merge `d70cbc5`). Ver "Auth: separacion persona / empresas".
- [x] Fase C2 (#20) / C3 (#23) personal: el frontend dejo de guardar (C2) y de
  enviar (C3) el token personal; sesion 100% cookie-only. Guardrails respetados:
  `jwt_token_empresas`/`empresasApi` intactos; CSRF disenado y activado (#22 + CSRF-2)
  antes de remover el Bearer; el backend mantiene Bearer por compatibilidad.
- [ ] Empresas: smoke funcional E2E pendiente si se vuelve a tocar esa area
  (quedo aislada e intacta durante la migracion auth/CSRF).
- [ ] Posible limpieza futura del token JSON que el backend aun devuelve en
  login/register (el frontend personal ya no lo usa; evaluar impacto en CLI/legacy).
- [ ] Posible cleanup de helpers legacy de auth (`getPersonalToken`, fallback Bearer
  en hidratacion/logout de `auth.tsx`) si se decide retirar el soporte a tokens viejos.
- [ ] Componentes frontend no referenciados (~16, p. ej. `CategoryPieChart`,
  `FinancialHealthCard`): requieren criterio de producto (pueden ser WIP por
  cablear). NO borrar automaticamente.
- [ ] Activar metricas solo si existe consumidor, token fuerte, rotacion y
  control de acceso acordados.
- [ ] Activar Sentry solo despues de validar redaction, muestreo, retencion y
  politica de acceso con eventos reales controlados.
- [ ] Decidir conservacion o limpieza de `demo@example.com` y `hola@gmail.com`
  mediante revision individual y aprobacion explicita.
- [ ] Anonimizar `audit_logs` sin perder trazabilidad regulatoria.
- [ ] Definir cleanup consistente para `profile_picture` y futuros blobs.
- [ ] Mover reset tokens a Redis antes de escalar a multiples instancias.
