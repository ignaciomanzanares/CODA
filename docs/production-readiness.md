# Production readiness

Estado operativo y checklist interno de CODA. Ultima revision: 2026-06-26.

Este documento no reemplaza los dashboards de Render, Vercel o Neon. Antes de
un cambio de produccion, confirmar nuevamente el estado en cada proveedor.

## Estado actual

| Componente | Estado |
| --- | --- |
| Web | `https://www.codafinance.cl` |
| API | `https://coda-api-fplk.onrender.com` |
| Health | `GET /health` responde HTTP 200 y `status: ok` |
| Base de datos | Neon/PostgreSQL conectado |
| Redis | Conectado |
| Login demo | `DEMO_MODE=false`; `demo123` no autentica |
| Password reset | Flujo por email validado en produccion |
| 2FA | OTP por email validado en produccion |
| Metricas | Implementadas, con `METRICS_ENABLED=false` |
| Sentry | Implementado, apagado mientras `SENTRY_DSN` no este definido |

La ultima verificacion de produccion se realizo despues del merge de PR #10.
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
API_URL=https://coda-api-fplk.onrender.com
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

- [ ] Evaluar JWT en cookies `httpOnly`, `Secure` y `SameSite` con migracion
  compatible para web/API.
- [ ] Evaluar dominio API propio `api.codafinance.cl`.
- [ ] Activar metricas solo si existe consumidor, token fuerte, rotacion y
  control de acceso acordados.
- [ ] Activar Sentry solo despues de validar redaction, muestreo, retencion y
  politica de acceso con eventos reales controlados.
- [ ] Decidir conservacion o limpieza de `demo@example.com` y `hola@gmail.com`
  mediante revision individual y aprobacion explicita.
- [ ] Anonimizar `audit_logs` sin perder trazabilidad regulatoria.
- [ ] Definir cleanup consistente para `profile_picture` y futuros blobs.
- [ ] Mover reset tokens a Redis antes de escalar a multiples instancias.
