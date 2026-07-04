# Production checkpoint: auth, CSRF and platform

Estado operativo vigente despues de los PR #22 a #25. Este documento resume el
checkpoint productivo actual; `production-readiness.md` conserva el historial y
los procedimientos mas amplios.

## Estado productivo actual

| Componente | Estado |
| --- | --- |
| Web | `https://www.codafinance.cl` y `https://codafinance.cl` |
| API | `https://api.codafinance.cl` |
| Health | `GET /health` responde 200; DB, Redis y ML en estado operativo |
| Auth personal | Frontend cookie-only mediante `coda_session` y `/api/auth/me` |
| Auth Empresas | Bearer separado mediante `jwt_token_empresas` |
| CSRF | `CSRF_ENFORCE=true` activo y validado en produccion |
| Neon | Baseline esperado: 7 usuarios despues de cada cleanup controlado |
| Demo | `DEMO_MODE=false`; `demo123` responde 401 |

Hitos incluidos en este checkpoint:

- PR #22: middleware CSRF por `Origin`/`Referer`.
- CSRF-2: enforcement activado manualmente en Render y validado.
- PR #23: requests personales sin Bearer; cookie como transporte de sesion.
- PR #24: delete account revoca la sesion y no permite recrear usuarios.
- PR #25: allowlist CSP para proveedores externos de tipo de cambio.

## Auth personal

- La cookie se llama `coda_session` y usa `HttpOnly`, `Secure`,
  `SameSite=Lax`, `Path=/` y no define `Domain`; por tanto es host-only para
  `api.codafinance.cl`.
- Login, register y 2FA verify pueden seguir devolviendo `token` en JSON por
  compatibilidad. El frontend personal no guarda tokens nuevos en `jwt_token` ni
  los usa para requests normales.
- La sesion personal se hidrata con `GET /api/auth/me` usando la cookie.
- Los requests personales normales no envian `Authorization: Bearer` y mantienen
  `credentials: "include"`.
- Logout invalida el JWT de la cookie y limpia `coda_session`.
- El backend conserva soporte Bearer para CLI, clientes legacy y rollback.
- Empresas permanece separado: `jwt_token_empresas`, `empresasApi` y Bearer no
  fueron migrados.

## CSRF

`CSRF_ENFORCE=true` esta activo en Render. Para una mutacion autenticada por
`coda_session`, el middleware exige un `Origin` permitido o usa `Referer` como
fallback.

Origins incluidos por defecto:

- `https://www.codafinance.cl`
- `https://codafinance.cl`
- `http://localhost:5173`
- `http://localhost:3000`
- Origins adicionales configurados de forma explicita en `CORS_ORIGINS`

Comportamiento validado:

- Mutacion cookie-auth con Origin permitido: pasa.
- Sin Origin, Origin `null`, invalido o no permitido: 403.
- GET, HEAD y OPTIONS: no requieren esta validacion.
- Bearer valido: skip para CLI, legacy y Empresas.
- Bootstrap de auth (`login`, `register`, reset y 2FA verify/resend): skip.
- Rutas publicas y prefijo `/api/empresas/`: skip segun el middleware actual.

Rollback de emergencia: establecer `CSRF_ENFORCE=false` y hacer redeploy de
Render. No cambiar el frontend para ese rollback.

## Delete account

- `DELETE /api/profile/account` invalida el JWT actual antes del borrado, elimina
  los datos mediante `storage.deleteUserData` y limpia `coda_session`.
- Reutilizar la cookie o un JWT anterior despues del delete responde 401.
- `authenticate` exige que exista la fila `users` correspondiente al JWT.
- `ensureUserForToken` ya no crea usuarios genericos para JWT sin contraparte.
- Register y login normales siguen siendo los caminos para crear/autenticar
  cuentas reales.
- Despues del cleanup, Neon debe volver al baseline de 7 usuarios y el email
  throwaway debe quedar en cero filas.

## CSP de tipo de cambio

La directiva `connect-src` del frontend permite solo los origins HTTPS exactos
usados por la cadena de cotizacion:

- `https://api.frankfurter.dev`
- `https://open.er-api.com`
- `https://cdn.moneyconvert.net`

No se agregaron wildcards ni se relajaron otras directivas CSP. Si cambia un
proveedor, actualizar la allowlist de forma explicita y repetir el smoke de
Console y Network.

## Smoke de produccion

- [ ] `GET https://api.codafinance.cl/health` responde 200 con DB, Redis y ML
  operativos.
- [ ] Register/login controlado funciona y emite `coda_session`.
- [ ] Login/register personal no crea un nuevo `jwt_token` en localStorage.
- [ ] Reload y hard reload mantienen la sesion mediante `/api/auth/me`.
- [ ] Requests personales normales no incluyen `Authorization: Bearer`.
- [ ] Mutacion con `Origin: https://www.codafinance.cl` pasa.
- [ ] La misma mutacion cookie-auth sin Origin responde 403.
- [ ] Logout limpia `coda_session`; reload queda sin sesion.
- [ ] `demo@example.com` + `demo123` responde 401.
- [ ] Delete account responde 200; cookie/JWT viejo y un endpoint protegido
  responden 401 sin recrear la fila.
- [ ] El throwaway queda en cero filas y Neon vuelve a 7 usuarios.
- [ ] Console no muestra violaciones CSP para los tres proveedores FX; los
  requests pueden fallar por red/API, pero no por CSP.

No imprimir JWT, cookies, passwords ni valores de variables secretas durante el
smoke. Usar siempre un throwaway unico y eliminarlo al terminar.

## Pendientes restantes

- Ejecutar smoke funcional de Empresas cuando se modifique esa superficie; no
  mezclarlo con cambios personales.
- Decidir en una fase futura si login/register/2FA personal dejan de devolver el
  token JSON.
- Limpiar gradualmente helpers legacy de `jwt_token` solo despues de inventariar
  consumidores y conservar el rollback necesario.
- Activar y monitorear metricas o Sentry solo con consumidor, acceso, redaction,
  muestreo y retencion acordados.
- Auditar por separado Open Banking y PD/ML, excluidos de estos PRs.
- Mantener la allowlist CSP sincronizada si cambian los proveedores FX.
