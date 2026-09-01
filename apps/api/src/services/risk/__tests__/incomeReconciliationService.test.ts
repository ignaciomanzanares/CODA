import { describe, it, expect } from "vitest";
import { getIncomeReconciliationForUser } from "../incomeReconciliationService";

describe("getIncomeReconciliationForUser (DB) — sin datos", () => {
  it("usuario sin cuentas ni fuentes → reconciliación vacía, sin fuente", async () => {
    const r = await getIncomeReconciliationForUser(`no-data-${Date.now()}`);
    expect(r.monthlyClp).toBe(0);
    expect(r.chosenSource).toBeNull();
    expect(r.confidenceBySource).toHaveLength(0);
    expect(r.discrepancies).toHaveLength(0);
  });
});
