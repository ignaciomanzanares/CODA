/**
 * Persistencia y agregación de las fuentes de datos gov (Fase 5). Guarda un dato por usuario+fuente
 * (upsert) y expone los ajustes que alimentan los ratios de salud financiera.
 */
import { randomUUID } from "crypto";
import { db, userFinancialSources, eq, and } from "../../db/index.js";
import type { GovParseResult } from "./types.js";

export async function saveGovSourceData(userId: string, r: GovParseResult): Promise<void> {
  const now = new Date().toISOString();

  // Fusión, no reemplazo: una misma fuente puede llegar en VARIOS documentos complementarios.
  // La AFC son dos (cotizaciones trae la renta; antecedentes trae empleadores y contratos), y
  // con reemplazo el segundo borraba lo del primero. Un campo nulo no pisa un valor ya guardado,
  // y `rawData` se mezcla por clave.
  const [previo] = await db
    .select()
    .from(userFinancialSources)
    .where(and(eq(userFinancialSources.userId, userId), eq(userFinancialSources.source, r.source)));

  const mantener = <T>(nuevo: T | null | undefined, anterior: T | null | undefined) =>
    nuevo ?? anterior ?? null;
  const rawPrevio = (() => {
    try {
      return previo?.rawData
        ? (JSON.parse(previo.rawData as string) as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  })();
  const rawFusionado = { ...rawPrevio, ...(r.raw ?? {}) };
  const verified = mantener(r.verifiedMonthlyIncomeClp, previo?.verifiedMonthlyIncomeClp);
  const fiscal = mantener(r.fiscalDebtClp, previo?.fiscalDebtClp);
  const meses = mantener(r.contributionMonths, previo?.contributionMonths);
  await db
    .insert(userFinancialSources)
    .values({
      id: randomUUID(),
      userId,
      source: r.source,
      verifiedMonthlyIncomeClp: verified,
      fiscalDebtClp: fiscal,
      contributionMonths: meses,
      rawData: JSON.stringify(rawFusionado),
      extractedAt: now,
    })
    .onConflictDoUpdate({
      target: [userFinancialSources.userId, userFinancialSources.source],
      set: {
        verifiedMonthlyIncomeClp: verified,
        fiscalDebtClp: fiscal,
        contributionMonths: meses,
        rawData: JSON.stringify(rawFusionado),
        extractedAt: now,
      },
    });
}

export interface GovSourceStatus {
  source: string;
  verifiedMonthlyIncomeClp: number | null;
  fiscalDebtClp: number | null;
  contributionMonths: number | null;
  extractedAt: string;
}

/** Fuentes conectadas por el usuario (para la UI de "Conecta tus datos"). */
export async function getGovSources(userId: string): Promise<GovSourceStatus[]> {
  const rows = await db
    .select()
    .from(userFinancialSources)
    .where(eq(userFinancialSources.userId, userId));
  return rows.map((r: any) => ({
    source: r.source,
    verifiedMonthlyIncomeClp: r.verifiedMonthlyIncomeClp ?? null,
    fiscalDebtClp: r.fiscalDebtClp ?? null,
    contributionMonths: r.contributionMonths ?? null,
    extractedAt: r.extractedAt,
  }));
}

/**
 * Ajustes agregados de las fuentes gov para enriquecer los ratios de salud:
 *  - `fiscalDebtClp`: deuda fiscal (TGR) a sumar a la deuda total.
 *  - `verifiedMonthlyIncomeClp`: ingreso verificado (SII preferido sobre AFP) para validar el
 *    ingreso inferido de cartolas. `null` si ninguna fuente lo aporta.
 */
export async function getGovSourceAdjustments(userId: string): Promise<{
  fiscalDebtClp: number;
  verifiedMonthlyIncomeClp: number | null;
}> {
  const rows = await getGovSources(userId);
  let fiscalDebtClp = 0;
  let siiIncome: number | null = null;
  let afpIncome: number | null = null;
  for (const r of rows) {
    if (typeof r.fiscalDebtClp === "number") fiscalDebtClp += r.fiscalDebtClp;
    if (r.source === "sii" && typeof r.verifiedMonthlyIncomeClp === "number")
      siiIncome = r.verifiedMonthlyIncomeClp;
    if (r.source === "afp" && typeof r.verifiedMonthlyIncomeClp === "number")
      afpIncome = r.verifiedMonthlyIncomeClp;
  }
  return { fiscalDebtClp, verifiedMonthlyIncomeClp: siiIncome ?? afpIncome };
}
