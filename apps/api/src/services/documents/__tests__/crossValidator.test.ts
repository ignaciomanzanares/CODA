import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CMFParseResult } from "../../../parsers/cmf-parser.js";

// Mock storage antes de importar el módulo bajo prueba.
const listMock = vi.fn();
vi.mock("../../../storage.js", () => ({
  storage: { listScoreDocumentUploadsByType: (...a: unknown[]) => listMock(...a) },
}));

const { crossValidateCmfVsCartolas } = await import("../crossValidator.js");

function cmf(partial: Partial<CMFParseResult>): CMFParseResult {
  return {
    titular: "x",
    rut: "1-9",
    fecha_emision: new Date(),
    fecha_actualizacion: new Date(),
    deuda_total: 0,
    deuda_directa: [],
    deuda_indirecta: [],
    lineas_credito: [],
    metricas: {
      tiene_deuda: false,
      porcentaje_al_dia: 100,
      porcentaje_en_atraso: 0,
      tiene_atraso_grave: false,
      score_cmf: 85,
      credito_disponible_total: 0,
    },
    ...partial,
  };
}

describe("crossValidateCmfVsCartolas", () => {
  beforeEach(() => listMock.mockReset());

  it("marca CMF sin deuda contradicho por servicio de deuda en cartola", async () => {
    listMock.mockResolvedValue([
      {
        parsedData: {
          banco: "BancoEstado",
          transacciones: [
            { descripcion: "INTERES LINEA DE CREDITO", categoria: "Finanzas" },
            { descripcion: "PAGO CUOTA PRESTAMO CONSUMO", categoria: "Finanzas" },
            { descripcion: "INTERESES TARJETA DE CREDITO", categoria: "Finanzas" },
          ],
        },
      },
    ]);
    const w = await crossValidateCmfVsCartolas(
      "u1",
      cmf({ deuda_total: 0, metricas: { ...cmf({}).metricas, tiene_deuda: false } }),
    );
    expect(w.map((x) => x.code)).toContain("cmf_sin_deuda_pero_cartola_con_servicio");
  });

  it("no marca contradicción si la cartola no muestra servicio de deuda", async () => {
    listMock.mockResolvedValue([
      {
        parsedData: {
          banco: "BancoEstado",
          transacciones: [
            { descripcion: "COMPRA SUPERMERCADO", categoria: "Supermercado" },
            { descripcion: "PAGO SUELDO", categoria: "Ingreso" },
          ],
        },
      },
    ]);
    const w = await crossValidateCmfVsCartolas("u1", cmf({}));
    expect(w).toHaveLength(0);
  });

  it("marca cobertura: deuda CMF en institución sin cartola", async () => {
    listMock.mockResolvedValue([{ parsedData: { banco: "Banco de Chile", transacciones: [] } }]);
    const w = await crossValidateCmfVsCartolas(
      "u1",
      cmf({
        deuda_total: 5_000_000,
        metricas: { ...cmf({}).metricas, tiene_deuda: true },
        deuda_directa: [
          {
            institucion: "Banco Santander",
            tipo_credito: "consumo",
            total: 5_000_000,
            vigente: 5_000_000,
            atraso_30_59: 0,
            atraso_60_89: 0,
            atraso_90_mas: 0,
          },
        ],
      }),
    );
    expect(w.map((x) => x.code)).toContain("cmf_deuda_sin_cartola");
  });

  it("no falla si no hay cartolas", async () => {
    listMock.mockResolvedValue([]);
    const w = await crossValidateCmfVsCartolas("u1", cmf({}));
    expect(Array.isArray(w)).toBe(true);
  });
});
