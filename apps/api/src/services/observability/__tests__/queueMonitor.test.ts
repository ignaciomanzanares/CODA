import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * #27: el monitor alerta a Ops cuando la cola supera el umbral, y no spamea mientras sigue alto.
 * Mockeamos la cola y la capa de observabilidad para no depender de Redis.
 */
const getJobCounts = vi.fn();
vi.mock("../../../queues/documentQueue.js", () => ({
  documentQueue: { getJobCounts: (...a: string[]) => getJobCounts(...a) },
}));

const notifyOps = vi.fn(async () => {});
vi.mock("../index.js", () => ({
  notifyOps: (...a: unknown[]) => notifyOps(...a),
  metrics: { registerHelp: vi.fn(), setGauge: vi.fn(), incCounter: vi.fn() },
}));

describe("queueMonitor (#27)", () => {
  beforeEach(() => {
    getJobCounts.mockReset();
    notifyOps.mockReset();
  });

  it("alerta una vez al superar el umbral y deja de spamear hasta normalizar", async () => {
    process.env.QUEUE_DEPTH_ALERT_THRESHOLD = "50";
    const { checkQueueDepth } = await import("../queueMonitor.js");

    getJobCounts.mockResolvedValue({ waiting: 60, active: 1, delayed: 0 });
    const r1 = await checkQueueDepth();
    expect(r1?.waiting).toBe(60);
    expect(r1?.alerted).toBe(true);
    expect(notifyOps).toHaveBeenCalledTimes(1);

    // Sigue alto → no vuelve a alertar.
    const r2 = await checkQueueDepth();
    expect(r2?.alerted).toBe(false);
    expect(notifyOps).toHaveBeenCalledTimes(1);

    // Se normaliza → resetea el estado de alerta.
    getJobCounts.mockResolvedValue({ waiting: 5, active: 0, delayed: 0 });
    await checkQueueDepth();

    // Vuelve a saturarse → alerta de nuevo.
    getJobCounts.mockResolvedValue({ waiting: 70, active: 0, delayed: 0 });
    const r4 = await checkQueueDepth();
    expect(r4?.alerted).toBe(true);
    expect(notifyOps).toHaveBeenCalledTimes(2);
  });
});
