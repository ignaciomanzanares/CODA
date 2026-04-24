/**
 * Diagnostic + regression test for cartola09-25.pdf reconciliation.
 *
 * Step 1: Parses the fixture via the exact same pipeline the /movimientos
 *         route handler calls (parseCartolaPdfToJson from cartolaParser.ts).
 * Step 2: Logs every transaction with its monto, saldoInicial, saldoFinal,
 *         and the computed reconciliation delta to help diagnose misparses.
 * Step 3: Asserts reconciliation passes (delta ≤ 1%).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseCartolaPdfToJson } from '../../../../src/services/expenses/cartolaParser';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('cartola09-25 reconciliation', () => {
  it('parses and reconciles within 1% tolerance', async () => {
    const pdfPath = resolve(__dirname, 'cartola09-25.pdf');
    const buffer = readFileSync(pdfPath);

    const result = await parseCartolaPdfToJson(buffer, 'debito');

    expect(result.success).toBe(true);

    const { saldoInicial, saldoFinal, totalCargos, totalAbonos, cantidadMovimientos } =
      result.resumen;

    const computedSaldoFinal = (saldoInicial ?? 0) + totalAbonos - totalCargos;

    console.log('\n=== RECONCILIATION DIAGNOSTIC ===');
    console.log(`saldoInicial (reported):  ${saldoInicial}`);
    console.log(`totalAbonos:              ${totalAbonos}`);
    console.log(`totalCargos:              ${totalCargos}`);
    console.log(`saldoFinal (reported):    ${saldoFinal}`);
    console.log(`saldoFinal (computed):    ${computedSaldoFinal}`);
    console.log(`cantidadMovimientos:      ${cantidadMovimientos}`);

    console.log('\n=== TRANSACTIONS ===');
    result.movimientos.forEach((m, i) => {
      const flag =
        (m.cargo > 0 && m.cargo < 1000) || (m.abono > 0 && m.abono < 1000)
          ? ' <-- SUSPICIOUS (small amount, possible decimal misparse)'
          : '';
      console.log(
        `[${String(i + 1).padStart(3)}] ${m.date.slice(0, 10)} | ` +
          `${m.description.slice(0, 40).padEnd(40)} | ` +
          `cargo=${String(m.cargo).padStart(10)} | ` +
          `abono=${String(m.abono).padStart(10)} | ` +
          `saldo=${m.saldo !== undefined ? String(m.saldo).padStart(12) : '         N/A'}` +
          flag
      );
    });

    expect(
      saldoFinal,
      'saldoFinal must be extracted from the PDF (> 0); got 0 or undefined — parser is not reading the 7-col summary row'
    ).toBeGreaterThan(0);

    const delta = Math.abs(computedSaldoFinal - saldoFinal!) / saldoFinal!;
    console.log(`\nDelta: ${(delta * 100).toFixed(4)}% (threshold: 1%)`);
    expect(delta, `Reconciliation delta ${(delta * 100).toFixed(2)}% exceeds 1% threshold`).toBeLessThanOrEqual(0.01);
  }, 30000);
});
