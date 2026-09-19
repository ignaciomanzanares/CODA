/**
 * Una misma fuente puede llegar en VARIOS documentos complementarios —la AFC son dos— y el
 * segundo no puede borrar lo que trajo el primero.
 *
 * El caso que motivó este test es real y alcanzable: el folio se lee de los dos certificados de
 * la AFC, así que subir el de antecedentes sin folio impreso borraba el del certificado de
 * cotizaciones. Perder el folio no es perder un adorno: es perder la única forma de comprobar
 * que el documento es auténtico, justo en la fuente que aporta la renta "verificada".
 */
import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { storage } from "../../../storage.js";
import { saveGovSourceData, getGovSources } from "../govSourceService";

async function usuarioNuevo(): Promise<string> {
  const id = `test-fusion-${randomUUID()}`;
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

const cotizaciones = {
  source: "afc" as const,
  ok: true,
  verifiedMonthlyIncomeClp: 1_200_000,
  contributionMonths: 26,
  raw: { documento: "cotizaciones", folio: "ABCD-1234-EFGH-5678", validador: "https://x/" },
};

/** El segundo certificado: aporta empleadores y NO trae folio legible. */
const antecedentes = {
  source: "afc" as const,
  ok: true,
  raw: {
    documento: "antecedentes",
    empleadores: [{ razonSocial: "EMPRESA DEMO SPA" }],
    folio: null,
  },
};

describe("saveGovSourceData — el segundo documento no borra lo del primero", () => {
  it("un folio nulo no pisa el folio ya guardado", async () => {
    const userId = await usuarioNuevo();
    await saveGovSourceData(userId, cotizaciones);
    await saveGovSourceData(userId, antecedentes);

    const afc = (await getGovSources(userId)).find((f) => f.source === "afc");
    expect(afc?.folio).toBe("ABCD-1234-EFGH-5678");
  });

  it("y la renta verificada del primero sobrevive al segundo", async () => {
    const userId = await usuarioNuevo();
    await saveGovSourceData(userId, cotizaciones);
    await saveGovSourceData(userId, antecedentes);

    const afc = (await getGovSources(userId)).find((f) => f.source === "afc");
    expect(afc?.verifiedMonthlyIncomeClp).toBe(1_200_000);
    expect(afc?.contributionMonths).toBe(26);
  });

  it("un folio nuevo SÍ reemplaza al viejo (un certificado más reciente manda)", async () => {
    const userId = await usuarioNuevo();
    await saveGovSourceData(userId, cotizaciones);
    await saveGovSourceData(userId, {
      ...cotizaciones,
      raw: { ...cotizaciones.raw, folio: "WXYZ-9999-WXYZ-9999" },
    });

    const afc = (await getGovSources(userId)).find((f) => f.source === "afc");
    expect(afc?.folio).toBe("WXYZ-9999-WXYZ-9999");
  });
});
