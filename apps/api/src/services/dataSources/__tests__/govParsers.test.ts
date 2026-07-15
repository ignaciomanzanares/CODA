import { describe, it, expect } from "vitest";
import {
  detectGovSource,
  parseGovDocument,
  parseAfp,
  parseSii,
  parseTgr,
  extractMontosClp,
} from "../govParsers";

// NOTA: fixtures sintéticos con la ESTRUCTURA de los certificados reales (RUT/montos ficticios).
// Calibrados contra una muestra real de cada fuente; ver comentario de cabecera en govParsers.ts.

describe("govParsers", () => {
  it("extractMontosClp lee montos en formato chileno", () => {
    expect(extractMontosClp("Total: $1.234.567 y otro 890.000")).toEqual([1234567, 890000]);
  });

  it("detectGovSource clasifica por puntaje de marcadores", () => {
    expect(detectGovSource("A.F.P. Modelo certifica CUENTA OBLIGATORIA — COTIZACION NORMAL")).toBe(
      "afp",
    );
    expect(
      detectGovSource("SERVICIO DE IMPUESTOS INTERNOS - CARPETA TRIBUTARIA - FORMULARIO 22"),
    ).toBe("sii");
    expect(
      detectGovSource(
        "El Servicio de Tesorería certifica. Cuenta Única Tributaria. NO REGISTRA DEUDA",
      ),
    ).toBe("tgr");
    expect(detectGovSource("un texto cualquiera sin marcadores")).toBeNull();
  });

  it("detectGovSource: la carpeta SII gana aunque mencione «cotizaciones previsionales»", () => {
    // El F22 trae el código 900 «Cargo por cotizaciones previsionales» — no debe leerse como AFP.
    const carpeta =
      "SERVICIO DE IMPUESTOS INTERNOS. CARPETA TRIBUTARIA. FORMULARIO 22. " +
      "Cargo por cotizaciones previsionales según art. 89.";
    expect(detectGovSource(carpeta)).toBe("sii");
  });

  it('TGR: "no registra deuda" → fiscalDebtClp 0', () => {
    const r = parseTgr(
      "El Servicio de Tesorería certifica que el RUT NO REGISTRA DEUDA fiscal vigente.",
    );
    expect(r.ok).toBe(true);
    expect(r.fiscalDebtClp).toBe(0);
  });

  it("TGR: con monto → toma el mayor como total adeudado", () => {
    const r = parseTgr("Deuda fiscal vigente. Cuota 1: $120.000. Total adeudado: $1.500.000");
    expect(r.ok).toBe(true);
    expect(r.fiscalDebtClp).toBe(1_500_000);
  });

  it("SII: F22 honorarios (código 547) → ingreso mensual (÷12)", () => {
    const carpeta = [
      "Declaraciones de Renta - Formulario 22 (F22)",
      "AÑO TRIBUTARIO 2026",
      "494 3.600.000 547 Total Ingresos Brutos 12.000.000",
      "467 Total Honorarios 8.400.000",
    ].join("\n");
    const r = parseSii(carpeta);
    expect(r.ok).toBe(true);
    expect(r.verifiedMonthlyIncomeClp).toBe(1_000_000); // 12.000.000 / 12
  });

  it("SII: suma sueldos (1098) + honorarios del MISMO año y no mezcla años", () => {
    const carpeta = [
      "Formulario 22",
      "AÑO TRIBUTARIO 2026",
      "1098 Sueldos, pensiones y otras rentas similares de fuente nacional 12.000.000",
      "547 Total Ingresos Brutos 12.000.000",
      "AÑO TRIBUTARIO 2025",
      "1098 Sueldos, pensiones y otras rentas similares de fuente nacional 30.000.000",
    ].join("\n");
    const r = parseSii(carpeta);
    expect(r.ok).toBe(true);
    // Solo AY2026: 12M sueldos + 12M honorarios = 24M/año → 2M/mes; ignora los 30M de AY2025.
    expect(r.verifiedMonthlyIncomeClp).toBe(2_000_000);
  });

  it("SII: F29 (base imponible IVA) no se confunde con renta", () => {
    // Sin sección F22, las «base imponible» ínfimas del F29 no producen un ingreso válido.
    const soloF29 = "FORMULARIO 29. 563 BASE IMPONIBLE 39.847. 547 TOTAL DETERMINADO 7.621";
    const r = parseSii(soloF29);
    expect(r.ok).toBe(false);
  });

  it("AFP: cuenta cotizaciones y estima renta ≈ cotización/0,10", () => {
    const cert = [
      "CERTIFICADO COTIZACIONES — CUENTA OBLIGATORIA",
      "01-2024 COTIZACION NORMAL 10/02/2024 200.000 3,94 50.000,00 76.000.000-0 B",
      "12-2023 COTIZACION NORMAL 11/01/2024 200.000 3,90 51.000,00 76.000.000-0 B",
      "11-2023 COTIZACION NORMAL 11/12/2023 200.000 3,80 52.000,00 76.000.000-0 B",
    ].join("\n");
    const r = parseAfp(cert);
    expect(r.ok).toBe(true);
    expect(r.contributionMonths).toBe(3);
    expect(r.verifiedMonthlyIncomeClp).toBe(2_000_000); // mediana 200.000 / 0,10
  });

  it("AFP: prefiere «renta imponible» explícita cuando el certificado la trae", () => {
    const cert = [
      "CERTIFICADO COTIZACIONES",
      "Renta imponible del período: $850.000",
      "01-2024 COTIZACION NORMAL 10/02/2024",
    ].join("\n");
    const r = parseAfp(cert);
    expect(r.ok).toBe(true);
    expect(r.verifiedMonthlyIncomeClp).toBe(850_000);
  });

  it("never-throw: texto vacío o ilegible devuelve ok=false sin lanzar", () => {
    for (const src of ["afp", "sii", "tgr"] as const) {
      const r = parseGovDocument(src, "");
      expect(r.ok).toBe(false);
      expect(r.message).toBeTruthy();
    }
  });
});
