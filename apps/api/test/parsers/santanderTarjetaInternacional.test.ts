/**
 * Tests for the Santander TC internacional (USD) parser, against REDACTED .txt
 * fixtures (raw PDFs never committed — see feedback_no_real_pii_fixtures).
 *
 * Acceptance anchors:
 *   Mar-2026: TOTAL DE COMPRAS Y CARGOS = US$2.276,25 (purchases reconcile to it).
 *   May-2026: DEUDA TOTAL = US$88,57.
 * The MONTO US$ column is authoritative; MONTO MONEDA ORIGEN is metadata only.
 * MONTO CANCELADO rows are payments (negative, excluded from spend).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  parseTarjetaInternacional,
  applyUsdConversion,
  isTarjetaInternacional,
  parseDecimalCl,
} from '../../src/parsers/santanderTarjeta.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fxDir = join(__dirname, '../fixtures/cartolas/Santander');
const load = (n: string) => readFileSync(join(fxDir, n), 'utf8');
const has = (n: string) => existsSync(join(fxDir, n));

describe('parseDecimalCl (comma decimals preserved)', () => {
  it('parses Chilean decimal strings without rounding', () => {
    expect(parseDecimalCl('2.276,25')).toBe(2276.25);
    expect(parseDecimalCl('US$ 88,57')).toBe(88.57);
    expect(parseDecimalCl('-1.804,21')).toBe(-1804.21);
    expect(parseDecimalCl('0,00')).toBe(0);
  });
});

describe('Santander TC internacional (USD)', () => {
  const MAR = 'tc-internacional-2026-03.txt';
  (has(MAR) ? it : it.skip)(`${MAR}: purchases reconcile to US$2.276,25`, () => {
    const text = load(MAR);
    expect(isTarjetaInternacional(text)).toBe(true);
    const r = parseTarjetaInternacional(text);
    // eslint-disable-next-line no-console
    console.log(
      `[${MAR}] movs=${r.movimientos.length} comprasUsd=${r.totalComprasUsd} pagosUsd=${r.totalPagosUsd} ` +
        `totalComprasYCargos=${r.totalComprasYCargosUsd} deudaTotal=${r.deudaTotalUsd} abono=${r.abonoRealizadoUsd} ` +
        `reconΔ=${r.reconciliation.delta_pct}% conf=${r.parse_confidence}`,
    );

    expect(r.totalComprasYCargosUsd).toBe(2276.25);
    expect(r.totalComprasUsd).toBe(2276.25);
    expect(r.reconciliation.passed).toBe(true);

    // ABONO REALIZADO equals the sum of the MONTO CANCELADO payment rows.
    const pagos = r.movimientos.filter((m) => m.kind === 'payment');
    expect(pagos.length).toBeGreaterThan(0);
    const sumPagos = Math.round(pagos.reduce((a, m) => a + m.montoUsd, 0) * 100) / 100;
    expect(sumPagos).toBe(r.abonoRealizadoUsd); // -1804.21

    // Authoritative amount is MONTO US$, not MONTO MONEDA ORIGEN.
    const chatgpt = r.movimientos.find((m) => /CHATGPT/i.test(m.descripcion));
    expect(chatgpt?.montoUsd).toBe(22.83);
    expect(chatgpt?.montoOrigen).toBe(19.33);

    // FX: with a rate → CLP filled; with null → fxPending, no CLP, never throws.
    const withFx = applyUsdConversion(r, 970);
    expect(withFx.fxPending).toBe(false);
    expect(withFx.totalComprasClp).toBe(Math.round(2276.25 * 970));
    expect(withFx.movimientos.find((m) => /CHATGPT/i.test(m.descripcion))?.montoClp).toBe(Math.round(22.83 * 970));

    const noFx = applyUsdConversion(r, null);
    expect(noFx.fxPending).toBe(true);
    expect(noFx.totalComprasClp).toBeNull();
  });

  const MAY = 'tc-internacional-2026-05.txt';
  (has(MAY) ? it : it.skip)(`${MAY}: DEUDA TOTAL = US$88,57`, () => {
    const r = parseTarjetaInternacional(load(MAY));
    // eslint-disable-next-line no-console
    console.log(
      `[${MAY}] movs=${r.movimientos.length} comprasUsd=${r.totalComprasUsd} ` +
        `deudaTotal=${r.deudaTotalUsd} traspaso=${r.traspasoDeudaNacionalUsd} reconΔ=${r.reconciliation.delta_pct}%`,
    );
    expect(r.deudaTotalUsd).toBe(88.57);
    expect(r.totalComprasYCargosUsd).toBe(88.57);
    expect(r.reconciliation.passed).toBe(true);
  });
});
