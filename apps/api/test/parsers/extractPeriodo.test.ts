import { describe, it, expect } from "vitest";
import { extractPeriodo } from "../../src/parsers/cartola-parser.js";

const iso = (d: Date) => d.toISOString().slice(0, 10);

describe("extractPeriodo", () => {
  it("layout inline: DESDE/HASTA pegados a sus valores", () => {
    const p = extractPeriodo("CARTOLA DESDE 01/03/2026 HASTA 31/03/2026");
    expect(iso(p.desde)).toBe("2026-03-01");
    expect(iso(p.hasta)).toBe("2026-03-31");
  });

  it("layout columnar Santander: etiquetas separadas de los valores", () => {
    // Texto real (pdfjs) de cartola cuenta corriente: las etiquetas quedan en la
    // fila del encabezado y las fechas aparecen más adelante, adyacentes.
    const text =
      "CARTOLA   DESDE   HASTA   PAGINA  Si su dirección ha cambiado, por favor " +
      "infórmela en la sucursal más próxima.  0-000-71-26896-9   008 01648972 109   " +
      "27/02/2026   31/03/2026   1 0415-M-C-00 26896 CUENTA CORRIENTE ML";
    const p = extractPeriodo(text);
    expect(iso(p.desde)).toBe("2026-02-27");
    expect(iso(p.hasta)).toBe("2026-03-31");
  });

  it("layout columnar: no mensualiza al mes de la fecha DESDE", () => {
    // Regresión: antes caía al fallback y guardaba el mes de la primera fecha
    // (feb) como período completo, corriendo la cartola un mes hacia atrás.
    const text = "DESDE   HASTA   PAGINA   xx   30/04/2026   29/05/2026   1";
    const p = extractPeriodo(text);
    expect(iso(p.desde)).toBe("2026-04-30");
    expect(iso(p.hasta)).toBe("2026-05-29");
  });
});
