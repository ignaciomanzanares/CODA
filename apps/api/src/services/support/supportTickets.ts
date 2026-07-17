/**
 * Canal de reclamos y consultas — registro por caso con trazabilidad (NCG 502).
 *
 * Reglas:
 *  - `mensaje` y `respuesta` se cifran en reposo (pueden contener detalle
 *    financiero del usuario); se devuelven en claro al caller autorizado.
 *  - El folio visible se deriva del id + año de creación (estable, sin columna).
 *  - Responder un ticket registra `respondedAt`; el estado es parte del registro
 *    auditable (abierto → en_revision → resuelto/cerrado).
 */
import { db, supportTickets, eq, desc } from "../../db/index.js";
import { encryptField, decryptField, looksEncrypted } from "../crypto/fieldEncryption.js";

export const TICKET_TIPOS = ["reclamo", "consulta"] as const;
export const TICKET_ESTADOS = ["abierto", "en_revision", "resuelto", "cerrado"] as const;
export type TicketTipo = (typeof TICKET_TIPOS)[number];
export type TicketEstado = (typeof TICKET_ESTADOS)[number];

export interface SupportTicket {
  id: number;
  folio: string;
  userId: string;
  tipo: string;
  asunto: string;
  mensaje: string;
  estado: string;
  respuesta: string | null;
  respondedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Folio visible y estable: R-2026-000012 (reclamo) / C-2026-000034 (consulta). */
export function folioFor(t: { id: number; tipo: string; createdAt: string }): string {
  const year = String(t.createdAt).slice(0, 4) || String(new Date().getFullYear());
  const prefix = t.tipo === "consulta" ? "C" : "R";
  return `${prefix}-${year}-${String(t.id).padStart(6, "0")}`;
}

function maybeDecrypt(v: string | null): string | null {
  if (v == null) return v;
  return looksEncrypted(v) ? decryptField(v) : v;
}

function toTicket(row: Record<string, unknown>): SupportTicket {
  const base = {
    id: Number(row.id),
    userId: String(row.userId),
    tipo: String(row.tipo),
    asunto: String(row.asunto),
    mensaje: maybeDecrypt((row.mensaje as string) ?? "") ?? "",
    estado: String(row.estado),
    respuesta: maybeDecrypt((row.respuesta as string) ?? null),
    respondedAt: (row.respondedAt as string) ?? null,
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
  };
  return { ...base, folio: folioFor(base) };
}

export async function createTicket(
  userId: string,
  input: { tipo: TicketTipo; asunto: string; mensaje: string },
): Promise<SupportTicket> {
  if (!db) throw new Error("Database not available");
  const [row] = await db
    .insert(supportTickets)
    .values({
      userId,
      tipo: input.tipo,
      asunto: input.asunto.trim().slice(0, 200),
      mensaje: encryptField(input.mensaje.trim()),
      estado: "abierto",
    })
    .returning();
  return toTicket(row as Record<string, unknown>);
}

export async function listTicketsForUser(userId: string): Promise<SupportTicket[]> {
  if (!db) return [];
  const rows = await db
    .select()
    .from(supportTickets)
    .where(eq(supportTickets.userId, userId))
    .orderBy(desc(supportTickets.id));
  return (rows as Record<string, unknown>[]).map(toTicket);
}

export async function listAllTickets(): Promise<SupportTicket[]> {
  if (!db) return [];
  const rows = await db.select().from(supportTickets).orderBy(desc(supportTickets.id));
  return (rows as Record<string, unknown>[]).map(toTicket);
}

export async function respondTicket(
  id: number,
  changes: { estado?: TicketEstado; respuesta?: string },
): Promise<SupportTicket | null> {
  if (!db) throw new Error("Database not available");
  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (changes.estado) patch.estado = changes.estado;
  if (changes.respuesta != null && changes.respuesta.trim() !== "") {
    patch.respuesta = encryptField(changes.respuesta.trim());
    patch.respondedAt = new Date().toISOString();
    // Responder sin fijar estado explícito mueve el caso a revisión resuelta.
    if (!changes.estado) patch.estado = "resuelto";
  }
  const [row] = await db
    .update(supportTickets)
    .set(patch)
    .where(eq(supportTickets.id, id))
    .returning();
  return row ? toTicket(row as Record<string, unknown>) : null;
}
