import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db, connectorSecrets, users } from "../../../db/index.js";
import { looksEncrypted } from "../../crypto/fieldEncryption.js";
import {
  SecretExpiredError,
  SecretMissingError,
  deleteSecret,
  deleteSecretsForUser,
  describeSecret,
  getSecret,
  purgeExpiredSecrets,
  storeSecret,
} from "../connectorSecretVault.js";

const CARPETA = { codigo: "30635361", clave: "clave-de-la-carpeta" };
const in90Days = (from = Date.now()) => new Date(from + 90 * 24 * 60 * 60 * 1000);

let userId: string;

beforeEach(async () => {
  userId = `vault-${randomUUID()}`;
  await db
    .insert(users)
    .values({
      id: userId,
      username: userId,
      email: `${userId}@test.local`,
      passwordHash: "test-hash",
    })
    .onConflictDoNothing();
});

async function cleanup() {
  await db.delete(connectorSecrets).where(eq(connectorSecrets.userId, userId));
  await db.delete(users).where(eq(users.id, userId));
}

describe("bóveda de secretos de conectores", () => {
  it("guarda cifrado y sólo el conector lo recupera en claro", async () => {
    const desc = await storeSecret({
      userId,
      connectorId: "sii-carpeta",
      secret: CARPETA,
      expiresAt: in90Days(),
    });
    expect(desc.expired).toBe(false);
    expect(desc.lastUsedAt).toBeNull();

    // En reposo no está el texto plano.
    const [row] = await db
      .select()
      .from(connectorSecrets)
      .where(eq(connectorSecrets.userId, userId));
    expect(looksEncrypted(row.secret)).toBe(true);
    expect(row.secret).not.toContain("clave-de-la-carpeta");
    expect(row.secret).not.toContain("30635361");

    expect(await getSecret(userId, "sii-carpeta")).toEqual(CARPETA);
    // Usarlo deja rastro de cuándo.
    expect((await describeSecret(userId, "sii-carpeta"))!.lastUsedAt).not.toBeNull();

    await cleanup();
  });

  it("compartir de nuevo REEMPLAZA: una fila por usuario+conector y sin uso heredado", async () => {
    await storeSecret({
      userId,
      connectorId: "sii-carpeta",
      secret: CARPETA,
      expiresAt: in90Days(),
    });
    await getSecret(userId, "sii-carpeta");

    await storeSecret({
      userId,
      connectorId: "sii-carpeta",
      secret: { codigo: "99999999", clave: "otra" },
      expiresAt: in90Days(),
    });

    const rows = await db
      .select()
      .from(connectorSecrets)
      .where(eq(connectorSecrets.userId, userId));
    expect(rows).toHaveLength(1);
    expect(await getSecret(userId, "sii-carpeta")).toEqual({ codigo: "99999999", clave: "otra" });

    await cleanup();
  });

  it("vencido = inexistente para el conector, aunque la fila siga ahí", async () => {
    const soon = new Date(Date.now() + 1000);
    await storeSecret({ userId, connectorId: "sii-carpeta", secret: CARPETA, expiresAt: soon });

    const later = new Date(soon.getTime() + 1000);
    await expect(getSecret(userId, "sii-carpeta", later)).rejects.toBeInstanceOf(
      SecretExpiredError,
    );
    expect((await describeSecret(userId, "sii-carpeta", later))!.expired).toBe(true);

    await cleanup();
  });

  it("no guarda un secreto vacío ni uno ya vencido", async () => {
    await expect(
      storeSecret({ userId, connectorId: "x", secret: {}, expiresAt: in90Days() }),
    ).rejects.toThrow("vacío");
    await expect(
      storeSecret({ userId, connectorId: "x", secret: { a: "" }, expiresAt: in90Days() }),
    ).rejects.toThrow("vacío");
    await expect(
      storeSecret({
        userId,
        connectorId: "x",
        secret: CARPETA,
        expiresAt: new Date(Date.now() - 1000),
      }),
    ).rejects.toThrow("futuro");

    await cleanup();
  });

  it("sin secreto guardado lanza SecretMissingError", async () => {
    await expect(getSecret(userId, "no-existe")).rejects.toBeInstanceOf(SecretMissingError);
    expect(await describeSecret(userId, "no-existe")).toBeNull();
    expect(await deleteSecret(userId, "no-existe")).toBe(false);
    await cleanup();
  });

  it("revocar borra, y el cierre de cuenta borra todos los del usuario", async () => {
    await storeSecret({
      userId,
      connectorId: "sii-carpeta",
      secret: CARPETA,
      expiresAt: in90Days(),
    });
    await storeSecret({
      userId,
      connectorId: "otra-fuente",
      secret: CARPETA,
      expiresAt: in90Days(),
    });

    expect(await deleteSecret(userId, "sii-carpeta")).toBe(true);
    expect(await describeSecret(userId, "sii-carpeta")).toBeNull();
    expect(await deleteSecretsForUser(userId)).toBe(1);
    expect(
      await db.select().from(connectorSecrets).where(eq(connectorSecrets.userId, userId)),
    ).toHaveLength(0);

    await cleanup();
  });

  it("el job de retención borra los vencidos y deja los vigentes", async () => {
    const soon = new Date(Date.now() + 1000);
    await storeSecret({ userId, connectorId: "vencido", secret: CARPETA, expiresAt: soon });
    await storeSecret({ userId, connectorId: "vigente", secret: CARPETA, expiresAt: in90Days() });

    const purged = await purgeExpiredSecrets(new Date(soon.getTime() + 1000));
    expect(purged).toBeGreaterThanOrEqual(1);
    const left = await db
      .select({ connectorId: connectorSecrets.connectorId })
      .from(connectorSecrets)
      .where(eq(connectorSecrets.userId, userId));
    expect(left.map((r) => r.connectorId)).toEqual(["vigente"]);

    await cleanup();
  });
});
