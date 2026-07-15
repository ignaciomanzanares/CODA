import { describe, it, expect } from "vitest";
import type { CartolaParseResult } from "../../parsers/cartola-parser.js";
import type { CMFParseResult } from "../../parsers/cmf-parser.js";
import { calculateTransactionalScore } from "../transactional-score.js";
import { calculateCreditScore } from "../credit-score.js";

/**
 * Serie diaria 30/10/2025–28/11/2025 (30 días) alineada a la cartola real:
 * - Totales y movimientos clave (arancel universidad 6-nov, abono inversión 27-nov).
 * - Exactamente 5 días con saldo estrictamente &lt; $10.000 (estrés de liquidez).
 * - Ingreso principal concentrado el 27-nov (reflejado en saldo final).
 */
function saldosDiariosRealesNoviembre(): CartolaParseResult["saldos_diarios"] {
  const out: CartolaParseResult["saldos_diarios"] = [];
  const start = new Date("2025-10-30T12:00:00");
  const pattern = [
    880681, 858391, 850000, 820000, 800000, 775000, 350000, 19391, 8500, 7200, 1243, 4627, 3627,
    15000, 16000, 17000, 18000, 20000, 22000, 28000, 32000, 35000, 38000, 42000, 48000, 52000,
    58000, 62000, 993680, 993680,
  ];
  if (pattern.length !== 30) {
    throw new Error("saldos_diarios: se esperaban 30 días");
  }
  for (let i = 0; i < 30; i++) {
    const f = new Date(start);
    f.setDate(f.getDate() + i);
    out.push({ fecha: f, saldo: pattern[i]! });
  }
  return out;
}

const CARTOLA_REAL: CartolaParseResult = {
  banco: "Santander",
  titular: "CASTELLANO QUINTERO BASTIAN",
  cuenta: "0-011-00-71234-5",
  periodo: {
    desde: new Date("2025-10-30T12:00:00"),
    hasta: new Date("2025-11-28T12:00:00"),
    dias: 30,
  },
  saldo_inicial: 880681,
  saldo_final: 993680,
  total_cargos: 988918,
  total_abonos: 1101917,
  transacciones: [
    {
      fecha: new Date("2025-11-06T12:00:00"),
      descripcion: "PAGO EN LINEA PONTIFICIA UNIV",
      tipo: "cargo",
      monto: 813200,
      saldo_despues: 19391,
      categoria: "educacion",
      es_transferencia: false,
      es_compra: false,
      es_pago_recurrente: false,
    },
    {
      fecha: new Date("2025-11-08T12:00:00"),
      descripcion: "Compra nacional MERCADOPAGO",
      tipo: "cargo",
      monto: 45200,
      saldo_despues: 0,
      categoria: "comercio",
      es_transferencia: false,
      es_compra: true,
      es_pago_recurrente: false,
    },
    {
      fecha: new Date("2025-11-14T12:00:00"),
      descripcion: "Compra nacional ENTEL PCS",
      tipo: "cargo",
      monto: 18900,
      saldo_despues: 0,
      categoria: "telecomunicaciones",
      es_transferencia: false,
      es_compra: true,
      es_pago_recurrente: false,
    },
    {
      fecha: new Date("2025-11-21T12:00:00"),
      descripcion: "PAC SERVICIO ELEC",
      tipo: "cargo",
      monto: 111618,
      saldo_despues: 0,
      categoria: "otro",
      es_transferencia: false,
      es_compra: false,
      es_pago_recurrente: false,
    },
    {
      fecha: new Date("2025-11-04T12:00:00"),
      descripcion: "Transf de SUELDO",
      tipo: "abono",
      monto: 52400,
      saldo_despues: 0,
      categoria: "ingreso_principal",
      es_transferencia: true,
      es_compra: false,
      es_pago_recurrente: false,
    },
    {
      fecha: new Date("2025-11-10T12:00:00"),
      descripcion: "Transf de AHORRO",
      tipo: "abono",
      monto: 31564,
      saldo_despues: 0,
      categoria: "transferencia_recibida",
      es_transferencia: true,
      es_compra: false,
      es_pago_recurrente: false,
    },
    {
      fecha: new Date("2025-11-12T12:00:00"),
      descripcion: "TEF Credito",
      tipo: "abono",
      monto: 20400,
      saldo_despues: 0,
      categoria: "comercio",
      es_transferencia: true,
      es_compra: false,
      es_pago_recurrente: false,
    },
    {
      fecha: new Date("2025-11-27T12:00:00"),
      descripcion: "Transf de INVERSION",
      tipo: "abono",
      monto: 997553,
      saldo_despues: 993680,
      categoria: "ingreso_principal",
      es_transferencia: true,
      es_compra: false,
      es_pago_recurrente: false,
    },
  ],
  saldos_diarios: saldosDiariosRealesNoviembre(),
};

const CMF_REAL: CMFParseResult = {
  titular: "CASTELLANO QUINTERO BASTIAN",
  rut: "21.486.204-2",
  fecha_emision: new Date("2026-02-23T12:00:00"),
  fecha_actualizacion: new Date("2026-02-13T12:00:00"),
  deuda_total: 0,
  deuda_directa: [],
  deuda_indirecta: [],
  lineas_credito: [],
  metricas: {
    tiene_deuda: false,
    porcentaje_al_dia: 0,
    porcentaje_en_atraso: 0,
    tiene_atraso_grave: false,
    score_cmf: 85,
    credito_disponible_total: 0,
  },
};

describe("scores con datos reales anonimizados (noviembre 2025)", () => {
  it("cinco días con saldo crítico (< $10.000) en la serie diaria", () => {
    const n = CARTOLA_REAL.saldos_diarios.filter((d) => d.saldo < 10_000).length;
    expect(n).toBe(5);
  });

  it("score transaccional honesto ~50–60 (liquidez + días críticos + ingreso el 27)", () => {
    const tx = calculateTransactionalScore(CARTOLA_REAL);
    expect(tx.score).toBeGreaterThanOrEqual(48);
    expect(tx.score).toBeLessThanOrEqual(62);
    expect(tx.insights.some((i) => /debajo de/i.test(i))).toBe(true);
  });

  it("score crediticio con CMF sin deuda + cartola anterior", () => {
    const tx = calculateTransactionalScore(CARTOLA_REAL);
    const cr = calculateCreditScore(CMF_REAL, CARTOLA_REAL, tx);
    expect(cr.score).toBeGreaterThanOrEqual(650);
    expect(cr.score).toBeLessThanOrEqual(780);
  });
});
