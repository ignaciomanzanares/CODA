/**
 * Task 1 — card statements ride the Movimientos pipeline.
 *
 * Verifies parseCardStatementText adapts the TC parsers to ParseResult:
 *   - CLP purchases → cargo (salida), summing to the statement total;
 *   - payments (MONTO CANCELADO) → abono flagged es_transferencia, and caught by
 *     the Task-4 isInternalTransfer so the funding transfer nets;
 *   - USD purchases → cargo with CLP converted via an injected getUsd.
 * Uses the redacted .txt fixtures (raw PDFs never committed).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  parseCardStatementText,
  BANCO_TC_NACIONAL,
  BANCO_TC_INTERNACIONAL,
} from "../../src/parsers/cardStatementAdapter.js";
import { isInternalTransfer } from "../../src/services/assistantContext.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fxDir = join(__dirname, "../fixtures/cartolas/Santander");
const load = (n: string) => readFileSync(join(fxDir, n), "utf8");
const has = (n: string) => existsSync(join(fxDir, n));

describe("card statement → ParseResult adapter", () => {
  const OCT = "tc-nacional-oct25.txt";
  (has(OCT) ? it : it.skip)(
    "CLP: purchases become cargos summing to $596.864; payments netted",
    async () => {
      const r = await parseCardStatementText(load(OCT));
      expect(r).not.toBeNull();
      expect(r!.banco).toBe(BANCO_TC_NACIONAL);

      const cargos = r!.transacciones.filter((t) => t.tipo === "cargo");
      expect(cargos.length).toBe(11);
      expect(cargos.every((t) => t.es_compra)).toBe(true);
      expect(r!.total_cargos).toBe(596_864);

      // COOPEUCH is a real recurring expense, kept as a cargo (not netted).
      const coopeuch = cargos.find((t) => /COOPEUCH/i.test(t.descripcion));
      expect(coopeuch).toBeTruthy();
      expect(isInternalTransfer({ description: coopeuch!.descripcion })).toBe(false);
      expect(coopeuch!.es_pago_recurrente).toBe(true);
    },
  );

  const MAR = "tc-internacional-2026-03.txt";
  (has(MAR) ? it : it.skip)(
    "USD: purchases convert to CLP via injected getUsd; payments tagged internal",
    async () => {
      const rate = 950;
      const r = await parseCardStatementText(load(MAR), async () => rate);
      expect(r).not.toBeNull();
      expect(r!.banco).toBe(BANCO_TC_INTERNACIONAL);

      const cargos = r!.transacciones.filter((t) => t.tipo === "cargo");
      expect(cargos.length).toBeGreaterThan(0);
      // Converted CLP ≈ 2276.25 USD × 950 (per-row rounding → small tolerance).
      expect(r!.total_cargos).toBeGreaterThan(2276.25 * rate - cargos.length);
      expect(r!.total_cargos).toBeLessThan(2276.25 * rate + cargos.length);

      // MONTO CANCELADO rows are abonos flagged internal → isInternalTransfer nets them.
      const pagos = r!.transacciones.filter((t) => /MONTO CANCELADO/i.test(t.descripcion));
      expect(pagos.length).toBeGreaterThan(0);
      expect(pagos.every((t) => t.tipo === "abono" && t.es_transferencia)).toBe(true);
      expect(pagos.every((t) => isInternalTransfer({ description: t.descripcion }))).toBe(true);
    },
  );

  (has(MAR) ? it : it.skip)(
    "USD: fx unavailable → never blocks, flags FX pendiente, monto CLP 0",
    async () => {
      const r = await parseCardStatementText(load(MAR), async () => null);
      expect(r).not.toBeNull();
      expect(r!.warnings.some((w) => /FX pendiente/i.test(w))).toBe(true);
      const cargos = r!.transacciones.filter((t) => t.tipo === "cargo");
      expect(cargos.every((t) => t.monto === 0 && /FX pendiente/i.test(t.descripcion))).toBe(true);
    },
  );

  it("non-card text returns null (falls through to bank detection)", async () => {
    expect(await parseCardStatementText("ESTADO CUENTA VISTA Santander cartola ...")).toBeNull();
  });
});
