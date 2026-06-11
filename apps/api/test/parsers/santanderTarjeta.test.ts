/**
 * Tests for the Santander credit-card parsers, against REDACTED .txt fixtures
 * derived from real statements (raw PDFs never committed — see
 * feedback_no_real_pii_fixtures).
 *
 * TC nacional acceptance — the period's total charges (= "1. TOTAL OPERACIONES",
 * which the parsed purchase line-items must sum to):
 *   Sep-2025 = $480.947 · Oct-2025 = $596.864 · Nov-2025 = $483.969
 * Note: the residual "MONTO TOTAL FACTURADO A PAGAR" field is the amount still
 * due — $596.864 for Oct (unpaid), $0 for Sep/Nov (paid in full that period).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  parseTarjetaNacional,
  isTarjetaNacional,
} from '../../src/parsers/santanderTarjeta.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fxDir = join(__dirname, '../fixtures/cartolas/Santander');

function load(name: string): string {
  return readFileSync(join(fxDir, name), 'utf8');
}

const NACIONAL: Array<{ file: string; totalCargado: number; residualDue: number }> = [
  { file: 'tc-nacional-sep25.txt', totalCargado: 480_947, residualDue: 0 }, // paid in full
  { file: 'tc-nacional-oct25.txt', totalCargado: 596_864, residualDue: 596_864 }, // unpaid
  { file: 'tc-nacional-nov25.txt', totalCargado: 483_969, residualDue: 0 }, // paid in full
];

describe('Santander TC nacional (CLP)', () => {
  for (const { file, totalCargado, residualDue } of NACIONAL) {
    const present = existsSync(join(fxDir, file));
    (present ? it : it.skip)(`${file}: line-items reconcile to $${totalCargado.toLocaleString('es-CL')}`, () => {
      const text = load(file);
      expect(isTarjetaNacional(text)).toBe(true);

      const r = parseTarjetaNacional(text);

      // Sample-run output for the verification report.
      // eslint-disable-next-line no-console
      console.log(
        `[${file}] movimientos=${r.movimientos.length} compras=${r.totalCompras} ` +
          `pagos=${r.totalPagos} totalOperaciones=${r.totalOperaciones} ` +
          `facturadoResidual=${r.montoTotalFacturado} reconΔ=${r.reconciliation.delta_pct}% ` +
          `conf=${r.parse_confidence}`,
      );

      expect(r.movimientos.length).toBeGreaterThan(0);

      // Purchase line-items must sum to the declared "1. TOTAL OPERACIONES".
      expect(r.totalOperaciones).toBe(totalCargado);
      expect(r.totalCompras).toBe(r.totalOperaciones);
      expect(r.reconciliation.passed).toBe(true);

      // Residual amount due ("MONTO TOTAL FACTURADO A PAGAR"): full when unpaid, 0 when paid.
      expect(r.montoTotalFacturado).toBe(residualDue);

      // Section/subtotal rows must NOT be counted as line items.
      expect(r.movimientos.every((m) => !/TOTAL OPERACIONES|MOVIMIENTOS TARJETA/i.test(m.descripcion))).toBe(true);

      // PAGO COOPEUCH (mortgage) is a real purchase, never a payment.
      const coopeuch = r.movimientos.find((m) => /COOPEUCH/i.test(m.descripcion));
      if (coopeuch) expect(coopeuch.kind).toBe('purchase');

      // MONTO CANCELADO rows, when present, are payments (negative).
      for (const m of r.movimientos) {
        if (/MONTO CANCELADO/i.test(m.descripcion)) {
          expect(m.kind).toBe('payment');
          expect(m.montoClp).toBeLessThan(0);
        }
      }
    });
  }
});
