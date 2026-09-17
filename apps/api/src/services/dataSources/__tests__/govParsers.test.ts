import { describe, it, expect } from "vitest";
import {
  detectGovSource,
  parseGovDocument,
  parseAfp,
  parseSii,
  boletasHonorariosEmitidas,
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

  // ── Boletas de honorarios: la única señal de ingreso de quien todavía no declara renta ──
  // Layout real de la carpeta tributaria (datos sintéticos).
  const carpetaBoletas = (
    filasEmitidas: string[],
    filasRecibidas: string[] = ["No registra información"],
  ) =>
    [
      "Boletas de Honorarios electrónicas emitidas (6): Últimos 12 meses",
      "   Períodos          Honorario bruto ($)      Retención de terceros ($)",
      ...filasEmitidas,
      "Boleta de prestación de servicios de terceros electrónicas recibidas (6): Últimos 12 meses",
      "   Períodos          Honorario bruto ($)      Retención ($)",
      ...filasRecibidas,
      "Declaraciones de IVA - Formulario 29 (F29)",
      "Agosto 2026",
      "No se registra declaración para este período.",
      "Declaraciones de Renta - Formulario 22 (F22)",
      "Año Tributario 2026",
      "- No existen declaraciones de Renta recibidas para este periodo -",
    ].join("\n");

  it("SII: sin F22, usa las boletas de honorarios emitidas (÷12, la ventana de la sección)", () => {
    const r = parseSii(
      carpetaBoletas([
        "   Junio 2026            450.000                  68.633",
        "   Julio 2026            500.000                  76.259",
        "   Agosto 2026           550.000                  83.885",
      ]),
    );
    expect(r.ok).toBe(true);
    expect(r.verifiedMonthlyIncomeClp).toBe(125_000); // 1.500.000 / 12
    expect(r.raw.origen).toBe("boletas_honorarios");
    expect(r.raw.boletasMeses).toBe(3);
  });

  it("SII: NO suma las boletas RECIBIDAS de terceros (eso es plata que la persona paga)", () => {
    const r = parseSii(
      carpetaBoletas(
        ["   Junio 2026            450.000                  68.633"],
        [
          "   Junio 2026          9.000.000               1.372.657",
          "   Julio 2026          9.000.000               1.372.657",
        ],
      ),
    );
    expect(r.raw.boletasTotalBrutoClp).toBe(450_000);
    expect(r.raw.boletasMeses).toBe(1);
  });

  it("SII: si hay F22, manda el F22 y las boletas no se usan", () => {
    const conAmbos = [
      "Boletas de Honorarios electrónicas emitidas (6): Últimos 12 meses",
      "   Junio 2026            450.000                  68.633",
      "Declaraciones de Renta - Formulario 22 (F22)",
      "AÑO TRIBUTARIO 2026",
      "547 Total Ingresos Brutos 12.000.000",
    ].join("\n");
    const r = parseSii(conAmbos);
    expect(r.ok).toBe(true);
    expect(r.verifiedMonthlyIncomeClp).toBe(1_000_000);
    expect(r.raw.origen).toBeUndefined();
  });

  it("SII: boleta única y chica → no inventa renta, pero dice qué encontró", () => {
    // Caso real de una carpeta sin declaraciones: $41.300 en un mes ≈ $3.442/mes.
    const r = parseSii(carpetaBoletas(["   Junio 2026            41.300                   6.298"]));
    expect(r.ok).toBe(false);
    expect(r.verifiedMonthlyIncomeClp).toBeNull();
    expect(r.raw.boletasTotalBrutoClp).toBe(41_300);
    expect(r.message).toContain("Sin Formulario 22");
    expect(r.message).toContain("41.300");
  });

  it("boletasHonorariosEmitidas: sin la sección devuelve null", () => {
    expect(
      boletasHonorariosEmitidas("Formulario 22. 547 Total Ingresos Brutos 12.000.000"),
    ).toBeNull();
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
