/**
 * Canal de reclamos (NCG 502): registro por caso con cifrado en reposo,
 * folio estable derivado, y trazabilidad de la respuesta.
 */
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, supportTickets } from "../../src/db/index.js";
import { storage } from "../../src/storage.js";
import { looksEncrypted } from "../../src/services/crypto/fieldEncryption.js";
import {
  createTicket,
  listTicketsForUser,
  respondTicket,
  folioFor,
} from "../../src/services/support/supportTickets.js";

function unique(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function makeUser(): Promise<string> {
  const id = unique("support-user");
  await storage.createUser({
    id,
    username: id,
    email: `${id}@example.com`,
    passwordHash: "test",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  return id;
}

describe("supportTickets", () => {
  it("crea el caso cifrado en reposo y lo devuelve en claro con folio", async () => {
    const userId = await makeUser();
    const t = await createTicket(userId, {
      tipo: "reclamo",
      asunto: "Mi cartola quedó fallida",
      mensaje: "Subí mi cartola de mayo y quedó marcada como fallida sin explicación.",
    });

    expect(t.estado).toBe("abierto");
    expect(t.folio).toMatch(/^R-\d{4}-\d{6}$/);
    expect(t.mensaje).toContain("cartola de mayo");

    // En la tabla, el mensaje queda CIFRADO (PII financiera).
    const [row] = await db.select().from(supportTickets).where(eq(supportTickets.id, t.id));
    expect(looksEncrypted((row as { mensaje: string }).mensaje)).toBe(true);
  });

  it("lista solo los casos del usuario, más recientes primero", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const t1 = await createTicket(a, { tipo: "consulta", asunto: "Duda 1", mensaje: "1234567890" });
    const t2 = await createTicket(a, { tipo: "reclamo", asunto: "Caso 2", mensaje: "abcdefghij" });
    await createTicket(b, { tipo: "reclamo", asunto: "De otro", mensaje: "no debe salir" });

    const mine = await listTicketsForUser(a);
    expect(mine.map((t) => t.id)).toEqual([t2.id, t1.id]);
    expect(mine.every((t) => t.userId === a)).toBe(true);
  });

  it("responder registra respuesta cifrada, respondedAt y estado resuelto por defecto", async () => {
    const userId = await makeUser();
    const t = await createTicket(userId, {
      tipo: "reclamo",
      asunto: "Reclamo X",
      mensaje: "Detalle del reclamo con más de diez caracteres.",
    });

    const updated = await respondTicket(t.id, { respuesta: "Lo revisamos y quedó corregido." });
    expect(updated).not.toBeNull();
    expect(updated!.estado).toBe("resuelto");
    expect(updated!.respuesta).toContain("corregido");
    expect(updated!.respondedAt).toBeTruthy();

    const [row] = await db.select().from(supportTickets).where(eq(supportTickets.id, t.id));
    expect(looksEncrypted((row as { respuesta: string }).respuesta)).toBe(true);
  });

  it("cambiar solo estado no toca la respuesta ni respondedAt", async () => {
    const userId = await makeUser();
    const t = await createTicket(userId, {
      tipo: "consulta",
      asunto: "Consulta Y",
      mensaje: "Texto de consulta suficientemente largo.",
    });
    const updated = await respondTicket(t.id, { estado: "en_revision" });
    expect(updated!.estado).toBe("en_revision");
    expect(updated!.respuesta).toBeNull();
    expect(updated!.respondedAt).toBeNull();
  });

  it("folio: consulta usa prefijo C y el año de creación", () => {
    expect(folioFor({ id: 7, tipo: "consulta", createdAt: "2026-07-17 12:00:00" })).toBe(
      "C-2026-000007",
    );
    expect(folioFor({ id: 123, tipo: "reclamo", createdAt: "2025-01-02" })).toBe("R-2025-000123");
  });
});
