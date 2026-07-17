/**
 * Reglas del categorizador ampliadas con comercios observados en cartolas
 * reales (2026-07): prefijos PSP, peajes/bencineras, líneas del estado de TC
 * (IMPUESTOS/INTERESES), botillerías, heladerías, aerolíneas extranjeras.
 */
import { describe, it, expect } from "vitest";
import { categorize, normalizeMerchant } from "../../src/parsers/merchantCategorizer.js";

function cat(descripcion: string, tipo: "cargo" | "abono" = "cargo") {
  return categorize({ descripcion, monto: 10_000, tipo }).category;
}

describe("normalizeMerchant — prefijos PSP nuevos", () => {
  it("quita TUU*/PAYSCAN*/NYA* dejando el comercio real", () => {
    expect(normalizeMerchant("TUU*PARQUEMAHUIDA")).toBe("PARQUEMAHUIDA");
    expect(normalizeMerchant("PAYSCAN*ADMINISTRACION")).toBe("ADMINISTRACION");
    expect(normalizeMerchant("NYA*SINGH SOLUTIONS GM")).toBe("SINGH SOLUTIONS GM");
  });
});

describe("reglas nuevas por comercio", () => {
  it("líneas del estado de TC: IMPUESTOS e INTERESES", () => {
    expect(cat("IMPUESTOS")).toBe("Impuestos y servicios públicos");
    expect(cat("INTERESES")).toBe("Comisiones bancarias");
  });

  it("bencineras/peajes: PRONTO (Copec) es combustible", () => {
    expect(cat("PRONTO LIBERTADORES")).toBe("Combustible");
    expect(cat("PRONTO RUTA PTE")).toBe("Combustible");
  });

  it("transporte: Bolt y parking SABA", () => {
    expect(cat("BOLT.EU/R/ TALLINN")).toBe("Transporte");
    expect(cat("SABA ARAUCO")).toBe("Transporte");
  });

  it("botillería y almacén → Supermercado y almacén", () => {
    expect(cat("SUMUP * BOTILLERIA MAR")).toBe("Supermercado y almacén");
    expect(cat("MERPAGO*LIQUIDOS")).toBe("Supermercado y almacén");
  });

  it("heladería/dulcería → Restaurantes y delivery", () => {
    expect(cat("HELADERIA ROMAGNA")).toBe("Restaurantes y delivery");
    expect(cat("DULCERIA MONTOLIN")).toBe("Restaurantes y delivery");
  });

  it("aerolíneas extranjeras → Transporte (regla cl.transporte.aereo)", () => {
    expect(cat("AIR CANADA FRANKFURT")).toBe("Transporte");
  });

  it("retail: Decathlon", () => {
    expect(cat("DECATHLON OPEN KENNEDY")).toBe("Retail y compras");
  });
});
