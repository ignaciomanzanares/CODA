import { describe, expect, it } from "vitest";
import type { NormalizedAccount, NormalizedTx } from "./normalizedTransactions.js";
import { computeNormalizedTransactionalScore } from "./normalizedTransactionalScore.js";

const account: NormalizedAccount = {
  id: 1,
  name: "Santander",
  type: "depository",
  subtype: "checking",
  status: "active",
};

function tx(overrides: Partial<NormalizedTx>): NormalizedTx {
  const amount = overrides.amount ?? 0;
  const postedAt = overrides.postedAt ?? "2025-06-10";
  return {
    id: overrides.id ?? `tx-${postedAt}-${amount}`,
    accountId: overrides.accountId ?? 1,
    postedAt,
    month: postedAt.slice(0, 7),
    day: Number(postedAt.slice(8, 10)),
    amount,
    cargo: amount < 0 ? Math.abs(amount) : 0,
    abono: amount > 0 ? amount : 0,
    tipo: amount >= 0 ? "ingreso" : "egreso",
    descripcion: overrides.descripcion ?? "Movimiento",
    description: overrides.description ?? overrides.descripcion ?? "Movimiento",
    categoria: overrides.categoria ?? "otro",
    category: overrides.category ?? overrides.categoria ?? "otro",
    isInternalTransfer: overrides.isInternalTransfer ?? false,
    is_internal_transfer: overrides.isInternalTransfer ? 1 : 0,
    accountName: "Santander",
    accountType: "depository",
    accountSubtype: "checking",
    product: "checking",
    productLabel: "Santander · Cuenta corriente",
  };
}

describe("computeNormalizedTransactionalScore", () => {
  it("usa transactions/accounts, excluye transferencias internas y conserva deficit real", () => {
    const result = computeNormalizedTransactionalScore(
      [account],
      [
        tx({ id: "income", amount: 4_000_000, descripcion: "Sueldo" }),
        tx({ id: "expense", amount: -5_200_000, descripcion: "Gastos del mes" }),
        tx({ id: "internal-out", amount: -1_000_000, descripcion: "Traspaso Internet a T. Crédito", isInternalTransfer: true }),
        tx({ id: "internal-in", amount: 1_000_000, descripcion: "MONTO CANCELADO", isInternalTransfer: true }),
      ],
    );

    expect(result).not.toBeNull();
    expect(result?.source).toBe("transactions_accounts");
    expect(result?.metrics?.totalIncome).toBe(4_000_000);
    expect(result?.metrics?.totalExpenses).toBe(5_200_000);
    expect(result?.metrics?.netBalance).toBe(-1_200_000);
    expect(result?.metrics?.expenseRatio).toBe(130);
    expect(result?.excludedInternalTransferCount).toBe(2);
    expect(result?.recommendedProducts).not.toContain("E001");
  });

  it("marca baja confianza cuando solo hay un mes de cartolas", () => {
    const result = computeNormalizedTransactionalScore(
      [account],
      [
        tx({ id: "income", amount: 1_000_000 }),
        tx({ id: "expense", amount: -300_000 }),
      ],
    );

    expect(result?.metrics?.observedMonths).toBe(1);
    expect(result?.metrics?.scoreConfidence).toBe("baja");
    expect(result?.mainInsights.some((insight) => insight.includes("Confianza baja"))).toBe(true);
  });
});
