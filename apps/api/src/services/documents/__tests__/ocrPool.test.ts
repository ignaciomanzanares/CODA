import { describe, it, expect, vi } from 'vitest';

/**
 * #19: verifica que el OCR usa un POOL de workers reutilizables (un `Scheduler` con N workers
 * inicializado una vez), no create/terminate por documento. Mockeamos tesseract.js para contar
 * llamadas sin depender de la red (descarga del modelo de idioma).
 */

const recognize = vi.fn(async () => ({ data: { text: 'hola mundo', confidence: 88 } }));
const workerTerminate = vi.fn(async () => {});
const createWorker = vi.fn(async () => ({ recognize, terminate: workerTerminate }));

const addWorker = vi.fn();
const addJob = vi.fn(async () => ({ data: { text: 'hola mundo', confidence: 88 } }));
const schedulerTerminate = vi.fn(async () => {});
const createScheduler = vi.fn(() => ({ addWorker, addJob, terminate: schedulerTerminate }));

vi.mock('tesseract.js', () => ({ createWorker, createScheduler }));

describe('OCR worker pool (#19)', () => {
  it('inicializa el pool una vez y reutiliza los workers entre documentos', async () => {
    process.env.OCR_POOL_SIZE = '3';
    const { performOcrOnImage, shutdownOcrPool } = await import('../ocrService.js');

    const buf = Buffer.from('fake-image');
    for (let i = 0; i < 5; i++) {
      const res = await performOcrOnImage(buf);
      expect(res.text).toBe('hola mundo');
      expect(res.confidence).toBeCloseTo(0.88, 5);
    }

    // El scheduler se crea UNA vez, con 3 workers; los 5 documentos se procesan como jobs.
    expect(createScheduler).toHaveBeenCalledTimes(1);
    expect(addWorker).toHaveBeenCalledTimes(3);
    expect(createWorker).toHaveBeenCalledTimes(3); // pool init, NO una por documento
    expect(addJob).toHaveBeenCalledTimes(5);
    // No hay terminate por documento (ese era el patrón viejo).
    expect(workerTerminate).not.toHaveBeenCalled();

    await shutdownOcrPool();
    expect(schedulerTerminate).toHaveBeenCalledTimes(1);
  });
});
