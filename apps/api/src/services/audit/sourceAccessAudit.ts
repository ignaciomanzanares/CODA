/**
 * D1 — Traza de auditoría POR CONSULTA a una fuente de datos del titular (CMF, SII, AFC, banco).
 *
 * El gate de consentimiento (D2) decide si se puede consultar; esta traza prueba después qué se
 * consultó, bajo qué consentimiento, qué lo disparó, cómo terminó y cuánto tardó. Todo conector
 * pasa por `withSourceAccess` — no llama al gate por su cuenta.
 *
 * Reglas:
 *  - FAIL-CLOSED: la fila `started` se escribe ANTES de tocar la fuente. Si no se puede escribir,
 *    la consulta no ocurre: no hay consulta sin traza.
 *  - Append-only: inicio y término son filas distintas de `audit_logs`, unidas por `accessId`
 *    (entity_id). Nunca se actualiza una fila. Cada reintento es una consulta nueva (otro accessId).
 *  - Sin PII: `details` guarda ids, códigos y tiempos. Del error se guarda sólo el nombre/código,
 *    nunca el mensaje (puede traer RUT, nombres o montos).
 *  - Los rechazos por falta de consentimiento también quedan (`denied`).
 */

import { randomUUID } from "crypto";
import { and, desc, eq, like } from "drizzle-orm";
import { db, auditLogs } from "../../db/index.js";
import { logger } from "../../logger.js";
import { ConsentRequiredError, findActiveConsent } from "../consent/consentGate.js";
import type { ConsentResourceType } from "../consent/types.js";

export const SOURCE_ACCESS_ACTION_PREFIX = "source_access.";

export type SourceAccessOutcome = "started" | "succeeded" | "failed" | "denied";

/** Quién pidió la consulta: el usuario, o una tarea programada. Si pasó por la cola, lleva `jobId`. */
export type SourceAccessTrigger = "user" | "scheduled";

export interface SourceAccessContext {
  /** Conector que consulta (p. ej. "cmf-informe-deudas", "santander"). */
  connectorId: string;
  trigger: SourceAccessTrigger;
  /** Id del job, si vino de la cola (para cruzar con los logs del worker). */
  jobId?: string;
}

export interface SourceAccessEvent extends SourceAccessContext {
  accessId: string;
  userId: string;
  resourceType: ConsentResourceType;
  outcome: SourceAccessOutcome;
  consentGrantId?: number | null;
  durationMs?: number;
  errorCode?: string;
  at: string;
}

/** Lo que recibe el conector dentro de `withSourceAccess`. */
export interface SourceAccessGrant {
  accessId: string;
  consentGrantId: number;
}

/** Nombre/código del error, sin el mensaje (que puede traer PII). */
export function errorCodeOf(err: unknown): string {
  if (err && typeof err === "object") {
    const code = (err as { code?: unknown }).code;
    if (typeof code === "string" && code) return code.slice(0, 64);
    const name = (err as { name?: unknown }).name;
    if (typeof name === "string" && name) return name.slice(0, 64);
  }
  return "unknown_error";
}

/** Evento → fila de `audit_logs`. Pura. */
export function toAuditRow(e: SourceAccessEvent) {
  const details: Record<string, unknown> = {
    v: 1,
    connectorId: e.connectorId,
    trigger: e.trigger,
  };
  if (e.jobId) details.jobId = e.jobId;
  if (e.consentGrantId != null) details.consentGrantId = e.consentGrantId;
  if (e.durationMs != null) details.durationMs = e.durationMs;
  if (e.errorCode) details.errorCode = e.errorCode;
  return {
    userId: e.userId,
    action: `${SOURCE_ACCESS_ACTION_PREFIX}${e.outcome}`,
    entity: e.resourceType,
    entityId: e.accessId,
    timestamp: e.at,
    details: JSON.stringify(details),
  };
}

export async function recordSourceAccess(e: SourceAccessEvent): Promise<void> {
  await db.insert(auditLogs).values(toAuditRow(e));
}

export interface SourceAccessDeps {
  findConsent: typeof findActiveConsent;
  record: (e: SourceAccessEvent) => Promise<void>;
  now: () => Date;
}

const defaultDeps: SourceAccessDeps = {
  findConsent: findActiveConsent,
  record: recordSourceAccess,
  now: () => new Date(),
};

/**
 * Único punto por el que un conector consulta una fuente: gate de consentimiento + traza.
 * Lanza `ConsentRequiredError` sin consentimiento vigente (y deja el `denied` registrado).
 * Relanza el error del conector tal cual (y deja el `failed` registrado).
 */
export async function withSourceAccess<T>(
  userId: string,
  resourceType: ConsentResourceType,
  ctx: SourceAccessContext,
  fn: (grant: SourceAccessGrant) => Promise<T>,
  deps: Partial<SourceAccessDeps> = {},
): Promise<T> {
  const d = { ...defaultDeps, ...deps };
  const accessId = randomUUID();
  const base = { ...ctx, accessId, userId, resourceType };

  // Registrar el término es best-effort: la consulta ya ocurrió y su `started` ya está escrito.
  const recordEnd = async (e: SourceAccessEvent) => {
    try {
      await d.record(e);
    } catch (err) {
      logger.error(
        { err, accessId, resourceType, connectorId: ctx.connectorId, outcome: e.outcome },
        "[sourceAccess] no se pudo registrar el término de la consulta",
      );
    }
  };

  const consent = await d.findConsent(userId, resourceType);
  if (!consent) {
    await recordEnd({ ...base, outcome: "denied", at: d.now().toISOString() });
    throw new ConsentRequiredError(userId, resourceType);
  }

  // Fail-closed: si esto lanza, la fuente no se toca.
  const startedAt = d.now();
  await d.record({
    ...base,
    outcome: "started",
    consentGrantId: consent.id,
    at: startedAt.toISOString(),
  });

  try {
    const result = await fn({ accessId, consentGrantId: consent.id });
    const end = d.now();
    await recordEnd({
      ...base,
      outcome: "succeeded",
      consentGrantId: consent.id,
      durationMs: end.getTime() - startedAt.getTime(),
      at: end.toISOString(),
    });
    return result;
  } catch (err) {
    const end = d.now();
    await recordEnd({
      ...base,
      outcome: "failed",
      consentGrantId: consent.id,
      durationMs: end.getTime() - startedAt.getTime(),
      errorCode: errorCodeOf(err),
      at: end.toISOString(),
    });
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Lectura: una entrada por consulta (inicio + término fusionados)
// ─────────────────────────────────────────────────────────────────────────────

export interface SourceAccessEntry {
  accessId: string;
  resourceType: string;
  connectorId: string | null;
  trigger: string | null;
  jobId: string | null;
  /** `started` sin término = sigue corriendo o el proceso murió a mitad. */
  outcome: SourceAccessOutcome;
  consentGrantId: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  errorCode: string | null;
}

interface AuditRowLike {
  action: string;
  entity: string | null;
  entityId: string | null;
  timestamp: string;
  details: string | null;
}

function parseDetails(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" ? v : null);

/** Filas de `audit_logs` → una entrada por consulta, más reciente primero. Pura. */
export function summarizeSourceAccess(rows: AuditRowLike[]): SourceAccessEntry[] {
  const byId = new Map<string, SourceAccessEntry>();
  for (const row of rows) {
    if (!row.entityId || !row.action.startsWith(SOURCE_ACCESS_ACTION_PREFIX)) continue;
    const outcome = row.action.slice(SOURCE_ACCESS_ACTION_PREFIX.length) as SourceAccessOutcome;
    const det = parseDetails(row.details);
    const entry: SourceAccessEntry = byId.get(row.entityId) ?? {
      accessId: row.entityId,
      resourceType: row.entity ?? "unknown",
      connectorId: null,
      trigger: null,
      jobId: null,
      outcome,
      consentGrantId: null,
      startedAt: null,
      finishedAt: null,
      durationMs: null,
      errorCode: null,
    };
    entry.connectorId ??= str(det.connectorId);
    entry.trigger ??= str(det.trigger);
    entry.jobId ??= str(det.jobId);
    entry.consentGrantId ??= num(det.consentGrantId);
    if (outcome === "started") {
      entry.startedAt = row.timestamp;
    } else {
      entry.outcome = outcome;
      entry.finishedAt = row.timestamp;
      entry.durationMs = num(det.durationMs);
      entry.errorCode = str(det.errorCode);
      // Un rechazo no tiene inicio: la consulta nunca empezó.
      if (outcome === "denied") entry.startedAt = row.timestamp;
    }
    byId.set(row.entityId, entry);
  }
  return [...byId.values()].sort((a, b) =>
    String(b.startedAt ?? b.finishedAt ?? "").localeCompare(
      String(a.startedAt ?? a.finishedAt ?? ""),
    ),
  );
}

/** Consultas a fuentes hechas con los datos del usuario, más reciente primero. */
export async function listSourceAccessForUser(
  userId: string,
  limit = 50,
): Promise<SourceAccessEntry[]> {
  const rows = await db
    .select({
      action: auditLogs.action,
      entity: auditLogs.entity,
      entityId: auditLogs.entityId,
      timestamp: auditLogs.timestamp,
      details: auditLogs.details,
    })
    .from(auditLogs)
    .where(
      and(eq(auditLogs.userId, userId), like(auditLogs.action, `${SOURCE_ACCESS_ACTION_PREFIX}%`)),
    )
    .orderBy(desc(auditLogs.id))
    // Hasta 2 filas por consulta (inicio + término).
    .limit(limit * 2);
  return summarizeSourceAccess(rows).slice(0, limit);
}
