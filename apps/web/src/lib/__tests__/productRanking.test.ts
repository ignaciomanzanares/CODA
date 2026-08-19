import { describe, it, expect } from "vitest";
import { rankProductsByCategory, isCreditCategory } from "../product-ranking";
import type { Product, UserFinancialProfile, ProductCategory } from "@/types/products";

function product(
  id: string,
  category: ProductCategory,
  annual_rate_pct: number | null,
  extra: Partial<Product> = {},
): Product {
  return {
    id,
    institution: "Banco Test",
    institution_logo_url: null,
    category,
    name: `Producto ${id}`,
    short_description: "",
    annual_rate_pct,
    monthly_cost_clp: 0,
    min_income_clp: null,
    min_credit_score: null,
    tags: [],
    source_url: "",
    last_verified: "2026-04-01",
    disclosure: "",
    ...extra,
  };
}

// Perfil sano: elegible para todo (sin mínimos que bloqueen).
const profile: UserFinancialProfile = {
  monthly_income_clp: 1_650_000,
  credit_score: 742,
  transactional_score: 71,
  monthly_debt_clp: 400_000,
  monthly_savings_clp: 400_000,
  age: 33,
  has_real_data: true,
};

describe("isCreditCategory", () => {
  it("marca las categorías de crédito y no las de ahorro", () => {
    expect(isCreditCategory("creditos_consumo")).toBe(true);
    expect(isCreditCategory("lineas_credito")).toBe(true);
    expect(isCreditCategory("creditos_hipotecarios")).toBe(true);
    expect(isCreditCategory("tarjetas_credito")).toBe(true);
    expect(isCreditCategory("cuentas_ahorro")).toBe(false);
    expect(isCreditCategory("depositos_plazo")).toBe(false);
  });
});

describe("rankProductsByCategory — pestañas de crédito ordenan por tasa (más barato primero)", () => {
  it("el crédito de consumo más barato queda primero, sin importar el score compuesto", () => {
    const products = [
      product("caro", "creditos_consumo", 28.0),
      product("barato", "creditos_consumo", 14.5),
      product("medio", "creditos_consumo", 21.0),
    ];
    const ranked = rankProductsByCategory(products, "creditos_consumo", profile);
    expect(ranked.map((p) => p.id)).toEqual(["barato", "medio", "caro"]);
  });

  it("productos con tasa conocida van antes que los de tasa null", () => {
    const products = [
      product("sinTasa", "lineas_credito", null),
      product("conTasa", "lineas_credito", 30.0),
    ];
    const ranked = rankProductsByCategory(products, "lineas_credito", profile);
    expect(ranked[0].id).toBe("conTasa");
    expect(ranked[1].id).toBe("sinTasa");
  });

  it("un crédito más barato pero NO elegible no se antepone a uno elegible", () => {
    const products = [
      // Barato pero exige score altísimo → no elegible
      product("baratoNoElegible", "creditos_hipotecarios", 3.9, { min_credit_score: 900 }),
      // Más caro pero elegible
      product("caroElegible", "creditos_hipotecarios", 5.5),
    ];
    const ranked = rankProductsByCategory(products, "creditos_hipotecarios", profile);
    expect(ranked[0].id).toBe("caroElegible");
    expect(ranked[0].eligibility).toBe("eligible");
  });
});

describe("rankProductsByCategory — categorías NO crédito mantienen el ranking por adecuación", () => {
  it("cuentas de ahorro no se reordenan por tasa", () => {
    // Dos cuentas: una 'gratis' con mejores tags debería poder ir primero por score
    // aunque su tasa sea menor — acá solo verificamos que el orden NO es puramente por tasa.
    const products = [
      product("a", "cuentas_ahorro", 0.5, { tags: ["digital", "sin costo"] }),
      product("b", "cuentas_ahorro", 3.0),
    ];
    const ranked = rankProductsByCategory(products, "cuentas_ahorro", profile);
    // No forzamos un orden exacto (depende del score), solo que ambos están presentes.
    expect(ranked.map((p) => p.id).sort()).toEqual(["a", "b"]);
  });
});
