/**
 * Fix: transferencias internas mal categorizadas (pagos de tarjeta como ingreso).
 *
 * - merchantCategorizer: MONTO CANCELADO / DIVISAS / TRASPASO|PAGO a T. Crédito /
 *   TRASPASO DEUDA → 'Transferencia interna' (jamás 'Ingresos' ni un gasto).
 * - isInternalTransferTx: true por glosa, por flag es_transferencia y por la
 *   categoría persistida 'Transferencia interna'. "Transf a <persona>" se cuenta.
 */
import { describe, it, expect } from "vitest";
import { categorize } from "../../src/parsers/merchantCategorizer.js";
import { isInternalTransferTx } from "../../src/services/assistantContext.js";

describe("merchantCategorizer — transferencias internas (máxima prioridad)", () => {
  const internas = [
    "MONTO CANCELADO",
    "ABONO DE DIVISAS",
    "COMPRA DE DIVISAS",
    "Egreso por Compra de Divisas",
    "Traspaso Internet a T. Crédito",
    "PAGO T. CREDITO",
    "Traspaso Deuda Nacional",
    "Traspaso Deuda Internacional",
    // Glosas reales del estado Santander: con "DE"/"A" y truncadas a 30 chars.
    // Son el PAR de la consolidación de deuda (sale de nacional, entra a USD).
    "TRASPASO DE DEUDA INTERNACIO",
    "TRASPASO A DEUDA NACIONAL",
  ];

  for (const desc of internas) {
    it(`"${desc}" → Transferencia interna (no ingreso ni gasto)`, () => {
      const r = categorize({ descripcion: desc, monto: 478_746, tipo: "abono" });
      expect(r.category).toBe("Transferencia interna");
      expect(r.excluded).toBe(true);
    });
  }

  it("MONTO CANCELADO NO cae en Ingresos aunque sea un abono grande", () => {
    const r = categorize({ descripcion: "MONTO CANCELADO", monto: 1_500_000, tipo: "abono" });
    expect(r.category).not.toBe("Ingresos");
    expect(r.category).toBe("Transferencia interna");
  });

  it('"Transf a Juan Pérez" sigue siendo transferencia a tercero (se cuenta)', () => {
    const r = categorize({ descripcion: "Transf a Juan Perez", monto: 50_000, tipo: "cargo" });
    expect(r.category).toBe("Transferencias");
    expect(r.excluded).toBe(false);
  });

  it("una remuneración real sigue siendo Ingresos", () => {
    const r = categorize({
      descripcion: "PAGO SUELDO EMPRESA SPA",
      monto: 2_500_000,
      tipo: "abono",
    });
    expect(r.category).toBe("Ingresos");
  });
});

describe("isInternalTransferTx — exclusión consolidada", () => {
  it("true cuando la categoría persistida es Transferencia interna", () => {
    expect(
      isInternalTransferTx({ categoria: "Transferencia interna", descripcion: "lo que sea" }),
    ).toBe(true);
  });

  it("true por glosa (MONTO CANCELADO / divisas / a T. Crédito / Traspaso Deuda)", () => {
    expect(isInternalTransferTx({ descripcion: "MONTO CANCELADO" })).toBe(true);
    expect(isInternalTransferTx({ descripcion: "ABONO DE DIVISAS" })).toBe(true);
    expect(isInternalTransferTx({ descripcion: "Traspaso Internet a T. Crédito" })).toBe(true);
    expect(isInternalTransferTx({ descripcion: "Traspaso Deuda Nacional" })).toBe(true);
  });

  it("true por flag es_transferencia del adaptador de tarjeta", () => {
    expect(isInternalTransferTx({ descripcion: "MONTO CANCELADO", es_transferencia: true })).toBe(
      true,
    );
  });

  it("false para transferencia a tercero (se cuenta), incluso con es_transferencia", () => {
    expect(
      isInternalTransferTx({ descripcion: "Transf a Juan Perez", es_transferencia: true }),
    ).toBe(false);
  });
});

describe("aceptación — netea ingreso Y egreso, conserva terceros", () => {
  // Movimientos persistidos (cartola JSON): categoria + es_transferencia.
  type Tx = {
    descripcion: string;
    tipo: "abono" | "cargo";
    monto: number;
    categoria?: string;
    es_transferencia?: boolean;
  };
  const set: Tx[] = [
    {
      descripcion: "Pago Sueldo Empresa SpA",
      tipo: "abono",
      monto: 2_500_000,
      categoria: "ingreso_principal",
    },
    {
      descripcion: "MONTO CANCELADO",
      tipo: "abono",
      monto: 478_746,
      categoria: "Transferencia interna",
      es_transferencia: true,
    },
    {
      descripcion: "ABONO DE DIVISAS",
      tipo: "abono",
      monto: 390_139,
      categoria: "Transferencia interna",
      es_transferencia: true,
    },
    {
      descripcion: "Traspaso Internet a T. Crédito",
      tipo: "cargo",
      monto: 478_746,
      categoria: "Transferencia interna",
      es_transferencia: true,
    },
    {
      descripcion: "Transf a Maria",
      tipo: "cargo",
      monto: 60_000,
      categoria: "transferencia_enviada",
      es_transferencia: true,
    },
    { descripcion: "Jumbo Bilbao", tipo: "cargo", monto: 85_000, categoria: "alimentacion" },
  ];

  const real = set.filter((t) => !isInternalTransferTx(t));
  const ingresos = real.filter((t) => t.tipo === "abono").reduce((a, t) => a + t.monto, 0);
  const egresos = real.filter((t) => t.tipo === "cargo").reduce((a, t) => a + t.monto, 0);

  it("las tres internas quedan excluidas de ingresos y egresos", () => {
    expect(real.map((t) => t.descripcion)).toEqual([
      "Pago Sueldo Empresa SpA",
      "Transf a Maria",
      "Jumbo Bilbao",
    ]);
  });

  it("ingreso = solo el sueldo (MONTO CANCELADO + ABONO DIVISAS NO inflan)", () => {
    expect(ingresos).toBe(2_500_000);
  });

  it("egreso = transferencia a tercero + compra real (el fondeo a T. Crédito NO cuenta)", () => {
    expect(egresos).toBe(60_000 + 85_000);
  });
});
