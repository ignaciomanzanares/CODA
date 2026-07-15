/**
 * Validación cruzada Cartola ↔ Informe CMF (#2.3).
 *
 * Una cartola es un estado de cuenta corriente (no reporta saldos de deuda), así que NO se puede
 * comparar "deuda por banco" directamente. Lo que SÍ es computable y útil:
 *
 *  1. Contradicción de deuda: el CMF dice "sin deuda vigente" pero la cartola muestra servicio de
 *     deuda recurrente (intereses, pago de crédito/tarjeta) → el Informe CMF probablemente está
 *     desactualizado o incompleto.
 *  2. Cobertura: el CMF reporta deuda en instituciones para las que el usuario no subió cartola →
 *     análisis incompleto, conviene subir esas cartolas.
 *
 * Son señales informativas (no bloquean la subida). Se exponen al usuario y se registran.
 */
import type { CMFParseResult } from "../../parsers/cmf-parser.js";
import { storage } from "../../storage.js";
import { logger } from "../../logger.js";

export interface CrossValidationWarning {
  code: "cmf_sin_deuda_pero_cartola_con_servicio" | "cmf_deuda_sin_cartola";
  message: string;
}

/** Detecta servicio de deuda (intereses / pago de crédito o tarjeta) en la glosa de un movimiento. */
const DEBT_SERVICE_RE =
  /inter[eé]s|intereses|cuota|dividendo|pr[eé]stamo|cr[eé]dito|l[ií]nea de cr[eé]dito|pago.*tarjeta|tarjeta de cr[eé]dito/i;

function isDebtServiceTx(descripcion: unknown, categoria: unknown): boolean {
  const d = typeof descripcion === "string" ? descripcion : "";
  const c = typeof categoria === "string" ? categoria : "";
  if (/transferencia interna/i.test(c)) return false; // pago de tarjeta propia ya se excluye como interna
  return DEBT_SERVICE_RE.test(d);
}

/** Normaliza nombre de institución para comparar (mayúsculas, sin tildes ni "banco"). */
function normInstitution(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .replace(/\bBANCO\b/g, "")
    .replace(/[^A-Z0-9]/g, "")
    .trim();
}

/**
 * Cruza el Informe CMF recién subido contra las cartolas previas del usuario.
 * Devuelve warnings informativos (puede ser vacío). Nunca lanza: una falla aquí no debe
 * romper el flujo de upload.
 */
export async function crossValidateCmfVsCartolas(
  userId: string,
  cmf: CMFParseResult,
): Promise<CrossValidationWarning[]> {
  const warnings: CrossValidationWarning[] = [];
  try {
    const cartolas = await storage.listScoreDocumentUploadsByType(userId, "cartola");
    const parsed = cartolas
      .map(
        (r) =>
          r?.parsedData as {
            transacciones?: Array<Record<string, unknown>>;
            banco?: string;
          } | null,
      )
      .filter((c): c is { transacciones?: Array<Record<string, unknown>>; banco?: string } => !!c);

    // (1) Servicio de deuda en cartola vs CMF sin deuda
    let debtServiceCount = 0;
    const cartolaBancos = new Set<string>();
    for (const c of parsed) {
      if (c.banco) cartolaBancos.add(normInstitution(c.banco));
      for (const tx of c.transacciones ?? []) {
        if (isDebtServiceTx(tx.descripcion, tx.categoria)) debtServiceCount++;
      }
    }

    const cmfSinDeuda = !cmf.metricas?.tiene_deuda || cmf.deuda_total <= 0;
    if (cmfSinDeuda && debtServiceCount >= 3) {
      warnings.push({
        code: "cmf_sin_deuda_pero_cartola_con_servicio",
        message:
          "Tu cartola muestra pagos de deuda (intereses, créditos o tarjetas) pero el Informe CMF " +
          "no reporta deuda vigente. El informe podría estar desactualizado: descárgalo nuevamente " +
          "desde la CMF y vuelve a subirlo para un cálculo más preciso.",
      });
    }

    // (2) Cobertura: instituciones con deuda en CMF sin cartola subida
    if (cmf.deuda_total > 0 && cartolaBancos.size > 0) {
      const cmfInstituciones = new Set(
        cmf.deuda_directa.filter((d) => d.total > 0).map((d) => normInstitution(d.institucion)),
      );
      const faltantes = [...cmfInstituciones].filter(
        (inst) =>
          inst.length > 0 &&
          ![...cartolaBancos].some((cb) => cb.includes(inst) || inst.includes(cb)),
      );
      if (faltantes.length > 0) {
        warnings.push({
          code: "cmf_deuda_sin_cartola",
          message:
            `El Informe CMF reporta deuda en ${faltantes.length} institución(es) para las que no has ` +
            "subido cartola. Súbelas para un análisis de salud financiera más completo.",
        });
      }
    }
  } catch (e) {
    logger.warn({ err: e, userId }, "[crossValidator] falló (no fatal)");
  }
  return warnings;
}
