/**
 * D5 — El cruce de rentas, de punta a punta: una carpeta tributaria subida por el usuario tiene
 * que terminar como una señal de ingreso VERIFICADA dentro de la reconciliación (D7), que es
 * quien la contrasta con lo observado en la cartola.
 *
 * Las piezas estaban todas probadas por separado (lector, persistencia, motor de reconciliación),
 * pero nada verificaba que la cadena completa se sostuviera. Este test recorre el camino real:
 *   carpeta → parseSii → saveGovSourceData → getIncomeReconciliationForUser
 *
 * Cubre además el caso que abrió este trabajo: quien no declara renta y sólo emite boletas.
 */
import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { storage } from "../../../storage.js";
import { parseSii } from "../govParsers";
import { saveGovSourceData, getGovSources } from "../govSourceService";
import { getIncomeReconciliationForUser } from "../../risk/incomeReconciliationService";

/** Layout real de la carpeta tributaria, con datos sintéticos. */
const carpetaConBoletas = [
  "Boletas de Honorarios electrónicas emitidas (6): Últimos 12 meses",
  "   Períodos          Honorario bruto ($)      Retención de terceros ($)",
  "   Junio 2026            450.000                  68.633",
  "   Julio 2026            500.000                  76.259",
  "   Agosto 2026           550.000                  83.885",
  "Boleta de prestación de servicios de terceros electrónicas recibidas (6): Últimos 12 meses",
  "No registra información",
  "Declaraciones de Renta - Formulario 22 (F22)",
  "Año Tributario 2026",
  "- No existen declaraciones de Renta recibidas para este periodo -",
].join("\n");

async function usuarioNuevo(): Promise<string> {
  const id = `test-cruce-${randomUUID()}`;
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

describe("D5 — la carpeta tributaria llega hasta la reconciliación de ingresos", () => {
  it("una carpeta sin F22 pero con boletas queda como señal SII verificada", async () => {
    const userId = await usuarioNuevo();

    const leido = parseSii(carpetaConBoletas);
    expect(leido.ok).toBe(true);
    expect(leido.verifiedMonthlyIncomeClp).toBe(125_000); // 1.500.000 / 12

    await saveGovSourceData(userId, leido);

    // Persistida como fuente, con su fecha de extracción (la frescura importa en D7).
    const fuentes = await getGovSources(userId);
    const sii = fuentes.find((f) => f.source === "sii");
    expect(sii?.verifiedMonthlyIncomeClp).toBe(125_000);
    expect(sii?.extractedAt).toBeTruthy();

    // Y llega a la reconciliación como señal con confianza propia.
    const reconciliado = await getIncomeReconciliationForUser(userId);
    expect(reconciliado.confidenceBySource.map((c) => c.source)).toContain("sii");
    expect(reconciliado.chosenSource).toBe("sii");
    expect(reconciliado.monthlyClp).toBe(125_000);
  });

  it("sin documentos, la reconciliación no inventa ingreso", async () => {
    const userId = await usuarioNuevo();
    const reconciliado = await getIncomeReconciliationForUser(userId);
    expect(reconciliado.monthlyClp).toBe(0);
    expect(reconciliado.chosenSource).toBeNull();
  });
});
