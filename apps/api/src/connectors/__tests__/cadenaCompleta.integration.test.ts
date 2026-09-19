import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db, auditLogs, consentGrants, users, userFinancialSources } from "../../db/index.js";
import { getConsentService } from "../../services/consent/consentService.js";
import { ConsentRequiredError } from "../../services/consent/consentGate.js";
import { listSourceAccessForUser } from "../../services/audit/sourceAccessAudit.js";
import { clearConnectors, registerConnector } from "../registry.js";
import { requestConnectorRun } from "../runConnector.js";

/**
 * EL VIAJE COMPLETO de una consulta a una fuente, contra la BD real.
 *
 * Cada tramo estaba probado por separado —gate, traza, registro de conectores, persistencia— y
 * las tres roturas serias del día pasaron JUSTO en las costuras: un pipeline sin llamador, un
 * dato que se guardaba y no salía, un consentimiento que no se podía otorgar. Un test por tramo
 * no ve nada de eso.
 *
 * Acá se recorre entero: el titular autoriza → el conector corre → los datos quedan guardados →
 * la consulta aparece en SU registro con el permiso que la autorizó → revoca → la siguiente
 * consulta se bloquea y el bloqueo también queda registrado.
 */

const CONECTOR = "fuente-de-prueba";
let userId: string;
let corridas: number;

async function seedUser(): Promise<string> {
  const id = `cadena-${randomUUID()}`;
  await db
    .insert(users)
    .values({ id, username: id, email: `${id}@test.local`, passwordHash: "test-hash" })
    .onConflictDoNothing();
  return id;
}

beforeEach(async () => {
  userId = await seedUser();
  corridas = 0;
  clearConnectors();
  registerConnector({
    id: CONECTOR,
    resourceType: "sii_tax_data",
    async run(ctx) {
      corridas += 1;
      // Un conector real termina persistiendo lo que trajo; esto imita ese último tramo.
      await db.insert(userFinancialSources).values({
        id: randomUUID(),
        userId: ctx.userId,
        source: "sii",
        verifiedMonthlyIncomeClp: 1_200_000,
        rawData: JSON.stringify({ accessId: ctx.accessId }),
        extractedAt: new Date().toISOString(),
      });
      return { rentaMensualClp: 1_200_000 };
    },
  });
});

afterEach(async () => {
  clearConnectors();
  await db.delete(userFinancialSources).where(eq(userFinancialSources.userId, userId));
  await db.delete(auditLogs).where(eq(auditLogs.userId, userId));
  await db.delete(consentGrants).where(eq(consentGrants.userId, userId));
  await db.delete(users).where(eq(users.id, userId));
});

describe("la cadena completa: consentir → consultar → quedar registrado → revocar", () => {
  it("recorre el viaje entero y deja el rastro que el titular puede ver", async () => {
    const svc = getConsentService();

    // 1. Sin permiso no se consulta, y el intento queda registrado como bloqueado.
    await expect(
      requestConnectorRun(userId, CONECTOR, { queue: null, retry: { attempts: 1 } }),
    ).rejects.toBeInstanceOf(ConsentRequiredError);
    expect(corridas).toBe(0);

    // 2. El titular autoriza (fuente oficial: la autoriza él, no un banco).
    const grant = await svc.create({ userId, resourceTypes: ["sii_tax_data"] });
    const autorizado = await svc.authorizeOwn(grant.id, userId);
    expect(autorizado.ok).toBe(true);

    // 3. Ahora sí corre, y lo que trajo queda guardado.
    const salida = await requestConnectorRun(userId, CONECTOR, { queue: null });
    expect(salida).toEqual({ mode: "inline", result: { rentaMensualClp: 1_200_000 } });
    expect(corridas).toBe(1);

    const guardado = await db
      .select()
      .from(userFinancialSources)
      .where(eq(userFinancialSources.userId, userId));
    expect(guardado).toHaveLength(1);
    expect(guardado[0].verifiedMonthlyIncomeClp).toBe(1_200_000);

    // 4. La consulta aparece en el registro del titular, atada al permiso que la autorizó.
    const registro = await listSourceAccessForUser(userId);
    const consulta = registro.find((e) => e.outcome === "succeeded");
    expect(consulta).toMatchObject({
      resourceType: "sii_tax_data",
      connectorId: CONECTOR,
      consentGrantId: grant.id,
      trigger: "user",
    });
    // El accessId de la traza es el mismo que vio el conector: el rastro no se pierde en el camino.
    expect(JSON.parse(guardado[0].rawData ?? "{}").accessId).toBe(consulta!.accessId);

    // 5. Revocar corta de verdad, y el bloqueo también queda registrado.
    await svc.revoke(grant.id, userId);
    await expect(
      requestConnectorRun(userId, CONECTOR, { queue: null, retry: { attempts: 1 } }),
    ).rejects.toBeInstanceOf(ConsentRequiredError);
    expect(corridas).toBe(1);

    const bloqueados = (await listSourceAccessForUser(userId)).filter(
      (e) => e.outcome === "denied",
    );
    expect(bloqueados).toHaveLength(2); // el de antes de autorizar y el de después de revocar
  });

  it("un permiso de OTRA fuente no habilita esta consulta", async () => {
    const svc = getConsentService();
    const otro = await svc.create({ userId, resourceTypes: ["afc_employment"] });
    await svc.authorizeOwn(otro.id, userId);

    await expect(
      requestConnectorRun(userId, CONECTOR, { queue: null, retry: { attempts: 1 } }),
    ).rejects.toBeInstanceOf(ConsentRequiredError);
    expect(corridas).toBe(0);
  });
});
