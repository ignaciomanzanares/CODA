# Parser Endpoints — Drift Audit

**Date:** 2026-04-23  
**Commit:** (see git log)

## Problem: two separate parser pipelines

Before this commit, document uploads went through two separate parser stacks
depending on which HTTP endpoint was used:

| Endpoint | Parser used | Confidence/tier | Reconciliation |
|----------|-------------|-----------------|----------------|
| `POST /api/documents/upload` (main UI) | `analyzePdfBuffer()` → `parseCartolaPdf()` | Second redundant call to `detectFormat()` | None |
| `POST /api/documents/parse-cartola` (scoring API) | `parseCartolaBuffer()` (hardened) | Included in ParseResult | Full, per-tx confidence |

This caused drift: the two paths produced different confidence metadata and
neither was consistent with the hardened pipeline's reconciliation results.

Additionally, `processDocumentUpload()` was calling `extractPdfText()` **twice**
for cartola uploads — once inside `analyzePdfBuffer()` and once again to get
the tier info via `detectFormat()`.

## Fix

`processDocumentUpload()` in `documentUploadService.ts` now uses a **single
extract-detect-parse pass**:

```
1. extractPdfText(buffer)          → text  (once, shared)
2. parseCmfInformeDeudas(text)     → CmfInformeDeudas | null
   If CMF detected: processCmfUpload() (unchanged logic, extracted to helper)
3. parseCartolaBuffer(buffer)      → ParseResult (hardened pipeline)
   • Format detection (detectFormat) + tier (getDetectionTier) — one pass
   • Per-transaction confidence
   • Balance reconciliation
   • ParseError propagated as user-readable error via e.messageEs
4. Convert ParseResult.transacciones → CartolaExtraida for SFA aggregation
   (cargo/abono fields, needed by cartolaToSfaTransactions)
5. Run SFA scoring engine, upsert transactional score, return result
   with detection_tier, banco_confidence, detected_banco from ParseResult
```

## Endpoints after consolidation

| Endpoint | Cartola parser | CMF parser | Notes |
|----------|---------------|------------|-------|
| `POST /api/documents/upload` | `parseCartolaBuffer()` ✅ | `parseCmfInformeDeudas()` ✅ | Single text-extract pass; sole upload path |
| `POST /api/documents/parse-cmf` | N/A | `parseCmfPdfBuffer()` | Unchanged |
| `POST /api/scoring/calculate` | N/A (reads from DB) | N/A | No change needed |

`POST /api/documents/parse-cartola` was deleted in Batch 9 Commit 1 — all frontend callers
(Expenses, Movimientos, MultiFileDropzone) now use `/api/documents/upload`.

## ParseResult → CartolaExtraida conversion

The SFA scoring engine expects `CartolaExtraida.transacciones` with
`{ cargo, abono }` fields. `ParseResult.transacciones` uses `{ tipo, monto }`.
Conversion at the point of aggregation:

```typescript
cargo: tx.tipo === 'cargo' ? tx.monto : 0,
abono: tx.tipo === 'abono' ? tx.monto : 0,
saldo: tx.saldo_despues,
```

This is lossless — no information is discarded.

## Files changed

- `apps/api/src/services/documents/documentUploadService.ts` — main consolidation
- Imports removed: `analyzePdfBuffer`, `extractPdfText` (no longer needed separately), `detectFormat`, `getDetectionTier`
- Imports added: `parseCmfInformeDeudas`, `parseCartolaBuffer`, `ParseError`
