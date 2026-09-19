import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * #27: el monitor alerta a Ops cuando la cola supera el umbral, y no spamea mientras sigue alto.
 * Mockeamos la cola y la capa de observabilidad para no depender de Redis.
 */
const getJobCounts = vi.fn();
vi.mock("../../../queues/documentQueue.js", () => ({
  documentQueue: { getJobCounts: (...a: string[]) => getJobCounts(...a) },
}));

const getConnectorCounts = vi.fn();
vi.mock("../../../queues/connectorQueue.js", () => ({
  connectorQueue: { getJobCounts: (...a: string[]) => getConnectorCounts(...a) },
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

/**
 * La cola de conectores se vigila aparte y por otra razón: un upload atascado lo nota el usuario
 * que está esperando su cartola en pantalla; una consulta a una fuente encolada y sin procesar no
 * la nota nadie — el usuario cree que sus datos están al día. Si el worker se cae, este chequeo
 * es lo único que avisa.
 */
describe("queueMonitor — cola de conectores (D1)", () => {
  beforeEach(async () => {
    getConnectorCounts.mockReset();
    notifyOps.mockReset();
    const { resetQueueAlertState } = await import("../queueMonitor.js");
    resetQueueAlertState();
  });

  it("alerta una vez al saturarse, con el conteo de fallidas, y no spamea", async () => {
    process.env.QUEUE_DEPTH_ALERT_THRESHOLD = "50";
    const { checkConnectorQueueDepth } = await import("../queueMonitor.js");

    getConnectorCounts.mockResolvedValue({ waiting: 70, active: 2, delayed: 1, failed: 4 });
    expect((await checkConnectorQueueDepth())?.alerted).toBe(true);
    expect(notifyOps).toHaveBeenCalledTimes(1);
    const [mensaje, detalles, opts] = notifyOps.mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    expect(mensaje).toContain("consultas a fuentes en espera");
    expect(detalles).toMatchObject({ waiting: 70, failed: 4 });
    // Clave propia: no se agrupa con la alerta de la cola de documentos.
    expect(opts).toEqual({ key: "connector_queue_depth" });

    // Sigue alto: no vuelve a avisar.
    expect((await checkConnectorQueueDepth())?.alerted).toBe(false);
    expect(notifyOps).toHaveBeenCalledTimes(1);

    // Se normaliza y vuelve a estar armado para la próxima.
    getConnectorCounts.mockResolvedValue({ waiting: 0, active: 0, delayed: 0, failed: 0 });
    await checkConnectorQueueDepth();
    getConnectorCounts.mockResolvedValue({ waiting: 99, active: 0, delayed: 0, failed: 0 });
    expect((await checkConnectorQueueDepth())?.alerted).toBe(true);
    expect(notifyOps).toHaveBeenCalledTimes(2);
  });

  it("si Redis falla al consultar, no lanza ni alerta", async () => {
    const { checkConnectorQueueDepth } = await import("../queueMonitor.js");
    getConnectorCounts.mockRejectedValue(new Error("ECONNREFUSED"));
    expect(await checkConnectorQueueDepth()).toBeNull();
    expect(notifyOps).not.toHaveBeenCalled();
  });
});
