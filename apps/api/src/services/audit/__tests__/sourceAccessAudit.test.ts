import { describe, it, expect, vi } from "vitest";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db, auditLogs, consentGrants, users } from "../../../db/index.js";
import { getConsentService } from "../../consent/consentService.js";
import { ConsentRequiredError } from "../../consent/consentGate.js";
import {
  errorCodeOf,
  listSourceAccessForUser,
  summarizeSourceAccess,
  toAuditRow,
  withSourceAccess,
  type SourceAccessEvent,
} from "../sourceAccessAudit.js";

const CTX = { connectorId: "cmf-test", trigger: "user" as const };

/** Reloj de mentira: cada llamada avanza 25 ms. */
function fakeClock() {
  let t = Date.parse("2026-09-16T12:00:00.000Z");
  return () => {
    const d = new Date(t);
    t += 25;
    return d;
  };
}

function memoryDeps(consent: { id: number; expiresAt: string | null } | null) {
  const events: SourceAccessEvent[] = [];
  return {
    events,
    deps: {
      findConsent: vi.fn(async () => consent),
      record: vi.fn(async (e: SourceAccessEvent) => {
        events.push(e);
      }),
      now: fakeClock(),
    },
  };
}

describe("withSourceAccess — gate + traza", () => {
  it("con consentimiento: registra started y succeeded con el mismo accessId, y devuelve el resultado", async () => {
    const { events, deps } = memoryDeps({ id: 7, expiresAt: null });
    const fn = vi.fn(async () => ({ rows: 3 }));

    const result = await withSourceAccess("u1", "cmf_debt_report", CTX, fn, deps);

    expect(result).toEqual({ rows: 3 });
    expect(events.map((e) => e.outcome)).toEqual(["started", "succeeded"]);
    expect(events[0].accessId).toBe(events[1].accessId);
    expect(events[1].consentGrantId).toBe(7);
    expect(events[1].durationMs).toBe(25);
    expect(fn).toHaveBeenCalledWith({ accessId: events[0].accessId, consentGrantId: 7 });
  });

  it("sin consentimiento: registra denied, lanza ConsentRequiredError y NO consulta la fuente", async () => {
    const { events, deps } = memoryDeps(null);
    const fn = vi.fn(async () => "no debería correr");

    await expect(withSourceAccess("u1", "sii_tax_data", CTX, fn, deps)).rejects.toBeInstanceOf(
      ConsentRequiredError,
    );
    expect(fn).not.toHaveBeenCalled();
    expect(events.map((e) => e.outcome)).toEqual(["denied"]);
  });

  it("fail-closed: si el started no se puede escribir, la fuente no se toca", async () => {
    const { deps } = memoryDeps({ id: 7, expiresAt: null });
    deps.record.mockRejectedValueOnce(new Error("BD caída"));
    const fn = vi.fn(async () => "no debería correr");

    await expect(withSourceAccess("u1", "cmf_debt_report", CTX, fn, deps)).rejects.toThrow(
      "BD caída",
    );
    expect(fn).not.toHaveBeenCalled();
  });

  it("si el conector falla: registra failed con el código (no el mensaje) y relanza el error original", async () => {
    const { events, deps } = memoryDeps({ id: 7, expiresAt: null });
    const boom = Object.assign(new Error("RUT 11.111.111-1 bloqueado"), { code: "SOURCE_LOCKED" });

    await expect(
      withSourceAccess(
        "u1",
        "cmf_debt_report",
        CTX,
        async () => {
          throw boom;
        },
        deps,
      ),
    ).rejects.toBe(boom);

    expect(events.map((e) => e.outcome)).toEqual(["started", "failed"]);
    expect(events[1].errorCode).toBe("SOURCE_LOCKED");
    expect(JSON.stringify(toAuditRow(events[1]))).not.toContain("11.111.111");
  });

  it("si falla registrar el término, el resultado del conector igual se devuelve", async () => {
    const { deps } = memoryDeps({ id: 7, expiresAt: null });
    deps.record.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("BD caída"));

    await expect(
      withSourceAccess("u1", "cmf_debt_report", CTX, async () => "ok", deps),
    ).resolves.toBe("ok");
  });
});

describe("errorCodeOf", () => {
  it("prefiere code, luego name, y nunca el mensaje", () => {
    expect(errorCodeOf(Object.assign(new Error("x"), { code: "E_TIMEOUT" }))).toBe("E_TIMEOUT");
    expect(errorCodeOf(new TypeError("dato sensible"))).toBe("TypeError");
    expect(errorCodeOf("un string")).toBe("unknown_error");
  });
});

describe("summarizeSourceAccess", () => {
  const row = (action: string, entityId: string, timestamp: string, details: object) => ({
    action: `source_access.${action}`,
    entity: "cmf_debt_report",
    entityId,
    timestamp,
    details: JSON.stringify(details),
  });

  it("fusiona inicio y término por accessId, más reciente primero", () => {
    const entries = summarizeSourceAccess([
      row("succeeded", "a", "2026-09-16T12:00:01Z", { durationMs: 900, connectorId: "cmf" }),
      row("started", "a", "2026-09-16T12:00:00Z", { consentGrantId: 3, connectorId: "cmf" }),
      row("denied", "b", "2026-09-16T13:00:00Z", { connectorId: "cmf", trigger: "scheduled" }),
      row("started", "c", "2026-09-16T11:00:00Z", { connectorId: "cmf" }),
    ]);

    expect(entries.map((e) => [e.accessId, e.outcome])).toEqual([
      ["b", "denied"],
      ["a", "succeeded"],
      ["c", "started"], // sin término: sigue corriendo o murió a mitad
    ]);
    expect(entries[1]).toMatchObject({
      consentGrantId: 3,
      durationMs: 900,
      startedAt: "2026-09-16T12:00:00Z",
      finishedAt: "2026-09-16T12:00:01Z",
    });
  });

  it("ignora filas de otras acciones y details corruptos", () => {
    const entries = summarizeSourceAccess([
      { action: "asset.dedupe", entity: null, entityId: "x", timestamp: "t", details: null },
      { ...row("started", "z", "2026-09-16T12:00:00Z", {}), details: "{no-json" },
    ]);
    expect(entries.map((e) => e.accessId)).toEqual(["z"]);
  });
});

describe("withSourceAccess — integración con la BD", () => {
  it("consulta autorizada y consulta rechazada quedan en audit_logs y se leen por usuario", async () => {
    const userId = `audit-${randomUUID()}`;
    await db
      .insert(users)
      .values({
        id: userId,
        username: userId,
        email: `${userId}@test.local`,
        passwordHash: "test-hash",
      })
      .onConflictDoNothing();

    const svc = getConsentService();
    const grant = await svc.create({ userId, resourceTypes: ["cmf_debt_report"] });
    await svc.updateStatus(grant.id, "authorized", { userId });

    await withSourceAccess(userId, "cmf_debt_report", CTX, async () => "ok");
    await expect(
      withSourceAccess(userId, "afc_employment", CTX, async () => "no"),
    ).rejects.toBeInstanceOf(ConsentRequiredError);

    const entries = await listSourceAccessForUser(userId);
    expect(entries).toHaveLength(2);
    const byType = Object.fromEntries(entries.map((e) => [e.resourceType, e]));
    expect(byType.cmf_debt_report).toMatchObject({
      outcome: "succeeded",
      consentGrantId: grant.id,
      connectorId: "cmf-test",
      trigger: "user",
    });
    expect(byType.afc_employment.outcome).toBe("denied");

    await db.delete(auditLogs).where(eq(auditLogs.userId, userId));
    await db.delete(consentGrants).where(eq(consentGrants.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
  });
});
