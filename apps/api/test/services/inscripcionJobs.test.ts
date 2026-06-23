/**
 * Unit tests del job store de OCR de inscripción.
 *
 * Sin DB real: el módulo `db` se mockea (igual que indicators.test.ts). Cubre
 * crear job (estado processing), leer parseando el `result` JSON, y la regla
 * dueño-único (si la query no devuelve fila → null → el endpoint responde 404).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  inserted: [] as Array<Record<string, unknown>>,
  rows: [] as Array<Record<string, unknown>>,
}));

vi.mock('../../src/db/index.js', () => {
  const values = (v: Record<string, unknown>) => {
    h.inserted.push(v);
    return Promise.resolve();
  };
  const insert = () => ({ values });
  const where = async () => h.rows.slice();
  const from = () => ({ where });
  const select = () => ({ from });
  const update = () => ({ set: () => ({ where: async () => undefined }) });
  return { db: { insert, select, update }, inscripcionJobs: {} };
});

const { createInscripcionJob, getInscripcionJob } = await import(
  '../../src/services/assets/inscripcionJobs.js'
);

beforeEach(() => {
  h.inserted = [];
  h.rows = [];
});

describe('inscripcionJobs — job store', () => {
  it('createInscripcionJob inserta en estado processing y devuelve un id', async () => {
    const id = await createInscripcionJob('user-1');
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
    expect(h.inserted).toHaveLength(1);
    expect(h.inserted[0]).toMatchObject({ id, userId: 'user-1', status: 'processing', result: null });
  });

  it('getInscripcionJob parsea el result JSON cuando status=done', async () => {
    h.rows = [
      { status: 'done', message: null, result: JSON.stringify({ ok: true, prefill: { hasLien: true, lienAmountClp: 84999160 } }) },
    ];
    const job = await getInscripcionJob('job-1', 'user-1');
    expect(job?.status).toBe('done');
    expect(job?.result?.ok).toBe(true);
    expect(job?.result?.prefill?.hasLien).toBe(true);
    expect(job?.result?.prefill?.lienAmountClp).toBe(84999160);
  });

  it('job de otro usuario (query sin fila) → null (el endpoint responde 404)', async () => {
    h.rows = []; // el WHERE id+userId no encontró la fila → no es del dueño
    const job = await getInscripcionJob('job-1', 'otro-user');
    expect(job).toBeNull();
  });
});
