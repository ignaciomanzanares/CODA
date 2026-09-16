import { describe, it, expect } from "vitest";
import { isSelfTransfer } from "../../src/services/documents/normalizeCartola.js";

const TITULAR = "ROJAS SOTO ANDRES";

describe("isSelfTransfer", () => {
  it("marca transferencia al propio titular (cuenta en otro banco)", () => {
    expect(isSelfTransfer("O.Gerencia 0123456789 Transf a ANDRES ROJAS", TITULAR)).toBe(true);
    expect(isSelfTransfer("Transf. Andres Rojas Soto", TITULAR)).toBe(true);
  });

  it("no marca a familiares que comparten un solo apellido", () => {
    expect(isSelfTransfer("Transf a SEBASTIAN . ROJAS", TITULAR)).toBe(false);
    expect(isSelfTransfer("Transf a JOSE ANDRE MUNOZ", TITULAR)).toBe(false);
  });

  it("no marca transferencias a terceros ni glosas sin transferencia", () => {
    expect(isSelfTransfer("Transf a CARLOS ALBERTO", TITULAR)).toBe(false);
    expect(isSelfTransfer("PAGO EN LINEA S.I.I.", TITULAR)).toBe(false);
    expect(isSelfTransfer("COM.MANT.PROD.OPC.CTA.CTE.", TITULAR)).toBe(false);
  });

  it("sin titular no marca nada", () => {
    expect(isSelfTransfer("Transf a ANDRES ROJAS", null)).toBe(false);
    expect(isSelfTransfer("Transf a ANDRES ROJAS", "")).toBe(false);
  });

  it("tolera acentos y puntuación en el nombre", () => {
    expect(isSelfTransfer("Transf. Martín Núñez Peña", "NUÑEZ PEÑA MARTIN")).toBe(true);
  });
});
