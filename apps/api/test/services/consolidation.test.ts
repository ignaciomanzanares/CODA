/**
 * Task 4 — unified entrada/salida consolidation.
 *
 * Proves the extended isInternalTransfer nets own-product plumbing (checking→card
 * funding + FX) against the card payment, while keeping real consumption once:
 * card merchant purchases AND the recurring PAGO COOPEUCH mortgage charge.
 */
import { describe, it, expect } from "vitest";
import { isInternalTransfer } from "../../src/services/assistantContext.js";

type Tx = { description: string; amount: number; category?: string };

// One representative month, mixing checking (CC) and card (TC) movements that
// would land in the same Movimientos store.
const MONTH: Tx[] = [
  { description: "Pago Sueldo Empresa SpA", amount: 2_500_000 }, // real income
  { description: "Jumbo Bilbao", amount: -85_000 }, // real expense (CC)
  // ── internal plumbing (must net to zero) ──
  { description: "Agustinas Traspaso Internet a T. Crédito", amount: -478_746 }, // CC → card funding
  { description: "Agustinas Egreso por Compra de Divisas", amount: -390_139 }, // CC → USD card FX
  { description: "MONTO CANCELADO", amount: 478_746 }, // card payment (other leg)
  { description: "ABONO DE DIVISAS", amount: 390_139 }, // USD card FX (other leg)
  // ── real card consumption (must stay, once each) ──
  { description: "PAGO COOPEUCH", amount: -482_053 }, // mortgage dividend — REAL
  { description: "STA ISABEL PROV BILBAO", amount: -33_400 }, // card purchase — REAL
  { description: "OPENAI *CHATGPT SUBSCR", amount: -22_830 }, // USD card purchase (CLP) — REAL
];

function flow(txs: Tx[]) {
  const inflow = txs.filter((t) => t.amount > 0).reduce((a, t) => a + t.amount, 0);
  const outflow = Math.abs(txs.filter((t) => t.amount < 0).reduce((a, t) => a + t.amount, 0));
  return { inflow, outflow };
}

describe("unified flow consolidation", () => {
  it("classifies internal plumbing vs real consumption correctly", () => {
    const internal = MONTH.filter((t) => isInternalTransfer(t)).map((t) => t.description);
    expect(internal).toEqual([
      "Agustinas Traspaso Internet a T. Crédito",
      "Agustinas Egreso por Compra de Divisas",
      "MONTO CANCELADO",
      "ABONO DE DIVISAS",
    ]);

    // Real consumption is NOT netted — especially the COOPEUCH mortgage.
    for (const keep of [
      "PAGO COOPEUCH",
      "STA ISABEL PROV BILBAO",
      "OPENAI *CHATGPT SUBSCR",
      "Pago Sueldo Empresa SpA",
      "Jumbo Bilbao",
    ]) {
      expect(isInternalTransfer({ description: keep })).toBe(false);
    }
  });

  it("nets the card-funding transfer and keeps card purchases once", () => {
    const before = flow(MONTH);
    const after = flow(MONTH.filter((t) => !isInternalTransfer(t)));

    console.log(`BEFORE  inflow=${before.inflow} outflow=${before.outflow}`);

    console.log(`AFTER   inflow=${after.inflow} outflow=${after.outflow}`);

    // Before: plumbing inflates both sides.
    expect(before.inflow).toBe(2_500_000 + 478_746 + 390_139);
    expect(before.outflow).toBe(85_000 + 478_746 + 390_139 + 482_053 + 33_400 + 22_830);

    // After: only real income in, only real consumption out.
    expect(after.inflow).toBe(2_500_000);
    expect(after.outflow).toBe(85_000 + 482_053 + 33_400 + 22_830); // = 623_283

    // The card-funding transfer (478_746) is fully netted (both legs gone).
    expect(before.outflow - after.outflow).toBe(478_746 + 390_139);
    // COOPEUCH counted exactly once.
    expect(
      MONTH.filter((t) => /COOPEUCH/.test(t.description) && !isInternalTransfer(t)),
    ).toHaveLength(1);
  });
});
