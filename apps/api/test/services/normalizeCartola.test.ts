/**
 * Lógica pura de normalización de cartolas (sin DB):
 *  - el año se infiere del PERÍODO (02/06 de una cartola 2025 → 2025-06-02, no 2026);
 *  - tipo/subtipo de cuenta por banco (tarjeta → credit_card);
 *  - transferencia interna sólo por los patrones claros (no toda "Transferencia interna").
 */
import { describe, it, expect } from 'vitest';
import {
  resolveDateFromPeriod, accountKindForBanco, isInternalByDescription,
  buildCartolaTransactionRows, type NormalizeCartolaInput,
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

describe('isInternalByDescription — sólo traspasos entre productos propios', () => {
  for (const d of [
    'Traspaso Internet a T. Crédito', 'MONTO CANCELADO',
    'ABONO DE DIVISAS', 'Egreso por Compra de Divisas',
  ]) {
    it(`"${d}" → interna`, () => expect(isInternalByDescription(d)).toBe(true));
  }
  it('PAGO COOPEUCH NO es interna (dividendo hipotecario = gasto real)', () => {
    expect(isInternalByDescription('PAGO COOPEUCH')).toBe(false);
  });
  it('una transferencia de tercero NO es interna', () => {
    expect(isInternalByDescription('Transf de FERNANDO ANDRES')).toBe(false);
    expect(isInternalByDescription('Compra Nacional JUMBO')).toBe(false);
  });
});

describe('buildCartolaTransactionRows — filas de transactions', () => {
  const ccInput: NormalizeCartolaInput = {
    userId: 'u1',
    documentId: 'doc-cc',
    banco: 'Santander',
    periodoDesde: '2025-05-30',
    periodoHasta: '2025-06-30',
    transacciones: [
      { fecha: '02/06', descripcion: 'Compra Nacional JUMBO', cargo: 15000 },
      { fecha: '03/06', descripcion: 'Sueldo', abono: 1200000 },
      { fecha: '04/06', descripcion: 'Traspaso Internet a T. Crédito', cargo: 300000 },
    ],
  };

  it('fecha desde período (junio 2025, no 2026), signo del monto y external_id determinístico', () => {
    const rows = buildCartolaTransactionRows(ccInput, 7, 'Santander');
    expect(rows.map((r) => r.postedAt)).toEqual(['2025-06-02', '2025-06-03', '2025-06-04']);
    expect(rows.map((r) => r.amount)).toEqual([-15000, 1200000, -300000]); // cargo negativo, abono positivo
    expect(rows.map((r) => r.externalId)).toEqual([
      'score_upload:doc-cc:0', 'score_upload:doc-cc:1', 'score_upload:doc-cc:2',
    ]);
    expect(rows.every((r) => r.sourceDocumentId === 'doc-cc')).toBe(true);
    expect(rows.every((r) => r.accountId === 7)).toBe(true);
  });

  it('marca is_internal_transfer sólo por glosa clara', () => {
    const rows = buildCartolaTransactionRows(ccInput, 7, 'Santander');
    expect(rows.map((r) => r.isInternalTransfer)).toEqual([0, 0, 1]);
  });

  it('cuenta corriente NO lleva metadata USD aunque venga montoUsd', () => {
    const input: NormalizeCartolaInput = {
      ...ccInput,
      transacciones: [{ fecha: '02/06', descripcion: 'X', cargo: 1000, montoUsd: 10, fxRate: 100 }],
    };
    const [row] = buildCartolaTransactionRows(input, 7, 'Santander');
    expect(row.originalCurrency).toBeUndefined();
    expect(row.originalAmount).toBeUndefined();
  });

  it('TC Internacional con montoUsd → metadata USD/CLP (no se mezclan sin metadata)', () => {
    const input: NormalizeCartolaInput = {
      userId: 'u1', documentId: 'doc-intl', banco: 'Santander Tarjeta Internacional',
      periodoDesde: '2025-05-22', periodoHasta: '2025-06-23',
      transacciones: [{ fecha: '22/05', descripcion: 'NETFLIX.COM', cargo: 9500, montoUsd: 9.99, fxRate: 951 }],
    };
    const [row] = buildCartolaTransactionRows(input, 9, 'Santander Tarjeta Internacional');
    expect(row.postedAt).toBe('2025-05-22');
    expect(row.amount).toBe(-9500);
    expect(row.amountClp).toBe(-9500);
    expect(row.currency).toBe('CLP');
    expect(row.originalAmount).toBe(9.99);
    expect(row.originalCurrency).toBe('USD');
    expect(row.fxRate).toBe(951);
  });

  it('reproceso: mismas filas (external_id estable) → upsert idempotente, sin duplicar', () => {
    const a = buildCartolaTransactionRows(ccInput, 7, 'Santander');
    const b = buildCartolaTransactionRows(ccInput, 7, 'Santander');
    expect(a.map((r) => r.externalId)).toEqual(b.map((r) => r.externalId));
  });
});
