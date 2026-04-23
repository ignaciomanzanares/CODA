# Chilean Number Format — Misparse Audit

**Date:** 2026-04-23  
**Commit:** (see git log)

## Root cause

Chilean monetary strings use **dot as the thousands separator** and comma (rare) as
the decimal separator:

| String       | Intended value   | `parseFloat()` result | `parseCLP()` result |
|--------------|------------------|-----------------------|---------------------|
| `"973.959"`  | 973 959 pesos    | **973.959** ❌        | 973959 ✅           |
| `"1.234.567"`| 1 234 567 pesos  | **1.234** ❌          | 1234567 ✅          |
| `"50.000,50"`| 50 000.50 pesos  | **50.000** ❌         | 50001 ✅            |

Using bare `parseFloat()` on a Chilean number string underestimates amounts by
**1 000×** for 4-digit amounts and more for larger numbers. This caused
`cartola09-25.pdf` reconciliation to fail (saldo_final parsed as 0 when the
PDF summary line concatenated amounts without spaces).

## Fix

Created `parseCLP(input: string | number): number` canonical utility in two locations:

- **Backend:** `apps/api/src/utils/clp.ts`
- **Frontend:** `apps/web/src/lib/clp.ts`

The utility:
1. Strips `$` and whitespace
2. Detects Chilean decimal comma (last `,` after last `.`) vs. thousands-only dots
3. Removes all dots, converts comma to dot, calls `parseFloat`, then `Math.round`

## Sites audited and fixed

### `apps/api/src/services/documents/pdfAnalysis.ts`

| Line | Before | After | Risk |
|------|--------|-------|------|
| 44   | `parseFloat(match[1].replace(/\./g,'').replace(/,/,'.')` | `parseCLP(match[1])` | Low — already stripped dots, but inconsistent |
| 47   | `parseFloat(num)` where `num` still had dots | `parseInt(num, 10)` (digits only in fallback) | **HIGH — actual bug** |
| 136  | `parseFloat(x.replace(/\./g,'').replace(',','.'))` | `parseCLP(x)` | Low |
| 140-141 | same pattern × 2 | `parseCLP(x)` | Low |
| 242  | `parseFloat(s.replace(/\./g,'').replace(',','.'))` via `parseChile()` | `parseCLP(s)` | Low |

### `apps/api/src/parsers/cmf-parser.ts`

| Before | After |
|--------|-------|
| Local `parseChileAmount()` (strip dots, parseFloat) | `const parseChileAmount = parseCLP` — alias, all 5 call sites updated |

### `apps/api/src/parsers/cartola-parser.ts`

| Before | After |
|--------|-------|
| Local `parseChileAmount()` (strip dots, parseFloat) | `const parseChileAmount = parseCLP` — alias, all call sites updated |

## Sites audited but NOT changed

| File | Pattern | Reason safe |
|------|---------|-------------|
| `notificationParser.ts:43-52` | Custom `parseAmount()` | Already handles all Chilean cases correctly with multi-branch logic |
| `ml/features.ts` | `parseFloat(String(t.amount))` | `amount` is a DB numeric stored as JS number or plain decimal string — no Chilean dots |
| `assistantContext.ts` | `parseFloat(a.balance.current)` | Balance from bank API — decimal US format (e.g. `"1234.56"`) |
| `routes-empresas.ts`, `routes-*.ts` | `parseInt(req.params.id)` | Row IDs, pagination params — not monetary strings |
| `ml/materialize_labeled.ts` | `parseFloat(parts[idx])` | Training CSV with dot-decimal floats — not CLP strings |

## Verification

```
npx vitest run test/parsers/clp.test.ts
# → 22 tests pass
```

Key assertion:
```typescript
expect(parseCLP("973.959")).toBe(973959);   // core bug case
expect(parseCLP("1.234.567")).toBe(1234567);
expect(parseCLP("50.000,50")).toBe(50001);
```
