import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db, withTransaction, sql } from '../db/index.js';
import { storage } from '../storage.js';

/**
 * Atomicidad score + traza NCG 502 (#14).
 *
 * En SQLite (dev/test) `withTransaction` corre secuencial sobre `db`; en Postgres
 * envuelve en una transacción real. Aquí verificamos el contrato del helper y que
 * `upsertTransactionalScore` persiste **ambas** escrituras (score + log de
 * algorithm_prediction_logs) a través del camino transaccionado — el threading de
 * `exec` no rompe ninguna de las dos.
 */
describe('withTransaction + atomicidad score/traza', () => {
  const unique = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const email = `tx-atomic-${unique}@example.com`;
  const username = `tx_atomic_${unique}`;
  let userId = '';

  beforeAll(async () => {
    const user = await storage.createUser({
      email,
      username,
      passwordHash: 'x:x',
    } as any);
    userId = user.id;
  });

  afterAll(async () => {
    await db.run(sql`DELETE FROM algorithm_prediction_logs WHERE user_id = ${userId}`);
    await db.run(sql`DELETE FROM transactional_scores WHERE user_id = ${userId}`);
    await db.run(sql`DELETE FROM users WHERE id = ${userId}`);
  });

  it('withTransaction entrega un executor y devuelve el valor del callback', async () => {
    const result = await withTransaction(async (tx) => {
      expect(tx).toBeTruthy();
      expect(typeof tx.insert).toBe('function');
      return 42;
    });
    expect(result).toBe(42);
  });

  it('withTransaction propaga el error del callback (rollback en Postgres)', async () => {
    await expect(
      withTransaction(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
  });

  it('upsertTransactionalScore persiste score Y traza juntos', async () => {
    await storage.upsertTransactionalScore(userId, {
      transactionalScore: 712,
      mainInsights: ['flujo estable'],
      recommendedProducts: ['cuenta_vista'],
      metrics: { liquidez: 0.8 },
      algorithmInputs: { pipeline: 'test' },
    });

    const scoreRows = await db.all(
      sql`SELECT transactional_score FROM transactional_scores WHERE user_id = ${userId}`,
    ) as Array<{ transactional_score: number }>;
    expect(scoreRows.length).toBe(1);
    expect(Number(scoreRows[0].transactional_score)).toBe(712);

    const traceRows = await db.all(
      sql`SELECT kind FROM algorithm_prediction_logs
          WHERE user_id = ${userId} AND kind = 'transactional_sfa'`,
    ) as Array<{ kind: string }>;
    expect(traceRows.length).toBeGreaterThanOrEqual(1);
  });
});
