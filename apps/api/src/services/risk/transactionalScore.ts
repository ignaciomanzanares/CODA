/**
 * Score transaccional CODA (experimental) — lo produce el modelo XGBoost entrenado en Berka,
 * NO un heurístico. Devuelve PD (probabilidad de impago) + un puntaje 0–100 (mapeo log-odds) +
 * razones (top features). Si no hay señal suficiente devuelve `available:false` con motivo — nunca
 * un número inventado (el heurístico `sfaScoringEngine` fue eliminado por no estar respaldado).
 */
import { logger } from "../../logger.js";
import type { UserRiskProfile } from "./userRiskProfile.js";

/** Meses mínimos de transacciones para que el modelo tenga señal. */
const MIN_TRANSACTION_MONTHS = 3;

/**
 * PD máxima que consideramos CONFIABLE para mostrar un score.
 *
 * El modelo es un XGB entrenado en Berka (banca checa) con calibración Platt MUY
 * empinada (a≈11.4) y caveat explícito del manifest: "patrones checos, no chilenos
 * → recalibrar con datos CL; alta varianza (75 defaults)". Con esa calibración, PDs
 * en la cola alta (≈0.85+ → score ≤ ~21, un "Bajo" extremo tipo 3/100) casi siempre
 * son EXTRAPOLACIÓN sobre features fuera de distribución —cuentas con transferencias
 * o eventos grandes puntuales que en Chile son comunes y en Berka no— y no una señal
 * real de riesgo. Preferimos NO mostrar el score (misma política que la señal
 * insuficiente por meses: "nunca un número inventado") a alarmar con un ~97% de PD
 * que contradice el resto del perfil.
 *
 * Guarda ASIMÉTRICA a propósito: solo la cola ALTA. Un falso "Excelente" (cola baja)
 * es de bajo daño y no lo ocultamos; un falso "Bajo/casi-default" es el error grave.
 */
export const PD_TRUSTED_MAX = 0.85;

/** True si la PD calibrada cae en el rango confiable para mostrar un score. */
export function isTrustedTransactionalPd(pd: number): boolean {
  return Number.isFinite(pd) && pd < PD_TRUSTED_MAX;
}

/**
 * Mapeo PD → puntaje 0–100 (log-odds): score = OFFSET − FACTOR·logit, acotado.
 * Anclas: PD 1% → ~90, PD 8% → ~67, PD 50% → 40. Bandas alineadas con la UI (ScoreHero).
 */
const SCORE100 = { offset: 40, factor: 11, min: 0, max: 100 } as const;

export type TransactionalBand = "Excelente" | "Bueno" | "Regular" | "Bajo";

export interface TransactionalScoreResult {
  available: boolean;
  /** Motivo cuando available=false. */
  reason?: string;
  modelId?: string;
  pd?: number;
  score?: number;
  band?: TransactionalBand;
  reasons?: string[];
  isBeta: true;
}

function bandFor(score: number): TransactionalBand {
  if (score >= 70) return "Excelente";
  if (score >= 55) return "Bueno";
  if (score >= 35) return "Regular";
  return "Bajo";
}

function pdToScore100(pd: number): number {
  const clamped = Math.min(0.999, Math.max(0.001, pd));
  const logit = Math.log(clamped / (1 - clamped));
  const raw = SCORE100.offset - SCORE100.factor * logit;
  return Math.round(Math.max(SCORE100.min, Math.min(SCORE100.max, raw)));
}

export async function computeTransactionalScore(
  profile: UserRiskProfile,
): Promise<TransactionalScoreResult> {
  if (profile.meta.transactionMonths < MIN_TRANSACTION_MONTHS) {
    return {
      available: false,
      isBeta: true,
      reason: `Aún no hay suficientes datos (${profile.meta.transactionMonths} de ${MIN_TRANSACTION_MONTHS} meses mínimos). Sube más cartolas.`,
    };
  }

  try {
    const { PDModelRegistry } = await import("../modelRegistry.js");
    const reg = PDModelRegistry.instance();
    if (!reg.isReady) {
      await new Promise((r) => setTimeout(r, 150)); // ventana de warm-up (lazy load)
    }
    if (!reg.isReady) {
      return {
        available: false,
        isBeta: true,
        reason: "El modelo transaccional no está disponible en este momento.",
      };
    }

    const fv = profile.transactional as any;
    const pd: number = await reg.scoreXGB(fv);

    // Guarda de confiabilidad: PD en la cola alta no creíble → no mostramos score.
    // (Ver PD_TRUSTED_MAX: calibración Platt empinada + modelo Berka fuera de
    // distribución para flujos atípicos chilenos. Ej.: transferencias/eventos
    // grandes puntuales que disparan la PD a ~1 sin ser riesgo real.)
    if (!isTrustedTransactionalPd(pd)) {
      logger.info(
        { userId: profile.userId, pd },
        "[transactionalScore] PD en cola no confiable → score oculto (beta)",
      );
      return {
        available: false,
        isBeta: true,
        reason:
          "El score transaccional está en beta. Con tus datos actuales el modelo cae en un rango extremo poco confiable —normalmente por movimientos atípicos, como transferencias o pagos grandes puntuales—, así que preferimos no mostrar un número que no sería fiable. Súbelo con más meses de cartola.",
      };
    }

    const score = pdToScore100(pd);
    const instanceReasons = reg.explainInstance(fv, 5) as Array<{ feature: string }>;
    const manifest = reg.getManifest?.() as { model_id?: string } | undefined;

    return {
      available: true,
      isBeta: true,
      modelId: manifest?.model_id,
      pd,
      score,
      band: bandFor(score),
      reasons: instanceReasons.map((r) => r.feature),
    };
  } catch (e) {
    logger.warn(
      { err: e, userId: profile.userId },
      "[transactionalScore] scoreXGB failed (non-fatal)",
    );
    return {
      available: false,
      isBeta: true,
      reason: "No se pudo calcular el score transaccional.",
    };
  }
}
