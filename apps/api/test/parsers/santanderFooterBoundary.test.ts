/**
 * Regresión: el parser columnar de Santander NO debe leer las secciones de
 * resumen/pie como movimientos. En cartolas reales esto inyectaba filas falsas
 * (un COM.MANT duplicado de "Resumen de Comisiones" y el cupo "31/03/2026" de
 * "INFORMACION DE LINEA DE CREDITO"), rompiendo la conciliación ~1-2%.
 *
 * Multipágina: los pies se repiten por página y los movimientos CONTINÚAN en la
 * página siguiente, así que el corte debe ser por estado (entrar/salir del pie),
 * reanudando al reaparecer "DETALLE DE MOVIMIENTOS" / "FECHA … DESCRIPCION".
 *
 * Sin PII: se construyen PdfLine[] sintéticos (coordenadas X) que reproducen el
 * layout en columnas, no un PDF real.
 */
import { describe, it, expect } from 'vitest';
import { parseCartolaPdf, type PdfLine } from '../../src/services/documents/pdfAnalysis.js';

function line(text: string, items: Array<[string, number]> = []): PdfLine {
  return { text, y: 0, items: items.map(([str, x]) => ({ str, x })) };
}

// Encabezado de columnas (fija cargoColX≈330, abonoColX≈416, saldoColX≈510).
const colHeader = () =>
  line('FECHA SUCURSAL DESCRIPCION CHEQUES Y OTROS DEPOSITOS Y OTROS SALDO', [
    ['CHEQUES', 320], ['CARGOS', 330], ['DEPOSITOS', 406], ['ABONOS', 416], ['SALDO', 510],
  ]);

// Cartola de 2 páginas: movimiento → pie (resumen + línea de crédito) → página 2
// (reanuda) movimiento → pie final (Resumen de Comisiones + COM.MANT duplicado).
const pdfLines: PdfLine[] = [
  colHeader(),
  line('05/01 O.Gerencia Transf a ALPHA 1.000 99.000', [
    ['05/01', 10], ['O.Gerencia', 60], ['Transf', 120], ['a', 150], ['ALPHA', 170], ['1.000', 330], ['99.000', 510],
  ]),
  // ── pie página 1 (NO movimientos) ──
  line('INFORMACION DE SUPER CUENTA VISTA'),
  line('SALDO INICIAL DEPOSITOS OTROS ABONOS CHEQUES OTROS CARGOS IMPUESTOS SALDO FINAL'),
  line('100.000 0 2.000 0 1.000 0 101.000', [['100.000', 330], ['2.000', 416], ['101.000', 510]]),
  line('INFORMACION DE LINEA DE CREDITO'),
  line('50.000 50.000 0 31/03/2026', [['50.000', 330], ['50.000', 416], ['31/03/2026', 480]]),
  // ── página 2: reanuda ──
  line('DETALLE DE MOVIMIENTOS SALDOS DIARIOS'),
  colHeader(),
  line('30/01 O.Gerencia Transf a BRAVO 2.000 97.000', [
    ['30/01', 10], ['O.Gerencia', 60], ['Transf', 120], ['a', 150], ['BRAVO', 170], ['2.000', 330], ['97.000', 510],
  ]),
  // ── pie final ──
  line('Resumen de Comisiones'),
  line('26/01 Agustinas COM.MANT.PROD.OPC.CTA.CTE. 3.149', [['3.149', 330]]),
];

const text = pdfLines.map((l) => l.text).join('\n');

describe('Santander columnar — no leer pie de página como movimientos', () => {
  const result = parseCartolaPdf(text, pdfLines);
  const descs = (result?.transacciones ?? []).map((t) => t.descripcion);

  it('captura SÓLO los movimientos reales (ambas páginas)', () => {
    expect(result).not.toBeNull();
    expect(result!.transacciones).toHaveLength(2);
    expect(descs.some((d) => /ALPHA/i.test(d))).toBe(true);
    expect(descs.some((d) => /BRAVO/i.test(d))).toBe(true);
  });

  it('NO inyecta filas del pie (COM.MANT duplicado ni el cupo 31/03/2026)', () => {
    expect(descs.some((d) => /COM\.MANT/i.test(d))).toBe(false);
    expect(descs.some((d) => /31\/03\/2026|CREDITO|CUENTA VISTA/i.test(d))).toBe(false);
  });
});
