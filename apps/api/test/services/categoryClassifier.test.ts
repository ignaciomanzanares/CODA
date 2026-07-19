import { describe, it, expect, beforeEach } from "vitest";
import {
  categoryClassifier,
  classifyOrRule,
} from "../../src/services/documents/categoryClassifier.js";

describe("categoryClassifier — guardas contra modelos degenerados", () => {
  beforeEach(() => categoryClassifier.reset());

  it("un modelo mono-clase NO predice (cede a las reglas)", () => {
    // Regresión: un blob envenenado con 8 ejemplos, todos 'transporte', hacía que
    // el softmax diera confianza 1.0 a 'transporte' para cualquier glosa, pisando
    // el fallback de reglas y arrastrando TODOS los movimientos a transporte.
    for (let i = 0; i < 8; i++) categoryClassifier.learn(`GLOSA DISTINTA ${i}`, "transporte");
    expect(categoryClassifier.predict("PAGO EN LINEA S.I.I.")).toBeNull();
    expect(classifyOrRule("PAGO EN LINEA S.I.I.", "impuestos")).toBe("impuestos");
  });

  it("con ≥2 clases y suficientes ejemplos sí discrimina", () => {
    for (let i = 0; i < 4; i++) categoryClassifier.learn(`UBER VIAJE ${i}`, "transporte");
    for (let i = 0; i < 4; i++) categoryClassifier.learn(`JUMBO SUPERMERCADO ${i}`, "supermercado");
    const pred = categoryClassifier.predict("UBER VIAJE centro");
    expect(pred?.category).toBe("transporte");
  });

  it("bajo el mínimo de ejemplos no predice", () => {
    categoryClassifier.learn("UBER", "transporte");
    categoryClassifier.learn("JUMBO", "supermercado");
    expect(categoryClassifier.predict("UBER")).toBeNull();
  });
});
