/**
 * Ensambla el perfil canónico (D1) desde las fuentes REALES del usuario y lo normaliza al contrato
 * con procedencia. Reutiliza lo ya construido: D7 (renta reconciliada), fuentes gov (empleo/fiscal),
 * parse CMF (deuda). NO cambia scoring; es la capa de lectura unificada.
 */

import { buildCanonicalProfile } from "./buildCanonicalProfile.js";
import type { CanonicalProfile, CanonicalInputs, DataSourceId } from "./types.js";
import { getIncomeReconciliationForUser } from "../risk/incomeReconciliationService.js";
import { getGovSources, getGovSourceAdjustments } from "../dataSources/govSourceService.js";
import { normalizeCmfData } from "../risk/cmfDerivation.js";
import { storage } from "../../storage.js";

/** Deriva mora activa de un CMF normalizado, tolerando distintas formas del parser. */
function deriveMoraActiva(cmf: unknown): boolean | null {
  const m = (cmf as { mora?: Record<string, unknown> })?.mora;
  if (!m) return null;
  const anyDays = ["mora30", "mora60", "mora90", "dias_mora"].some(
    (k) => typeof m[k] === "number" && (m[k] as number) > 0,
  );
  return Boolean(m.tiene_mora) || anyDays;
}

export async function assembleCanonicalProfile(userId: string): Promise<CanonicalProfile> {
  const inputs: CanonicalInputs = {};

  // Identidad: el RUT crudo NO se almacena (solo su hash) → usamos el nombre declarado.
  const user = await storage.getUser(userId).catch(() => null);
  if (user?.displayName) inputs.nombre = user.displayName;

  // Renta: reconciliación D7 (fuente elegida + su confianza).
  const income = await getIncomeReconciliationForUser(userId).catch(() => null);
  if (income && income.chosenSource && income.monthlyClp > 0) {
    inputs.income = {
      monthlyClp: income.monthlyClp,
      source: income.chosenSource as DataSourceId,
      confidence: income.confidenceBySource[0]?.confidence ?? 0.5,
      asOf: null,
    };
  }

  // Deuda: CMF (deuda_total, mora) + fiscal (TGR).
  const adj = await getGovSourceAdjustments(userId).catch(() => ({
    fiscalDebtClp: 0,
    verifiedMonthlyIncomeClp: null,
  }));
  const cmfDocs = await storage.listDocumentUploadsByType(userId, "cmf").catch(() => []);
  let cmfDebt = 0;
  if (cmfDocs.length > 0) {
    const newest = [...cmfDocs].sort((a, b) =>
      String(b.uploadedAt ?? "").localeCompare(String(a.uploadedAt ?? "")),
    )[0];
    const cmf = normalizeCmfData(newest.parsedData);
    cmfDebt = typeof cmf?.deuda_total === "number" ? cmf.deuda_total : 0;
    inputs.debtAsOf = (newest.uploadedAt as string) ?? null;
    const mora = deriveMoraActiva(cmf);
    if (mora != null) inputs.moraActiva = mora;
  }
  const totalDebt = cmfDebt + (adj.fiscalDebtClp ?? 0);
  if (cmfDocs.length > 0 || (adj.fiscalDebtClp ?? 0) > 0) inputs.debtTotalClp = totalDebt;

  // Empleo: meses cotizados (AFP) + frescura.
  const govs = await getGovSources(userId).catch(() => []);
  const afp = govs.find((g) => g.source === "afp");
  if (afp && typeof afp.contributionMonths === "number") {
    inputs.cotizacionMeses = afp.contributionMonths;
    inputs.employmentAsOf = afp.extractedAt;
  }

  return buildCanonicalProfile(userId, inputs);
}
