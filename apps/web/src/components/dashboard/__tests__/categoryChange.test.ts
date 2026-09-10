import { describe, it, expect } from "vitest";
import { categoryChange } from "../DashboardTextInsights";

describe("categoryChange", () => {
  it("usa porcentaje cuando informa", () => {
    const c = categoryChange(150_000, 100_000);
    expect(c?.pct).toBe(50);
    expect(c?.phrase).toBe("subió un 50%");
  });

  it("dice 'bajó' con el signo correcto", () => {
    const c = categoryChange(80_000, 100_000);
    expect(c?.pct).toBe(-20);
    expect(c?.deltaClp).toBe(-20_000);
    expect(c?.phrase).toBe("bajó un 20%");
  });

  it("pasa a pesos cuando el salto es enorme (el caso '+3.484%')", () => {
    // Gastos Personales: $290.000 → $10.431.801. El porcentaje es cierto e inútil.
    const c = categoryChange(10_431_801, 290_000);
    expect(c?.pct).toBeGreaterThan(3000);
    expect(c?.phrase).not.toContain("%");
    expect(c?.phrase).toContain("subió");
  });

  it("pasa a pesos cuando la base del mes anterior es ínfima", () => {
    // $3.000 → $150.000 daría "+4.900%": técnicamente correcto, comunicativamente nulo.
    const c = categoryChange(150_000, 3_000);
    expect(c?.phrase).not.toContain("%");
  });

  it("devuelve null cuando no hay base con la que comparar", () => {
    expect(categoryChange(150_000, null)).toBeNull();
    expect(categoryChange(150_000, 0)).toBeNull();
  });

  it("un cambio grande pero por debajo del corte sigue en porcentaje", () => {
    const c = categoryChange(250_000, 100_000); // +150%, bajo el máximo de 200%
    expect(c?.phrase).toBe("subió un 150%");
  });
});
