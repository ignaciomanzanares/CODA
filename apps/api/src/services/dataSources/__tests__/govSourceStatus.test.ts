import { describe, it, expect } from "vitest";
import { toGovSourceStatus } from "../govSourceService.js";

/**
 * `raw_data` lo escribe cada parser a su manera y se guarda como texto: la UI no puede confiar
 * en que sea JSON, ni en que traiga folio. Lo que NO puede pasar es que una fila rara rompa la
 * pantalla de "Conecta tus datos".
 */
const base = {
  source: "afc",
  verifiedMonthlyIncomeClp: 850_000,
  fiscalDebtClp: null,
  contributionMonths: 18,
  extractedAt: "2026-09-18T12:00:00.000Z",
};

describe("toGovSourceStatus", () => {
  it("expone folio y validador cuando el parser los capturó", () => {
    const status = toGovSourceStatus({
      ...base,
      rawData: JSON.stringify({
        documento: "cotizaciones",
        folio: "AFC-123456",
        validador: "https://servicios.afc.cl/validador-documentos/",
      }),
    });
    expect(status).toMatchObject({
      source: "afc",
      folio: "AFC-123456",
      validador: "https://servicios.afc.cl/validador-documentos/",
      contributionMonths: 18,
    });
  });

  it("sin folio (AFP/SII/TGR hoy) devuelve null, no undefined ni basura", () => {
    expect(
      toGovSourceStatus({ ...base, source: "sii", rawData: JSON.stringify({ f22: 1 }) }),
    ).toMatchObject({
      folio: null,
      validador: null,
    });
  });

  it("un raw_data que no es JSON usable no rompe nada", () => {
    for (const rawData of ["", "no-json{", "null", '"texto"', undefined, 42]) {
      expect(toGovSourceStatus({ ...base, rawData }).folio).toBeNull();
    }
  });

  it("un folio vacío o en blanco cuenta como ausente", () => {
    expect(
      toGovSourceStatus({ ...base, rawData: JSON.stringify({ folio: "   " }) }).folio,
    ).toBeNull();
    expect(
      toGovSourceStatus({ ...base, rawData: JSON.stringify({ folio: 12345 }) }).folio,
    ).toBeNull();
  });
});
