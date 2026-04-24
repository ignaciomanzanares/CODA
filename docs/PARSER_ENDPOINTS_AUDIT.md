# Parser Endpoints — Drift Audit

**Date:** 2026-04-24 (updated Batch 9.1)
**Commit:** (see git log)

## Current state: ONE endpoint, ONE parser, ONE format

All document uploads (cartola + CMF) go through a single endpoint:

| Endpoint | Cartola parser | CMF parser | Notes |
|----------|---------------|------------|-------|
| `POST /api/documents/upload` | `parseCartolaBuffer()` (hardened) | `parseCmfInformeDeudas()` | Single text-extract pass; sole upload path |
| `POST /api/documents/parse-cmf` | N/A | `parseCmfPdfBuffer()` | Standalone CMF parsing |
| `POST /api/scoring/calculate` | N/A (reads from DB) | N/A | No change needed |

`POST /api/documents/parse-cartola` was deleted in Batch 9 — all frontend
callers (Expenses, Movimientos, MultiFileDropzone, UniversalUploadDrawer)
now POST to `/api/documents/upload` with field name `document`.

## Upload pipeline

`processDocumentUpload()` in `documentUploadService.ts`:

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

## Storage format

All cartola data is stored in CartolaExtraida format (`{ abono, cargo }`).
The legacy ParseResult format (`{ tipo, monto }`) is no longer written to
the database. The dashboard endpoint (`/api/dashboard/summary`) reads only
`abono`/`cargo` fields — the dual-format fallback was removed in Batch 9.
