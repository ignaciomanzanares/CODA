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
| Schema de **operaciones de crédito** (datos generales + saldo, con mora) | ✅ confirmado → `SfaLoan`/`SfaLoanBalance` + `fromSfaLoan`/`aggregateCreditSignals` |
| Schema de **saldo de cuenta** | ✅ `SfaAccountBalance` + `fromSfaAccountBalance` (⚠️ `amount` STRING aquí) |
| Schema de **tarjeta de crédito** (balance + cupo) | ✅ `SfaCreditCardBalance`/`SfaCreditCardLimit` + `fromSfaCreditCard` (deuda + utilización) |
| Schema de **inversiones** → activos del usuario | ✅ `SfaInvestment`/`SfaInvestmentBalance` + `fromSfaInvestment` → `userAssets` |
| Conector SFA real (`SfaProvider implements OBProvider` + OAuth2/PKCE/mTLS, JWS) | ⏳ requiere registro ante CMF + sandbox |

### ⚠️ Inconsistencia de tipo en `amount` (confirmada)

El tipo del monto **varía por endpoint**: en **saldo de cuenta** viene como **string** (`"120000"`);
en movimientos, créditos, tarjeta e inversiones viene como **número** (`120000`). El mapper usa
`parseAmount()` (acepta string o número) en todos los saldos para no romperse con la diferencia.

## Operaciones de crédito → evaluador de riesgo

`fromSfaLoan(loan, balance)` produce una `CreditOperation` interna; `aggregateCreditSignals` la
reduce a `{ deudaTotal, tieneDeuda, tieneMora, porTipo }`. **Esto es lo que estaba bloqueado**:
el SFA entrega deuda chilena real en el feature space del CMF (tipo, monto, mora vía
`accruedLateInterest`), así que el evaluador de riesgo podrá correr sobre datos SFA en vivo
—no solo sobre el PDF CMF subido— cuando el conector esté operativo.

> Nota de granularidad: el balance del SFA trae `accruedLateInterest` (señal de mora) pero NO
> los buckets de atraso 30/60/90 del informe CMF. `tieneMora` se deriva de
> `accruedLateInterest > 0` o `status='MOROSO'`; los buckets finos siguen viniendo solo del PDF CMF.

## Inversiones → activos (userAssets)

`fromSfaInvestment(investment, balance)` produce un `AssetPosition`
(`{ productId, type, name, estimatedValueClp, currency }`) alineado a `userAssets`, usando el
valor actual del balance (`currentBalance.amount`) y cayendo a `instrumentData.stockInvestment`.
Permite poblar el patrimonio del usuario desde el SFA, que alimenta el motor de salud financiera.

## Estado: núcleo SFA completo

Cubiertos con schema confirmado contra ejemplos oficiales: movimientos (cuentas/tarjetas/
créditos), operaciones de crédito (loan+balance), saldo de cuenta, tarjeta (balance+cupo) e
inversiones (detalle+balance). Pendiente solo el conector real (OAuth2/PKCE/mTLS + registro CMF).
