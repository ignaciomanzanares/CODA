# Integración SFA (Sistema de Finanzas Abiertas — CMF Chile)

Prepara a CODA para la entrada en vigencia del SFA (Ley 21.521; NCG 514 modificada por **NCG 569
del 1-jun-2026**, Anexo Técnico N°3). Vigencia escalonada desde ~julio 2026.

## Rol de CODA

CODA es **PSBI** (Proveedor de Servicios Basados en Información) = lado **consumidor**. Los
**Data Holders** (bancos, emisores) están obligados a *exponer* el JSON; CODA lo **consume**.
Por eso el trabajo es adoptar el modelo de datos del SFA internamente, de modo que:
- las cartolas PDF se normalicen hacia ese modelo hoy (`sfaMapper` interno→SFA), y
- el conector SFA real (`SfaProvider implements OBProvider`) caiga en el mismo modelo OB que ya
  alimenta `normalizeCartola`/scoring (`fromSfaTransaction` SFA→interno), sin reescribir nada.

## Estándares confirmados

- Transporte: **REST + JSON**, **OpenAPI 3.1**, esquemas bajo **ISO 20022**, seguridad **FAPI 2.0**.
- Headers: `Authorization` (Bearer), `x-fapi-interaction-id` (UUID), `x-jws-signature` (JWS).
- Paginación: `page`/`pageSize` (default 25, máx 1000). Rango: `fromDate`/`toDate` (YYYY-MM-DD).
- **Montos**: `amount` número positivo (sin signo) + `currency` ISO 4217 aparte. Decimales por
  moneda: **CLP=0 (entero)**, USD=2, CLF/UF=4. Signo vía `transactionType`.
- **`transactionType`**: enum español **`"Débito"`** (salida) / **`"Crédito"`** (entrada).
- Fechas: **ISO 8601 UTC** (`bookingDateTime`).
- Envelope: `data.transactions[]` + `links{self,next,prev}` + `meta{totalRecords,totalPages}`.

## Estado

| Pieza | Estado |
|---|---|
| Schema de **movimientos** (cuentas/tarjetas/créditos comparten el mismo) | ✅ confirmado → `sfaTypes.ts` |
| Mapper interno↔SFA de movimientos + envelope + paginación | ✅ `sfaMapper.ts` (+6 tests, round-trip vs ejemplo oficial) |
| Endpoint diagnóstico `GET /api/profile/accounts/:id/transactions-sfa` | ✅ |
| Catálogo de endpoints (cuentas/tarjetas/créditos) | ✅ `sfaEndpoints.ts` |
| Schema de **saldos** (cuenta/crédito), **cupo** de tarjeta, **datos generales** de préstamo | ⏳ pendiente: el portal no expone el field-level por REST (macro Swagger). Falta ejemplo oficial de respuesta para `GET /loans/{id}`, `/loans/{id}/balance`, `/accounts/{ccID}/limit`. |
| Conector SFA real (`SfaProvider implements OBProvider` + OAuth2/PKCE/mTLS, JWS) | ⏳ requiere registro ante CMF + sandbox |

## Próximo paso (para los schemas pendientes)

Pegar desde el Swagger del portal (espacio OFAC) los ejemplos de respuesta de:
- `GET /loans/{loanID}` y `GET /loans/{loanID}/balance` (clave para el evaluador de riesgo CMF).
- `GET /accounts/{creditCardAccountID}/balance` y `/limit`.

Con eso se extiende `sfaTypes.ts`/`sfaMapper.ts` a esos productos sin inventar nombres de campo.
