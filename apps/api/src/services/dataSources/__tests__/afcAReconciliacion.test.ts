/**
 * D6 → D7 de punta a punta: un certificado de la AFC subido por el titular tiene que terminar
 * como una señal de ingreso VERIFICADA dentro de la reconciliación, y llegar con su folio, que
 * es lo único que permite comprobar que el documento es auténtico.
 *
 * Las piezas estaban probadas por separado —lector, fusión, estado para la UI— y hoy las tres
 * roturas del día aparecieron justo en las costuras entre ellas: el scraper sin llamador, el
 * folio que no salía de la base y la fuente sin tarjeta de subida. Cada tramo tenía su test
 * verde. Este recorre el camino entero.
 */
import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { storage } from "../../../storage.js";
import { parseAfcCertificado } from "../afcParsers";
import { saveGovSourceData, getGovSources } from "../govSourceService";
import { getIncomeReconciliationForUser } from "../../risk/incomeReconciliationService";

/** Layout real del certificado de cotizaciones, con datos sintéticos. */
const certificado = [
  "                                        N° de folio ABCD-1234-EFGH-5678",
  "                                      Fecha de emisión: 17 de septiembre de 2026",
  "Certificado de cotizaciones previsionales acreditadas de Cuenta Individual por Cesantía",
  "AFC CHILE S.A. certifica que la Cuenta Individual de Cesantía, perteneciente al afiliado(a)",
  "                 RUT                                     Renta         Monto        Fecha de",
  "  Período                       Razón Social",
  "               Empleador                                Imponible     Cotizado        pago",
  " Junio 2026    76.000.000-0      EMPRESA DEMO SPA        $900.000     $5.400   10/07/2026",
  " Julio 2026    76.000.000-0      EMPRESA DEMO SPA        $900.000     $5.400   10/08/2026",
  " Agosto 2026   76.000.000-0      EMPRESA DEMO SPA        $900.000     $5.400   10/09/2026",
  "                                        TOTAL           $16.200",
].join("\n");

async function usuarioNuevo(): Promise<string> {
  const id = `test-afc-d7-${randomUUID()}`;
  await storage.createUser({
    id,
    username: id,
    email: `${id}@example.com`,
    passwordHash: "testhash",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  return id;
}

describe("D6 → D7 — el certificado de la AFC llega hasta la reconciliación", () => {
  it("la renta imponible queda como señal verificada, y el folio viaja con ella", async () => {
    const userId = await usuarioNuevo();

    const leido = parseAfcCertificado(certificado);
    expect(leido.ok).toBe(true);
    expect(leido.verifiedMonthlyIncomeClp).toBe(900_000);

    await saveGovSourceData(userId, leido);

    // Persistida como fuente, CON el folio: sin él, "renta verificada" no la verifica nadie.
    const afc = (await getGovSources(userId)).find((f) => f.source === "afc");
    expect(afc?.verifiedMonthlyIncomeClp).toBe(900_000);
    expect(afc?.folio).toBe("ABCD-1234-EFGH-5678");
    expect(afc?.validador).toContain("servicios.afc.cl");

    // Y llega a la reconciliación como fuente propia, no confundida con la AFP.
    const reconciliado = await getIncomeReconciliationForUser(userId);
    expect(reconciliado.confidenceBySource.map((c) => c.source)).toContain("afc");
    expect(reconciliado.chosenSource).toBe("afc");
    expect(reconciliado.monthlyClp).toBe(900_000);
  });

  it("un certificado que no cuadra con su propio total no entrega ingreso, pero sí el folio", async () => {
    const userId = await usuarioNuevo();
    const roto = certificado.replace("$16.200", "$99.999");

    const leido = parseAfcCertificado(roto);
    expect(leido.ok).toBe(false);
    await saveGovSourceData(userId, leido);

    // El folio se guarda igual: es lo único que distingue un parser incompleto de un PDF editado.
    const afc = (await getGovSources(userId)).find((f) => f.source === "afc");
    expect(afc?.folio).toBe("ABCD-1234-EFGH-5678");

    // Y la reconciliación no inventa ingreso con un histórico que no cuadra.
    const reconciliado = await getIncomeReconciliationForUser(userId);
    expect(reconciliado.monthlyClp).toBe(0);
    expect(reconciliado.chosenSource).toBeNull();
  });
});
