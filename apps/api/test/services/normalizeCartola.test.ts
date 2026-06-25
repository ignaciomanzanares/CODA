/**
 * Lógica pura de normalización de cartolas (sin DB):
 *  - el año se infiere del PERÍODO (02/06 de una cartola 2025 → 2025-06-02, no 2026);
 *  - tipo/subtipo de cuenta por banco (tarjeta → credit_card);
 *  - transferencia interna sólo por los patrones claros (no toda "Transferencia interna").
 */
import { describe, it, expect } from 'vitest';
import {
  resolveDateFromPeriod, accountKindForBanco, isInternalByDescription,
} from '../../src/services/documents/normalizeCartola.js';

describe('resolveDateFromPeriod — año desde el período (fix 2026)', () => {
  const desde = '2025-05-30', hasta = '2025-06-30';

  it('02/06 en cartola may-jun 2025 → 2025-06-02 (NO 2026)', () => {
    expect(resolveDateFromPeriod(2, 6, desde, hasta)).toBe('2025-06-02');
  });
  it('30/05 → 2025-05-30 (mes anterior dentro del período)', () => {
    expect(resolveDateFromPeriod(30, 5, desde, hasta)).toBe('2025-05-30');
  });
  it('cruce de año: 20/12 con período dic2025-ene2026 → 2025-12-20', () => {
    expect(resolveDateFromPeriod(20, 12, '2025-12-15', '2026-01-15')).toBe('2025-12-20');
  });
  it('cruce de año: 05/01 con período dic2025-ene2026 → 2026-01-05', () => {
    expect(resolveDateFromPeriod(5, 1, '2025-12-15', '2026-01-15')).toBe('2026-01-05');
  });
  it('TC internacional parte 22/05: 22/05 → 2025-05-22', () => {
    expect(resolveDateFromPeriod(22, 5, '2025-05-22', '2025-06-23')).toBe('2025-05-22');
  });
});

describe('accountKindForBanco — cuenta corriente vs tarjeta', () => {
  it('Santander → depository/checking', () => {
    expect(accountKindForBanco('Santander')).toEqual({ type: 'depository', subtype: 'checking' });
  });
  it('Santander Tarjeta Nacional → credit/credit_card', () => {
    expect(accountKindForBanco('Santander Tarjeta Nacional')).toEqual({ type: 'credit', subtype: 'credit_card' });
  });
  it('Santander Tarjeta Internacional → credit/credit_card', () => {
    expect(accountKindForBanco('Santander Tarjeta Internacional')).toEqual({ type: 'credit', subtype: 'credit_card' });
  });
});

describe('isInternalByDescription — sólo patrones claros', () => {
  for (const d of [
    'Traspaso Internet a T. Crédito', 'MONTO CANCELADO', 'PAGO COOPEUCH',
    'ABONO DE DIVISAS', 'Egreso por Compra de Divisas',
  ]) {
    it(`"${d}" → interna`, () => expect(isInternalByDescription(d)).toBe(true));
  }
  it('una transferencia de tercero NO es interna', () => {
    expect(isInternalByDescription('Transf de PATRICIO RAFAEL')).toBe(false);
    expect(isInternalByDescription('Compra Nacional JUMBO')).toBe(false);
  });
});
