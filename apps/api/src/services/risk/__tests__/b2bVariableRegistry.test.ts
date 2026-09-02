import { describe, it, expect } from "vitest";
import {
  B2B_VARIABLE_REGISTRY,
  isLenderExposable,
  filterLenderExposable,
  lenderExposableVariables,
} from "../b2bVariableRegistry";

describe("b2bVariableRegistry — gobernanza de variables al prestador", () => {
  it("no hay ids duplicados", () => {
    const ids = B2B_VARIABLE_REGISTRY.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("toda variable tiene fundamento escrito", () => {
    for (const v of B2B_VARIABLE_REGISTRY) {
      expect(v.rationale.length).toBeGreaterThan(15);
    }
  });

  it("ningún atributo protegido ni proxy es exponible", () => {
    for (const v of B2B_VARIABLE_REGISTRY) {
      if (v.clazz === "protected" || v.clazz === "proxy_risk" || v.clazz === "internal") {
        expect(isLenderExposable(v.id)).toBe(false);
      }
    }
  });

  it("los atributos protegidos clásicos están registrados como bloqueados", () => {
    for (const id of ["edad", "genero", "comuna", "nacionalidad"]) {
      expect(isLenderExposable(id)).toBe(false);
    }
  });

  it("topCategoryShare (proxy) NO es exponible; los ratios de deuda SÍ", () => {
    expect(isLenderExposable("topCategoryShare")).toBe(false);
    expect(isLenderExposable("deudaFlujo")).toBe(true);
    expect(isLenderExposable("dti")).toBe(true);
  });

  it("filterLenderExposable es fail-closed (desconocida → fuera)", () => {
    const input = ["deudaFlujo", "topCategoryShare", "edad", "variableInventada", "dti"];
    expect(filterLenderExposable(input)).toEqual(["deudaFlujo", "dti"]);
  });

  it("lenderExposableVariables devuelve solo exposables", () => {
    expect(lenderExposableVariables().every((v) => v.clazz === "exposable")).toBe(true);
    expect(lenderExposableVariables().length).toBeGreaterThan(5);
  });
});
