# Parser Diagnostic — Santander Real Cartolas
**Date:** 2026-04-22  
**Run by:** Automated diagnostic script (`scripts/diagnose-santander.ts`)  
**Fixtures:** `apps/api/test/fixtures/cartolas/Santander/` (7 files)

---

## Summary of Findings

**0 / 7 fixtures passed the previous confidence threshold (≥ 0.85).**

Two distinct failure modes were identified:

| Mode | Fixtures | Root cause |
|------|----------|-----------|
| **Score 0.80** (2/4 patterns matched) | 6 of 7 | Only `BANCO SANTANDER` and `\bSANTANDER\b` matched; not enough for ≥ 0.85 with existing scoring |
| **Score 0.00** (0 patterns matched) | 1 of 7 (`cartola09-25.pdf`) | Bank name rendered as character-spaced text `"B A N C O  S A N T A N D E R  C H I L E"` — word-boundary regex `\bSANTANDER\b` does not match spaced characters |

---

## Per-File Results (pre-fix)

| File | Pages | Text len | Confidence | Tier | Bank name in text |
|------|-------|----------|-----------|------|-------------------|
| cartola01-26.pdf | 2 | 11,944 | 0.80 | FAIL | `Banco Santander Chile` (normal) |
| cartola02-26.pdf | 2 | 11,940 | 0.80 | FAIL | `Banco Santander Chile` (normal) |
| cartola10-25.pdf | 2 | 11,944 | 0.80 | FAIL | `Banco Santander Chile` (normal) |
| cartola12-25.pdf | 2 | 11,944 | 0.80 | FAIL | `Banco Santander Chile` (normal) |
| cartola-50.pdf   | 2 |  4,480 | 0.80 | FAIL | `BANCO SANTANDER` (normal) |
| cartola-50-1.pdf | 2 |  4,480 | 0.80 | FAIL | `BANCO SANTANDER` (normal) |
| cartola09-25.pdf | 2 |  4,786 | 0.00 | FAIL | `B A N C O  S A N T A N D E R  C H I L E` (spaced) |

---

## Root Cause Analysis

### Failure Mode 1 — Score 0.80 (6 fixtures)

The scoring algorithm starts at `0.70 × weight` and adds `+0.10` per additional matched pattern (capped at `+0.30`). With exactly **2 matched patterns** out of 4 (`BANCO SANTANDER` and `SANTANDER` both match the same token), the score lands at `0.70 + 0.10 = 0.80`.

The threshold was `0.85`, requiring at least 3 matches. The other two existing patterns (`santander.cl` and `ESTADO DE CUENTA CORRIENTE SANTANDER`) do not appear in these real PDFs.

**Fix:** Add Santander-specific structural patterns that appear reliably in all real PDFs:
- `CHEQUES Y CARGOS` / `CHEQUES Y OTROS CARGOS` — Santander column header
- `DEPOSITOS Y ABONOS` / `DEPOSITOS Y OTROS ABONOS` — Santander column header
- `Banco Santander Chile` — exact legal name
- `Saldo Inicial` / `Saldo Final` — section header unique to Santander layout
- CMF regulatory footer (`CMF` / `cmfchile.cl`)

With ≥ 3 new patterns matched, all 6 PDFs score `0.70 + 0.30 = 1.00` (HIGH tier).

### Failure Mode 2 — Score 0.00 (cartola09-25.pdf)

`pdf-parse` extracts the bank logo text as character-spaced individual letters:
```
B A N C O  S A N T A N D E R  C H I L E
```
The `requiredPattern` regex `\bSANTANDER\b` (word boundary) does not match `S A N T A N D E R` because each letter is a separate "word" in the extracted text. The detector discards the candidate immediately.

**Fix:** Apply text normalization before detection: collapse runs of single characters separated by spaces (e.g., `"B A N C O"` → `"BANCO"`). After normalization `B A N C O  S A N T A N D E R  C H I L E` becomes `BANCO SANTANDER CHILE`, which matches all relevant patterns.

Additionally, update `requiredPattern` for Santander to also match structural signals as a fallback:
```
/\bSANTANDER\b|Banco\s+Santander|CHEQUES\s+(?:Y\s+)?(?:OTROS\s+)?CARGOS/i
```

---

## Signals Present in All 7 Fixtures

Every fixture contains all of the following signals (verified after text normalization):

| Signal | Pattern | Notes |
|--------|---------|-------|
| `BANCO SANTANDER` | `/BANCO\s+SANTANDER/i` | After char-space normalization |
| `SANTANDER` | `/\bSANTANDER\b/i` | After normalization |
| `Banco Santander Chile` | `/Banco\s+Santander\s+Chile/i` | After normalization |
| `CHEQUES Y CARGOS` or `CHEQUES Y OTROS CARGOS` | `/CHEQUES\s+(?:Y\s+)?(?:OTROS\s+)?CARGOS/i` | Column header |
| `DEPOSITOS Y ABONOS` or similar | `/DEP[OÓ]SITOS?\s+(?:Y\s+)?(?:OTROS\s+)?ABONOS?/i` | Column header |
| `Saldo Inicial` | `/Saldo\s+Inicial/i` | Balance section |
| CMF regulatory footer | `/CMF\|cmfchile\.cl/i` | Chilean banking law |

With these 7 signals as patterns, all PDFs match ≥ 5 patterns → confidence = `0.70 + 0.30 = 1.00` (HIGH tier).

---

## Implemented Fixes

1. **Text normalization** (`normalizeForDetection`): collapses character-spaced text before all pattern matching. Also collapses duplicate whitespace.

2. **Expanded Santander pattern list**: adds 6 structural patterns unique to Santander's PDF layout.

3. **Updated `requiredPattern`**: accepts SANTANDER text OR Santander column header as qualifying signal.

4. **Strong-signal boost**: if ≥ 2 of {`BANCO SANTANDER`, `Banco Santander Chile`, CMF footer, column structure} are present, confidence is floored at `0.92`.

5. **Three-tier threshold system** (replaces single 0.85 threshold):
   - `HIGH` (≥ 0.90): parse silently → green checkmark UI
   - `MEDIUM` (0.70–0.89): parse + show review banner with "Revisar antes de continuar" CTA; each transaction's confidence is multiplied by `banco_confidence` to propagate uncertainty
   - `LOW` (< 0.70): reject as `FORMAT_UNKNOWN`

---

## Post-Fix Verification

All 7 fixtures score ≥ 0.90 (HIGH tier). See test results in `apps/api/test/parsers/santander.real.test.ts`.

---

## Excluded Fixtures

None. All 7 fixtures are genuine Santander cuenta vista / cuenta corriente statements.  
`cartola09-25.pdf` is a "Super Cuenta Vista" variant — different layout but same bank — it passes after normalization.
