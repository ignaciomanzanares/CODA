import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db, sql, documentParseOutcomes } from "../../../db/index.js";
import { storage } from "../../../storage.js";
import { recordParseOutcome, userFacingParseError } from "../parseOutcomes.js";

beforeAll(() => {
  db.run(
    sql`CREATE TABLE IF NOT EXISTS document_parse_outcomes (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, status TEXT NOT NULL,
      document_type TEXT, banco TEXT, detection_tier TEXT, parse_confidence REAL,
      transaction_count INTEGER, error_message TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  );
});

describe("parseOutcomes (#32)", () => {
  const unique = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  let userId = "";

  beforeAll(async () => {
    const user = await storage.createUser({
      email: `po-${unique}@example.com`,
      username: `po_${unique}`,
      passwordHash: "x:x",
    } as any);
    userId = user.id;
  });

  afterAll(async () => {
    await db.run(sql`DELETE FROM document_parse_outcomes WHERE user_id = ${userId}`);
    await db.run(sql`DELETE FROM users WHERE id = ${userId}`);
  });

  it("registra un outcome de éxito con metadata", async () => {
    await recordParseOutcome(userId, {
      status: "success",
      documentType: "cartola",
      banco: "Banco Estado",
      detectionTier: "tier1",
      parseConfidence: 0.92,
      transactionCount: 34,
    });
    const rows = await db
      .select()
      .from(documentParseOutcomes)
      .where(sql`user_id = ${userId}`);
    expect(rows.length).toBe(1);
    expect(rows[0].status).toBe("success");
    expect(rows[0].banco).toBe("Banco Estado");
    expect(rows[0].transactionCount).toBe(34);
  });

  it("registra un fallo y produce un mensaje accionable para el usuario", async () => {
    await recordParseOutcome(userId, {
      status: "failed",
      documentType: "cartola",
      errorMessage: "no se detectó formato",
    });
    const rows = await db
      .select()
      .from(documentParseOutcomes)
      .where(sql`user_id = ${userId} AND status = 'failed'`);
    expect(rows.length).toBe(1);

    const msg = userFacingParseError("Banco de Chile");
    expect(msg).toContain("Banco de Chile");
    expect(msg).not.toContain("no se detectó formato"); // no filtra el detalle técnico
  });
});
