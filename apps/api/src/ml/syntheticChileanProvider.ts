import type {
  OBAccount,
  OBBalance,
  OBProvider,
  OBTransaction,
} from "../connectors/openbanking/mockProvider.js";

/**
 * Generador de datos Open Banking sintéticos para entrenamiento del modelo de scoring,
 * calibrado contra estadísticas públicas agregadas de Chile (no hay datos de usuarios
 * reales involucrados — son anclas para que la *distribución* de la población sintética
 * sea plausible, no un mapeo 1:1 a microdatos):
 *
 *  - Ingreso efectivo promedio de los hogares: CLP 1.869.654/mes (Banco Central de Chile,
 *    Encuesta Financiera de Hogares 2024).
 *  - 51% de los hogares tiene algún tipo de deuda; el hogar representativo con deuda
 *    destina ~26% de su ingreso mensual al pago de obligaciones financieras ("carga
 *    financiera/ingreso") (BCCh, EFH 2024).
 *  - Tasa base de incumplimiento: se usa ~4.5% como aproximación. El único dato público
 *    encontrado es el índice de morosidad de cartera total del sistema bancario (90+
 *    días) de la CMF, ~2.3-2.4% en oct-nov 2025 — pero ese número mezcla cartera
 *    comercial, vivienda y consumo, y la cartera de consumo específicamente suele tener
 *    morosidad más alta. 4.5% es un punto intermedio razonable, no un dato medido para
 *    Chile/consumo/CODA — ajustar si se consigue el desagregado exacto de la CMF.
 *
 * Por qué este módulo existe: la versión anterior (`MockProvider` + `Math.random() < pd`
 * en make_synth_training.ts) generaba transacciones casi idénticas para los 200 usuarios
 * sintéticos (mismo saldo, mismo gasto en todos) y luego sorteaba la etiqueta con esa
 * pseudo-probabilidad — no había heterogeneidad real entre usuarios, así que no había
 * señal real para que el modelo aprendiera (de ahí el AUC 0.4172, peor que azar, en
 * artifacts/current/manifest.json). Este módulo introduce heterogeneidad real entre
 * usuarios (ingreso, carga financiera, regularidad de ingreso) y deriva la probabilidad
 * de default de esas variables latentes — make_synth_training.ts usa esa probabilidad
 * (no `pdScoring.ts`, que es el scorer heurístico de producción, no el proceso generador)
 * para la etiqueta.
 */

export type ChileanProfile = {
  monthlyIncome: number; // CLP
  debtBurdenRatio: number; // 0..~0.9, carga financiera / ingreso
  incomeVolatility: number; // 0..1, 0 = ingreso regular, 1 = muy irregular
};

const MEAN_MONTHLY_INCOME_CLP = 1_869_654; // BCCh, EFH 2024
const HAS_DEBT_PROB = 0.51; // BCCh, EFH 2024
const DEBT_BURDEN_MEAN = 0.26; // BCCh, EFH 2024 (hogar representativo con deuda)
const DEBT_BURDEN_SD = 0.12;
const TARGET_BASE_DEFAULT_RATE = 0.045; // aproximación, ver docstring del módulo

function hashSeed(s: string): number {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return (h ^ (h >>> 16)) >>> 0;
}

/** PRNG determinístico (mulberry32) — mismo seed produce siempre la misma secuencia. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randNormal(rng: () => number): number {
  const u1 = Math.max(rng(), 1e-9);
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

export function sampleProfile(userId: string): ChileanProfile {
  const rng = mulberry32(hashSeed(`profile:${userId}`));

  // Ingreso: lognormal con media calibrada a la EFH 2024.
  const sigma = 0.6;
  const mu = Math.log(MEAN_MONTHLY_INCOME_CLP) - (sigma * sigma) / 2;
  const monthlyIncome = Math.exp(mu + sigma * randNormal(rng));

  // Carga financiera: 0 si no tiene deuda (49% de los hogares), si no, normal truncada
  // centrada en 0.26 (BCCh EFH 2024).
  const debtBurdenRatio =
    rng() < HAS_DEBT_PROB ? clamp(DEBT_BURDEN_MEAN + randNormal(rng) * DEBT_BURDEN_SD, 0, 0.9) : 0;

  // Volatilidad de ingreso: sesgada hacia regular (la mayoría de los asalariados formales
  // tiene ingreso estable); rng()^2 concentra la masa cerca de 0 sin descartar la cola alta.
  const incomeVolatility = clamp(Math.pow(rng(), 2), 0, 1);

  return { monthlyIncome, debtBurdenRatio, incomeVolatility };
}

function riskZ(p: ChileanProfile): number {
  const incomeRatio = p.monthlyIncome / MEAN_MONTHLY_INCOME_CLP;
  return 3.2 * p.debtBurdenRatio + 1.4 * p.incomeVolatility - 0.4 * Math.log(incomeRatio);
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/**
 * Calibra el intercepto del modelo logístico de riesgo "verdadero" para que la
 * probabilidad media de default en la población simulada sea TARGET_BASE_DEFAULT_RATE.
 * Determinístico: usa una muestra de calibración fija (seeds "calib-0".."calib-N").
 */
function calibrateIntercept(sampleSize = 4000): number {
  const zs: number[] = [];
  for (let i = 0; i < sampleSize; i++) {
    zs.push(riskZ(sampleProfile(`calib-${i}`)));
  }
  let lo = -15;
  let hi = 15;
  for (let iter = 0; iter < 60; iter++) {
    const mid = (lo + hi) / 2;
    const meanP = zs.reduce((s, z) => s + sigmoid(mid + z), 0) / zs.length;
    if (meanP > TARGET_BASE_DEFAULT_RATE) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

let cachedIntercept: number | null = null;

export function trueDefaultProbability(profile: ChileanProfile): number {
  if (cachedIntercept == null) cachedIntercept = calibrateIntercept();
  return sigmoid(cachedIntercept + riskZ(profile));
}

/**
 * Etiqueta sintética determinística: Bernoulli(trueDefaultProbability) con su propio
 * stream de PRNG por usuario (separado del de `sampleProfile`/transacciones) para que
 * cambios en la generación de transacciones no alteren accidentalmente qué usuarios
 * "default-ean" en re-ejecuciones.
 */
export function sampleLabel(userId: string, profile: ChileanProfile): 0 | 1 {
  const rng = mulberry32(hashSeed(`label:${userId}`));
  return rng() < trueDefaultProbability(profile) ? 1 : 0;
}

const CHILEAN_MERCHANTS = [
  "Supermercado Líder",
  "Copec",
  "Movistar",
  "Enel",
  "Farmacias Cruz Verde",
  "Sodimac",
  "Jumbo",
  "Metro de Santiago",
];

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

/**
 * OBProvider para generación de datos sintéticos de entrenamiento. A diferencia de
 * `MockProvider` (usado por la demo en vivo vía POST /api/open-banking/sync, con datos
 * fijos), cada instancia genera transacciones consistentes con un `ChileanProfile`
 * distinto por usuario — eso es lo que le da heterogeneidad real a la población de
 * entrenamiento. Una instancia nueva por usuario (ver make_synth_training.ts).
 */
export class SyntheticChileanProvider implements OBProvider {
  private profile: ChileanProfile | null = null;
  private rng: () => number = Math.random;
  private userId = "";

  async listAccounts(userId: string): Promise<OBAccount[]> {
    this.userId = userId;
    this.profile = sampleProfile(userId);
    this.rng = mulberry32(hashSeed(`tx:${userId}`));
    return [
      {
        providerAccountId: `chl-checking-${userId}`,
        name: "Cuenta Corriente",
        officialName: "Cuenta Corriente",
        type: "checking",
        currency: "CLP",
        mask: "0000",
        openedAt: daysAgo(400),
      },
    ];
  }

  async getBalance(_providerAccountId: string): Promise<OBBalance> {
    const p = this.profile!;
    const current = p.monthlyIncome * (0.2 + this.rng() * 0.6);
    return { current, available: current, currency: "CLP", asOf: new Date() };
  }

  async listTransactions(
    _providerAccountId: string,
    from: Date,
    to: Date,
  ): Promise<OBTransaction[]> {
    const p = this.profile!;
    const items: OBTransaction[] = [];
    const windowDays = Math.max(1, Math.ceil((to.getTime() - from.getTime()) / 86400000));
    const months = Math.max(1, Math.round(windowDays / 30));

    // Remuneración: ~mensual, con ruido proporcional a la volatilidad del perfil.
    for (let m = 0; m < months; m++) {
      const day = new Date(
        from.getTime() + m * 30 * 86400000 + (1 + Math.floor(this.rng() * 3)) * 86400000,
      );
      if (day > to) continue;
      const noise = 1 + (this.rng() * 2 - 1) * p.incomeVolatility * 0.5;
      items.push({
        externalId: `${this.userId}-sal-${m}`,
        postedAt: day,
        description: "Pago Remuneración",
        merchantName: "Empleador",
        amount: Math.max(0, p.monthlyIncome * noise),
        currency: "CLP",
        category: "Income",
      });
    }

    // Servicio de deuda: cuota mensual = debtBurdenRatio * ingreso (0 si no tiene deuda).
    if (p.debtBurdenRatio > 0) {
      for (let m = 0; m < months; m++) {
        const day = new Date(from.getTime() + m * 30 * 86400000 + 5 * 86400000);
        if (day > to) continue;
        items.push({
          externalId: `${this.userId}-debt-${m}`,
          postedAt: day,
          description: "Pago Cuota Crédito",
          merchantName: "Banco - Cuota",
          amount: -p.debtBurdenRatio * p.monthlyIncome,
          currency: "CLP",
          category: "Debt",
        });
      }
    }

    // Gastos recurrentes de subsistencia, independientes de la deuda.
    const baselineSpend = p.monthlyIncome * 0.35;
    for (let d = 0; d < windowDays; d += 3 + Math.floor(this.rng() * 4)) {
      const merchant = CHILEAN_MERCHANTS[Math.floor(this.rng() * CHILEAN_MERCHANTS.length)];
      const amt = -(baselineSpend / 10) * (0.4 + this.rng() * 1.2);
      items.push({
        externalId: `${this.userId}-exp-${d}`,
        postedAt: new Date(from.getTime() + d * 86400000),
        description: merchant,
        merchantName: merchant,
        amount: amt,
        currency: "CLP",
        category: "Gastos",
      });
    }

    return items;
  }
}
