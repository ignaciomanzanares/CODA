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

    // ~41 movimientos on the real statement (guards a row-layout regression).
    expect(r.movimientos.length).toBeGreaterThanOrEqual(40);
    expect(r.movimientos.length).toBeLessThanOrEqual(42);

    expect(r.totalComprasYCargosUsd).toBe(2276.25); // glued label+value, reliable
    expect(r.totalComprasUsd).toBe(2276.25);
    expect(r.reconciliation.passed).toBe(true);

    // Payments (MONTO CANCELADO rows) sum to ABONO REALIZADO −1.804,21. The header
    // ABONO field isn't adjacent to its label in the real pdf-parse layout, so we
    // assert the computed row sum directly (the meaningful invariant).
    const pagos = r.movimientos.filter((m) => m.kind === 'payment');
    expect(pagos.length).toBeGreaterThan(0);
    const sumPagos = Math.round(pagos.reduce((a, m) => a + m.montoUsd, 0) * 100) / 100;
    expect(sumPagos).toBe(-1804.21);

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
  (has(MAY) ? it : it.skip)(`${MAY}: TOTAL DE COMPRAS Y CARGOS = US$88,57`, () => {
    const r = parseTarjetaInternacional(load(MAY));
    // eslint-disable-next-line no-console
    console.log(
      `[${MAY}] movs=${r.movimientos.length} comprasUsd=${r.totalComprasUsd} ` +
        `totalComprasYCargos=${r.totalComprasYCargosUsd} reconΔ=${r.reconciliation.delta_pct}%`,
    );
    // For May there's no carryover, so TOTAL DE COMPRAS Y CARGOS = DEUDA TOTAL = 88,57.
    expect(r.totalComprasYCargosUsd).toBe(88.57);
    expect(r.totalComprasUsd).toBe(88.57);
    expect(r.reconciliation.passed).toBe(true);
  });

  // Regression guard for the OTHER extractor order (pdfjs: US$ is the LAST number).
  it('parses pdfjs column order (DATE DESC CITY PAIS ORIGEN US$)', () => {
    const pdfjsText = [
      'ESTADO DE CUENTA INTERNACIONAL DE TARJETA DE CRÉDITO',
      'FECHA ESTADO DE CUENTA 24/03/2026',
      'TOTAL DE COMPRAS Y CARGOS US$ 152,97',
      '1. TOTAL OPERACIONES 152,97',
      '23/02/26 OPENAI *CHATGPT SUBSCR DUBLIN IR 19,33 22,83',
      '03/03/26 LATAM.COM EUR LA MADRID ES 936,84 130,14',
      '07/03/26 MONTO CANCELADO CH 0,00 -50,00',
    ].join('\n');
    const r = parseTarjetaInternacional(pdfjsText);
    const chatgpt = r.movimientos.find((m) => /CHATGPT/i.test(m.descripcion));
    expect(chatgpt?.montoUsd).toBe(22.83); // US$ (last), not 19,33 (origen)
    expect(chatgpt?.montoOrigen).toBe(19.33);
    expect(r.totalComprasUsd).toBe(152.97); // 22,83 + 130,14
    const pago = r.movimientos.find((m) => /MONTO CANCELADO/i.test(m.descripcion));
    expect(pago?.kind).toBe('payment');
    expect(pago?.montoUsd).toBe(-50);
  });
});
