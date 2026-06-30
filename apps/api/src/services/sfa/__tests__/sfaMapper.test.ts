import { describe, it, expect } from 'vitest';
import { toSfaTransaction, fromSfaTransaction, buildSfaTransactionsResponse, type InternalTx } from '../sfaMapper.js';
import type { SfaTransaction } from '../sfaTypes.js';

describe('sfaMapper', () => {
  it('interno → SFA: salida = Débito, monto positivo, CLP entero, fecha ISO 8601 UTC', () => {
    const tx: InternalTx = {
      externalId: 'TXN987654', postedAt: '2025-02-10T10:00:00Z',
      amount: -250000, currency: 'CLP', description: 'Pago servicios básicos',
    };
    expect(toSfaTransaction(tx)).toEqual({
      transactionID: 'TXN987654',
      bookingDateTime: '2025-02-10T10:00:00Z',
      transactionType: 'Débito',
      amount: 250000,
      currency: 'CLP',
      description: 'Pago servicios básicos',
    });
  });

  it('interno → SFA: entrada = Crédito', () => {
    const r = toSfaTransaction({ postedAt: '2025-02-12T14:25:00Z', amount: 300000, currency: 'CLP', description: 'Abono sueldo febrero', externalId: 'TXN987655' });
    expect(r.transactionType).toBe('Crédito');
    expect(r.amount).toBe(300000);
  });

  it('CLP se redondea a entero; USD conserva 2 decimales', () => {
    expect(toSfaTransaction({ postedAt: '2025-02-10', amount: -250000.7, currency: 'CLP', description: 'x' }).amount).toBe(250001);
    expect(toSfaTransaction({ postedAt: '2025-02-10', amount: -12.345, currency: 'USD', description: 'x' }).amount).toBe(12.35);
  });

  it('fecha-only se normaliza a medianoche UTC', () => {
    expect(toSfaTransaction({ postedAt: '2025-02-10', amount: 1, currency: 'CLP', description: 'x' }).bookingDateTime).toBe('2025-02-10T00:00:00Z');
  });

  it('round-trip SFA → interno → SFA preserva el ejemplo oficial', () => {
    const official: SfaTransaction = {
      transactionID: 'TXN987654', bookingDateTime: '2025-02-10T10:00:00Z',
      transactionType: 'Débito', amount: 250000, currency: 'CLP', description: 'Pago servicios básicos',
    };
    const ob = fromSfaTransaction(official);
    expect(ob.amount).toBe(-250000); // Débito → firmado negativo
    const back = toSfaTransaction({ externalId: ob.externalId, postedAt: ob.postedAt, amount: ob.amount, currency: ob.currency, description: ob.description });
    expect(back).toEqual(official);
  });

  it('envelope: data.transactions + links(self/next) + meta(totalRecords/totalPages)', () => {
    const txs: InternalTx[] = Array.from({ length: 42 }, (_, i) => ({
      externalId: `T${i}`, postedAt: `2025-02-${String((i % 28) + 1).padStart(2, '0')}T00:00:00Z`,
      amount: i % 2 === 0 ? -1000 : 2000, currency: 'CLP', description: `m${i}`,
    }));
    const resp = buildSfaTransactionsResponse(txs, {
      baseUrl: 'https://api-chile.cl/accounts/v1/accounts/ACC123456/transactions',
      fromDate: '2025-02-01', toDate: '2025-02-28', page: 1, pageSize: 25,
    });
    expect(resp.data.transactions).toHaveLength(25);
    expect(resp.meta).toEqual({ totalRecords: 42, totalPages: 2 });
    expect(resp.links.self).toContain('page=1');
    expect(resp.links.next).toContain('page=2');
    expect(resp.links.prev).toBeUndefined();
  });
});
