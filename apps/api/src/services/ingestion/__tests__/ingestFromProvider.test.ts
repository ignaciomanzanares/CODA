import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db, sql } from '../../../db/index.js';
import { storage } from '../../../storage.js';
import { ingestFromProvider } from '../ingestFromProvider.js';
import { CartolaUploadProvider } from '../cartolaUploadProvider.js';
import type { OBProvider } from '../../../connectors/openbanking/mockProvider.js';
import type { CartolaExtraida } from '../../documents/pdfAnalysis.js';

/**
 * #18: prueba que la ingesta desacopla el origen. Un `FakeProvider` (sin PDF/OCR) deja
 * accounts/transactions exactamente como lo haría cualquier proveedor, y la operación es
 * idempotente. Luego, `CartolaUploadProvider` produce la misma forma de datos.
 */
describe('ingestFromProvider (#18)', () => {
  const unique = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  let userId = '';

  class FakeProvider implements OBProvider {
    async listAccounts() {
      return [{ providerAccountId: `fake:${unique}`, name: 'Fake Bank', type: 'checking', currency: 'CLP' }];
    }
    async getBalance() {
      return { current: 123456, currency: 'CLP', asOf: new Date() };
    }
    async listTransactions() {
      return [
        { externalId: `tx-${unique}-1`, postedAt: new Date('2026-01-10'), description: 'Sueldo', amount: 900000, currency: 'CLP' },
        { externalId: `tx-${unique}-2`, postedAt: new Date('2026-01-12'), description: 'Supermercado', amount: -45000, currency: 'CLP' },
      ];
    }
  }

  beforeAll(async () => {
    const user = await storage.createUser({
      email: `ingest-${unique}@example.com`,
      username: `ingest_${unique}`,
      passwordHash: 'x:x',
    } as any);
    userId = user.id;
  });

  afterAll(async () => {
    const accs = await storage.getAccounts(userId);
    for (const a of accs) {
      await db.run(sql`DELETE FROM transactions WHERE account_id = ${a.id}`);
      await db.run(sql`DELETE FROM balances WHERE account_id = ${a.id}`);
    }
    await db.run(sql`DELETE FROM accounts WHERE user_id = ${userId}`);
    await db.run(sql`DELETE FROM users WHERE id = ${userId}`);
  });

  it('escribe accounts/balances/transactions desde un provider arbitrario', async () => {
    const summary = await ingestFromProvider(userId, new FakeProvider());
    expect(summary.accountsCreated).toBe(1);
    expect(summary.transactionsInserted).toBe(2);
    expect(summary.balancesWritten).toBe(1);

    const accs = await storage.getAccounts(userId);
    expect(accs.length).toBe(1);
    const txs = await storage.getTransactions(accs[0].id);
    expect(txs.length).toBe(2);
    expect(txs.map((t) => t.description).sort()).toEqual(['Sueldo', 'Supermercado']);
  });

  it('es idempotente: re-ingestar el mismo provider no duplica', async () => {
    const summary = await ingestFromProvider(userId, new FakeProvider());
    expect(summary.accountsCreated).toBe(0);
    expect(summary.accountsMatched).toBe(1);
    expect(summary.transactionsInserted).toBe(0);
    expect(summary.transactionsSkipped).toBe(2);

    const accs = await storage.getAccounts(userId);
    const txs = await storage.getTransactions(accs[0].id);
    expect(txs.length).toBe(2); // sin duplicar
  });

  it('CartolaUploadProvider mapea una cartola a la misma forma de datos', async () => {
    const cartola: CartolaExtraida = {
      tipo: 'cartola',
      transacciones: [
        { fecha: '10/01/2026', descripcion: 'Abono sueldo', cargo: 0, abono: 800000, saldo: 800000 },
        { fecha: '15/01/2026', descripcion: 'Pago cuenta', cargo: 50000, abono: 0, saldo: 750000 },
      ],
      saldoInicial: 0,
      saldoFinal: 750000,
    };
    const summary = await ingestFromProvider(userId, new CartolaUploadProvider('Banco Estado', [cartola]));
    expect(summary.accountsCreated).toBe(1); // cuenta distinta a la del FakeProvider
    expect(summary.transactionsInserted).toBe(2);

    const accs = await storage.getAccounts(userId);
    const cartolaAcc = accs.find((a) => a.providerAccountId === 'cartola:banco_estado');
    expect(cartolaAcc).toBeTruthy();
    const txs = await storage.getTransactions(cartolaAcc!.id);
    expect(txs.length).toBe(2);
    const sueldo = txs.find((t) => t.description === 'Abono sueldo');
    expect(sueldo?.amount).toBe(800000); // abono => positivo
    const pago = txs.find((t) => t.description === 'Pago cuenta');
    expect(pago?.amount).toBe(-50000); // cargo => negativo

    // Idempotencia de la cartola: re-ingestar no duplica (externalId determinístico).
    const again = await ingestFromProvider(userId, new CartolaUploadProvider('Banco Estado', [cartola]));
    expect(again.transactionsInserted).toBe(0);
    expect(again.transactionsSkipped).toBe(2);
  });
});
