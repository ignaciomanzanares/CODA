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
| `adapters/bancoEstado.ts` | Primer banco (esqueleto; se completa contra el sitio real) |

Falta (siguiente paso): el `BrowserDriver` concreto con **Playwright** (corre local, con el
usuario presente; aún no en el worker de Render).

## Cómo agregar / completar un banco

1. Implementa `BankAdapter` (login + MFA + parseo de cuentas/saldo/movimientos → `OBAccount` /
   `OBBalance` / `OBTransaction`).
2. Asigna un `externalId` **determinístico** a cada transacción (para la dedup del pipeline).
3. Los adapters dependen de `BankPage`, no de Playwright → se testean con un fake (ver
   `__tests__/scraper.test.ts`).
