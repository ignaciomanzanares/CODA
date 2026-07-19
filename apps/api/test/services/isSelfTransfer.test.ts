import { describe, it, expect } from "vitest";
import { isSelfTransfer } from "../../src/services/documents/normalizeCartola.js";

const TITULAR = "SCHMIDT PUGA THOMAS";

describe("isSelfTransfer", () => {
  it("marca transferencia al propio titular (cuenta en otro banco)", () => {
    expect(isSelfTransfer("O.Gerencia 0123456789 Transf a THOMAS SCHMIDT", TITULAR)).toBe(true);
    expect(isSelfTransfer("Transf. Thomas Schmidt Puga", TITULAR)).toBe(true);
  });

  it("no marca a familiares que comparten un solo apellido", () => {
    expect(isSelfTransfer("Transf a SEBASTIAN . SCHMIDT", TITULAR)).toBe(false);
    expect(isSelfTransfer("Transf a JOSE TOMAS SAPHORES", TITULAR)).toBe(false);
  });

  it("no marca transferencias a terceros ni glosas sin transferencia", () => {
    expect(isSelfTransfer("Transf a WLADIMIR ALEJANDRO", TITULAR)).toBe(false);
    expect(isSelfTransfer("PAGO EN LINEA S.I.I.", TITULAR)).toBe(false);
    expect(isSelfTransfer("COM.MANT.PROD.OPC.CTA.CTE.", TITULAR)).toBe(false);
  });

  it("sin titular no marca nada", () => {
    expect(isSelfTransfer("Transf a THOMAS SCHMIDT", null)).toBe(false);
    expect(isSelfTransfer("Transf a THOMAS SCHMIDT", "")).toBe(false);
  });

  it("tolera acentos y puntuación en el nombre", () => {
    expect(isSelfTransfer("Transf. Tomás Núñez Vera", "NUÑEZ VERA TOMAS")).toBe(true);
  });
});
