# Scraper bancario (Nivel 2)

Obtención de cartola por **automatización de navegador**, envuelta como un `OBProvider` más.
El scraper NO es un subsistema nuevo: implementa el mismo contrato que `MockProvider` /
`CartolaUploadProvider` y escribe por `ingestOpenBankingForUser` a las tablas canónicas
`accounts` / `balances` / `transactions`. Todo aguas abajo (features ML, scoring, PFM) no sabe
que los datos vinieron de un scraper.

## Modelo de credenciales — IN-SESSION, sin persistir

Los bancos chilenos exigen **MFA en cada login**, así que refrescar en background sin el usuario
presente es inviable. Por eso:

- La clave del banco **nunca se guarda** (ni en DB, ni en disco, ni en logs/telemetría).
- Se recibe en memoria, se usa durante el scrape, y `scrapeAndIngest` **cierra el navegador en
  un `finally`** → la sesión y las credenciales se descartan pase lo que pase.
- El refresco lo dispara el usuario (ingresa clave + MFA cuando quiere actualizar).

Esto elimina el mayor pasivo legal/seguridad (custodiar credenciales bancarias) y reduce el
alcance de B4 (bóveda) y B7 (pentest).

⚠️ **Legal**: la automatización con credenciales del titular roza con los ToS de los bancos.
Requiere respaldo legal (fuera del alcance de este código).

## Piezas

| Archivo | Rol |
|---|---|
| `types.ts` | `BankAdapter`, `BankPage` (abstracción del navegador), `ScraperCredentials`, `MfaResolver` |
| `bankScraperProvider.ts` | `OBProvider` que envuelve una sesión autenticada + un `BankAdapter` |
| `scrapeAndIngest.ts` | Orquestador: abre navegador → login → ingiere → **cierra siempre**. Define `BrowserDriver` |
| `adapters/santander.ts` | **Santander** (esqueleto; primer banco objetivo — Ignacio tiene cuenta) |
| `adapters/bancoEstado.ts` | BancoEstado (esqueleto) |

Falta (siguiente paso): el `BrowserDriver` concreto con **Playwright** (corre local, con el
usuario presente; aún no en el worker de Render).

## Cómo agregar / completar un banco

1. Implementa `BankAdapter` (login + MFA + parseo de cuentas/saldo/movimientos → `OBAccount` /
   `OBBalance` / `OBTransaction`).
2. Asigna un `externalId` **determinístico** a cada transacción (para la dedup del pipeline).
3. Los adapters dependen de `BankPage`, no de Playwright → se testean con un fake (ver
   `__tests__/scraper.test.ts`). Mientras un método no esté hecho, lanza `PendingAdapterError`
   (un test parametrizado verifica que ningún esqueleto quede a medio implementar en silencio).

## Runbook — primera corrida de Santander (cuando Ignacio la desbloquee)

Prerrequisito: acceso a una cuenta Santander de PRUEBA (o la propia, asumiendo el riesgo de ToS).

1. **Capturar el flujo real** en el lab (`~/Documents/Personal/WeGroup/coda-scraper-lab`, Playwright):
   `node inspect.mjs` → login manual, y anotar para cada paso: URL, selectores de RUT/clave/submit,
   cómo se ve la pantalla MFA (`kind`: otp/push) y el dashboard post-login. Guardar HTML/screenshots.
2. **Preferir el API interno sobre el DOM**: Santander suele ser un SPA que trae saldos/movimientos
   por XHR en JSON. Inspeccionar la pestaña Red; si hay endpoints JSON estables, parsear esas
   respuestas (más robusto que raspar el DOM). El `BankPage` actual es DOM-only — si se va por API,
   ampliar la abstracción con un `waitForResponse`/lectura de red (mantener el desacople de Playwright).
3. **Completar `adapters/santander.ts`** método por método, reemplazando cada `PendingAdapterError`.
   Mapear cuenta→`OBAccount`, saldo→`OBBalance`, cada movimiento→`OBTransaction` con `externalId`
   determinístico (p. ej. hash de fecha+glosa+monto+cuenta) para la dedup.
4. **Implementar el `BrowserDriver` con Playwright** (fuera de estos módulos): `newPage()` devuelve
   una `Page` que satisface `BankPage`; `close()` cierra el browser. Correr LOCAL con el usuario
   presente (la MFA la resuelve `resolveMfa` mostrando el prompt y devolviendo el OTP/confirmación).
5. **Correr `scrapeAndIngest`** con `{ userId, adapter: new SantanderAdapter(), creds, resolveMfa,
   driver }`. Verificar que las cuentas/saldos/movimientos aterrizan en `accounts`/`balances`/
   `transactions` y que el resto (score, salud, PFM) los toma sin cambios.

Lo que necesito de Ignacio para empezar: (a) confirmar acceso a la cuenta de prueba, (b) correr el
paso 1 en su notebook (los selectores y la red solo se ven en vivo, y la IP residencial evita bloqueos).
