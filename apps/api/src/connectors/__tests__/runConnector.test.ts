import { describe, it, expect, vi, beforeEach } from "vitest";
import { UnrecoverableError } from "bullmq";
import { ConsentRequiredError } from "../../services/consent/consentGate.js";
import { clearConnectors, registerConnector, type SourceConnector } from "../registry.js";
import {
  UnknownConnectorError,
  isRetryableConnectorError,
  requestConnectorRun,
  runConnector,
} from "../runConnector.js";
import { processConnectorJob } from "../../workers/connectorWorker.js";
import { loadJobFile } from "../../workers/documentWorker.js";

// Gate + traza: se prueban aparte (sourceAccessAudit.test.ts). Acá sólo importa que el conector
// corra DENTRO de withSourceAccess con el recurso y contexto correctos.
const { sourceAccessSpy } = vi.hoisted(() => ({
  sourceAccessSpy: vi.fn(
    async (_u: string, _r: string, _c: unknown, fn: (g: unknown) => Promise<unknown>) =>
      fn({ accessId: "access-1", consentGrantId: 9 }),
  ),
}));
vi.mock("../../services/audit/sourceAccessAudit.js", async (orig) => ({
  ...(await orig<typeof import("../../services/audit/sourceAccessAudit.js")>()),
  withSourceAccess: sourceAccessSpy,
}));

const noWait = { sleep: async () => {}, random: () => 0 };

function fakeConnector(over: Partial<SourceConnector> = {}): SourceConnector {
  return {
    id: "cmf-fake",
    resourceType: "cmf_debt_report",
    run: vi.fn(async () => ({ deudas: 2 })),
    ...over,
  };
}

beforeEach(() => {
  clearConnectors();
  sourceAccessSpy.mockClear();
});

describe("registry", () => {
  it("rechaza ids duplicados", () => {
    registerConnector(fakeConnector());
    expect(() => registerConnector(fakeConnector())).toThrow("duplicado");
  });
});

describe("runConnector", () => {
  it("corre el conector dentro de withSourceAccess con su recurso y el grant", async () => {
    const connector = fakeConnector();
    registerConnector(connector);

    const result = await runConnector({ userId: "u1", connectorId: "cmf-fake", trigger: "user" });

    expect(result).toEqual({ deudas: 2 });
    expect(sourceAccessSpy.mock.calls[0].slice(0, 3)).toEqual([
      "u1",
      "cmf_debt_report",
      { connectorId: "cmf-fake", trigger: "user" },
    ]);
    expect(connector.run).toHaveBeenCalledWith({
      userId: "u1",
      accessId: "access-1",
      consentGrantId: 9,
    });
  });

  it("desde la cola, la traza conserva quién la pidió y agrega el jobId", async () => {
    registerConnector(fakeConnector());
    await runConnector(
      { userId: "u1", connectorId: "cmf-fake", trigger: "scheduled" },
      { jobId: "42" },
    );
    expect(sourceAccessSpy.mock.calls[0][2]).toEqual({
      connectorId: "cmf-fake",
      trigger: "scheduled",
      jobId: "42",
    });
  });

  it("conector desconocido → UnknownConnectorError, sin tocar el gate", async () => {
    await expect(
      runConnector({ userId: "u1", connectorId: "nope", trigger: "user" }),
    ).rejects.toBeInstanceOf(UnknownConnectorError);
    expect(sourceAccessSpy).not.toHaveBeenCalled();
  });
});

describe("requestConnectorRun", () => {
  it("con cola: encola sin correr, deduplicado por usuario+conector", async () => {
    const connector = fakeConnector();
    registerConnector(connector);
    const add = vi.fn(async () => ({ id: "job-7" }));

    const out = await requestConnectorRun("u1", "cmf-fake", { queue: { add } as never });

    expect(out).toEqual({ mode: "queued", jobId: "job-7" });
    expect(add).toHaveBeenCalledWith(
      "cmf-fake",
      { userId: "u1", connectorId: "cmf-fake", trigger: "user" },
      { deduplication: { id: "cmf-fake-u1" } },
    );
    expect(connector.run).not.toHaveBeenCalled();
  });

  it("sin cola: corre en el proceso y reintenta errores pasajeros", async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce({ deudas: 1 });
    registerConnector(fakeConnector({ run }));

    const out = await requestConnectorRun("u1", "cmf-fake", { queue: null, retry: noWait });

    expect(out).toEqual({ mode: "inline", result: { deudas: 1 } });
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("sin cola: NO reintenta la falta de consentimiento", async () => {
    registerConnector(fakeConnector());
    // Sólo el primer intento se rechaza: si reintentara, el segundo pasaría y no lanzaría.
    sourceAccessSpy.mockRejectedValueOnce(new ConsentRequiredError("u1", "cmf_debt_report"));

    await expect(
      requestConnectorRun("u1", "cmf-fake", { queue: null, retry: noWait }),
    ).rejects.toBeInstanceOf(ConsentRequiredError);
    expect(sourceAccessSpy).toHaveBeenCalledTimes(1);
  });

  it("conector desconocido falla antes de encolar", async () => {
    const add = vi.fn();
    await expect(
      requestConnectorRun("u1", "nope", { queue: { add } as never }),
    ).rejects.toBeInstanceOf(UnknownConnectorError);
    expect(add).not.toHaveBeenCalled();
  });
});

describe("isRetryableConnectorError", () => {
  it("respeta lo que declara el conector", () => {
    const connector = fakeConnector({ isRetryable: (e) => (e as Error).message !== "clave" });
    expect(isRetryableConnectorError(connector, new Error("timeout"))).toBe(true);
    expect(isRetryableConnectorError(connector, new Error("clave"))).toBe(false);
  });
});

describe("processConnectorJob (worker)", () => {
  it("un error sin arreglo sale como UnrecoverableError con el código, no el mensaje", async () => {
    registerConnector(
      fakeConnector({
        run: async () => {
          throw Object.assign(new Error("RUT 11.111.111-1 no existe"), { code: "NOT_FOUND" });
        },
        isRetryable: () => false,
      }),
    );

    const err = await processConnectorJob({
      id: "1",
      data: { userId: "u1", connectorId: "cmf-fake", trigger: "user" },
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(UnrecoverableError);
    expect((err as Error).message).toBe("NOT_FOUND");
  });

  it("un error pasajero se relanza tal cual para que BullMQ reintente", async () => {
    const boom = new Error("timeout");
    registerConnector(
      fakeConnector({
        run: async () => {
          throw boom;
        },
      }),
    );
    await expect(
      processConnectorJob({
        id: "1",
        data: { userId: "u1", connectorId: "cmf-fake", trigger: "user" },
      }),
    ).rejects.toBe(boom);
  });
});

describe("loadJobFile (worker de documentos)", () => {
  it("lee el original desde el blob store; el PDF no viaja en Redis", async () => {
    const getObject = vi.fn(async () => Buffer.from("%PDF"));
    const buf = await loadJobFile({ userId: "u1", blobKey: "originals/u1/x" }, { getObject });
    expect(getObject).toHaveBeenCalledWith("originals/u1/x");
    expect(buf?.toString()).toBe("%PDF");
  });

  it("original vencido/borrado → null; jobs viejos con base64 siguen funcionando", async () => {
    const getObject = vi.fn(async () => null);
    expect(await loadJobFile({ userId: "u1", blobKey: "gone" }, { getObject })).toBeNull();
    const legacy = await loadJobFile(
      { userId: "u1", fileBase64: Buffer.from("%PDF").toString("base64") },
      { getObject },
    );
    expect(legacy?.toString()).toBe("%PDF");
  });
});
