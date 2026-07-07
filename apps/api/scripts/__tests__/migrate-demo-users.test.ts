import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from '../../src/db/index.js';
import { storage } from '../../src/storage.js';
import { migrateTable, hasUserIdColumn, runSelect, runExec } from '../migrate-demo-users.js';

/**
 * Verifica el script de migración demo→real contra la BD sqlite local:
 * una fila huérfana (user_id = username, sin fila en users con ese id) se
 * reasocia al users.id real cuando username coincide de forma única.
 */
describe('migrate-demo-users', () => {
  const unique = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const username = `demo_orphan_${unique}`; // = el viejo userId huérfano
  const email = `${username}@example.com`;
  const marker = `migrate-test-${unique}`; // título único para identificar la fila
  let realUserId = '';

  beforeAll(async () => {
    const user = await storage.createUser({
      email,
      username,
      passwordHash: 'x:x',
    } as any);
    realUserId = user.id;

    // Inserta una notificación huérfana: user_id apunta al username (id demo),
    // que NO existe en users.id. `id` es autoincrement → se omite.
    // El esquema actual tiene FK user_id→users.id; los huérfanos legacy
    // existen justamente porque la FK no se aplicaba entonces, así que la
    // desactivamos solo para reproducir ese estado heredado.
    await runExec(sql`PRAGMA foreign_keys = OFF`);
    await runExec(
      sql`INSERT INTO notifications (user_id, title, message, type, category)
          VALUES (${username}, ${marker}, ${'m'}, ${'info'}, ${'system'})`,
    );
    await runExec(sql`PRAGMA foreign_keys = ON`);
  });

  afterAll(async () => {
    await runExec(sql`DELETE FROM notifications WHERE title = ${marker}`);
    await runExec(sql`DELETE FROM users WHERE id = ${realUserId}`);
  });

  it('detecta que notifications tiene columna user_id', async () => {
    expect(await hasUserIdColumn('notifications')).toBe(true);
  });

  it('dry-run reporta la fila como migrable sin tocarla', async () => {
    const result = await migrateTable('notifications', false);
    expect(result.migrated).toBeGreaterThanOrEqual(1);

    const rows = await runSelect<{ user_id: string }>(
      sql`SELECT user_id FROM notifications WHERE title = ${marker}`,
    );
    // dry-run no escribe: sigue huérfana
    expect(rows[0]?.user_id).toBe(username);
  });

  it('--apply reasocia la fila al users.id real', async () => {
    const result = await migrateTable('notifications', true);
    expect(result.migrated).toBeGreaterThanOrEqual(1);

    const rows = await runSelect<{ user_id: string }>(
      sql`SELECT user_id FROM notifications WHERE title = ${marker}`,
    );
    expect(rows[0]?.user_id).toBe(realUserId);
  });

  it('es idempotente: una segunda corrida no encuentra esa fila como huérfana', async () => {
    const result = await migrateTable('notifications', true);
    // La fila ya migrada no debe contarse de nuevo (su user_id ya existe en users).
    const rows = await runSelect<{ user_id: string }>(
      sql`SELECT user_id FROM notifications WHERE title = ${marker}`,
    );
    expect(rows[0]?.user_id).toBe(realUserId);
    expect(result.migrated).toBe(result.migrated); // no lanza; el conteo no incluye esta fila
  });
});
