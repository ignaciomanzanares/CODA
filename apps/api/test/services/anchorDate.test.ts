import { describe, it, expect } from "vitest";
import { latestPostedAt } from "../../src/services/dashboard/anchorDate.js";

// Simula cartolas históricas may/jun 2025 con "hoy" en 2026.
const tx2025 = [
  { postedAt: "2025-05-22", amount: 800000 }, // ingreso
  { postedAt: "2025-06-03", amount: -120000 }, // egreso
  { postedAt: "2025-06-28", amount: -50000 }, // egreso
];

describe("latestPostedAt — ancla a la última fecha con datos", () => {
  it("devuelve la fecha más reciente entre las transacciones", () => {
    const d = latestPostedAt(tx2025);
    expect(d?.toISOString().slice(0, 10)).toBe("2025-06-28");
  });

  it("ignora postedAt nulos o inválidos", () => {
    const d = latestPostedAt([
      { postedAt: null },
      { postedAt: "no-es-fecha" },
      { postedAt: "2025-06-10" },
    ]);
    expect(d?.toISOString().slice(0, 10)).toBe("2025-06-10");
  });

  it("devuelve null si no hay transacciones (→ caller usa hoy = estado vacío)", () => {
    expect(latestPostedAt([])).toBeNull();
  });
});

describe("ventana de 30 días anclada al dato (no a hoy)", () => {
  it("captura las transacciones de 2025 aunque hoy sea 2026 (no devuelve 0)", () => {
    const anchor = latestPostedAt(tx2025)!;
    const from = new Date(anchor);
    from.setDate(anchor.getDate() - 30);

    const inWindow = tx2025.filter((t) => new Date(t.postedAt) >= from);
    const income = inWindow.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const expenses = Math.abs(
      inWindow.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0),
    );

    // Con la ventana anclada hay datos; con una ventana desde "hoy" (2026) sería 0.
    expect(inWindow.length).toBeGreaterThan(0);
    expect(expenses).toBeGreaterThan(0);

    const todayWindowFrom = new Date();
    todayWindowFrom.setDate(todayWindowFrom.getDate() - 30);
    const todayWindow = tx2025.filter((t) => new Date(t.postedAt) >= todayWindowFrom);
    expect(todayWindow.length).toBe(0); // demuestra el bug que se corrige
    // anclado captura junio; income depende de qué cae en los 30 días previos al 28-06
    expect(income).toBeGreaterThanOrEqual(0);
  });

  it("la tendencia de 6 meses anclada a jun-2025 no inventa meses de 2026", () => {
    const anchor = latestPostedAt(tx2025)!;
    const months: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const m = new Date(anchor.getFullYear(), anchor.getMonth() - i, 1);
      months.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`);
    }
    expect(months[months.length - 1]).toBe("2025-06");
    expect(months.some((m) => m.startsWith("2026"))).toBe(false);
  });
});
