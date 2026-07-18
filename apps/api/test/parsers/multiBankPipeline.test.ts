/**
 * Pipeline COMPLETO multi-banco con PDFs posicionales sintéticos:
 * extracción pdfjs → detectFormat → parser del banco → conciliación.
 * Los .txt de juguete no ejercitan el motor columnar; estos PDFs sí.
 */
import { describe, it, expect } from "vitest";
import { parseCartolaBuffer } from "../../src/parsers/index.js";
import { buildBankPdf, STANDARD_TXS, type BankFixture } from "./helpers/buildBankPdf.js";

const PERIODO = { desde: "01/01/2026", hasta: "31/01/2026" };
const SALDO_INICIAL = 100_500;

const BANKS: Array<{ banco: string; headerLines: string[] }> = [
  {
    banco: "BancoEstado",
    headerLines: ["BANCOESTADO", "CARTOLA CUENTA RUT", "bancoestado.cl"],
  },
  {
    banco: "BCI",
    headerLines: ["BCI", "BANCO DE CREDITO E INVERSIONES", "CARTOLA CUENTA CORRIENTE BCI"],
  },
  {
    banco: "Banco de Chile",
    headerLines: ["BANCO DE CHILE", "CARTOLA CUENTA CORRIENTE", "bancochile.cl"],
  },
];

describe.each(BANKS)("pipeline $banco (PDF posicional)", ({ banco, headerLines }) => {
  const fixture: BankFixture = {
    headerLines,
    periodo: PERIODO,
    saldoInicial: SALDO_INICIAL,
    txs: STANDARD_TXS,
  };

  it("detecta el banco y extrae todas las transacciones con tipos correctos", async () => {
    const pdf = await buildBankPdf(fixture);
    const r = await parseCartolaBuffer(pdf);

    expect(r.banco).toBe(banco);
    expect(r.transacciones.length).toBe(STANDARD_TXS.length);

    const cargos = r.transacciones.filter((t) => t.tipo === "cargo");
    const abonos = r.transacciones.filter((t) => t.tipo === "abono");
    expect(cargos.length).toBe(STANDARD_TXS.filter((t) => t.cargo).length);
    expect(abonos.length).toBe(STANDARD_TXS.filter((t) => t.abono).length);

    const totalCargos = cargos.reduce((s, t) => s + t.monto, 0);
    const totalAbonos = abonos.reduce((s, t) => s + t.monto, 0);
    expect(totalCargos).toBe(STANDARD_TXS.reduce((s, t) => s + (t.cargo ?? 0), 0));
    expect(totalAbonos).toBe(STANDARD_TXS.reduce((s, t) => s + (t.abono ?? 0), 0));
  }, 30_000);

  it("concilia saldos (inicial + abonos - cargos = final)", async () => {
    const pdf = await buildBankPdf(fixture);
    const r = await parseCartolaBuffer(pdf);
    expect(r.saldo_inicial).toBe(SALDO_INICIAL);
    const esperado =
      SALDO_INICIAL +
      STANDARD_TXS.reduce((s, t) => s + (t.abono ?? 0), 0) -
      STANDARD_TXS.reduce((s, t) => s + (t.cargo ?? 0), 0);
    expect(r.saldo_final).toBe(esperado);
  }, 30_000);
});
