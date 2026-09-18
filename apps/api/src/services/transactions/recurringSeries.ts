/**
 * B6 — Series mensuales recurrentes: suscripciones y cobros fijos (egresos) e ingresos
 * recurrentes (sueldo, honorarios, arriendo recibido). Insumo del PFM y de Billshark.
 *
 * Núcleo PURO compartido con el recordatorio de cobros (`notifications/recurringDetector.ts`),
 * que lo usa con sus criterios originales — su comportamiento no cambia (lo fijan sus tests).
 *
 * Dos patrones chilenos que obligan a criterios distintos para ingresos:
 *  - SUELDO CON ANTICIPO: el mismo empleador deposita dos veces al mes (quincena + fin de mes).
 *    Descartar por "muchos movimientos por mes" lo perdería → para ingresos se SUMA el mes.
 *  - SUELDO DE FIN DE MES: cae el 30, el 31 o el 1º (último día hábil). Por mes calendario queda
 *    un mes con dos depósitos y otro con cero → el día se mide en forma CIRCULAR (el 30 y el 2
 *    están a 3 días, no a 28) y, si el día típico está en el borde del mes, los movimientos se
 *    agrupan desplazados medio mes.
 */
import { normalizeMerchant } from "../../parsers/merchantCategorizer.js";
import { isInternalTransferTx } from "../assistantContext.js";

export interface SeriesInputTx {
  id?: string;
  description: string;
  postedAt: string; // YYYY-MM-DD
  amount: number; // firmado: cargo negativo, abono positivo
  isInternalTransfer?: boolean | number;
  is_internal_transfer?: boolean | number;
  isExtraordinary?: boolean | number | null;
}

export interface MonthlySeriesCriteria {
  direction: "egreso" | "ingreso";
  /** Clave de agrupación a partir de la glosa. */
  keyOf: (description: string) => string;
  /** Mínimo de meses (ciclos) distintos con movimiento. */
  minOccurrences: number;
  /** Distancia máxima, en días, de cada movimiento al día típico. */
  maxDaySpread: number;
  /** Medir el día en forma circular (fin de mes ↔ inicio). */
  circularDays: boolean;
  /** Coeficiente de variación máximo del monto mensual. */
  maxAmountCv: number;
  /** Si hay más de ratio×meses movimientos, es consumo variable, no una serie. */
  maxPerMonthRatio: number;
  /** Monto del mes: el movimiento más reciente ("latest") o la suma del mes ("sum"). */
  monthlyAmount: "latest" | "sum";
  /** Qué movimientos no cuentan. Default: transferencias internas y extraordinarios confirmados. */
  exclude?: (t: SeriesInputTx) => boolean;
}

export interface MonthlySeries {
  key: string;
  direction: "egreso" | "ingreso";
  /** Un movimiento representativo por ciclo (el más reciente), en orden cronológico. */
  monthly: SeriesInputTx[];
  /** Todos los movimientos de la serie. */
  all: SeriesInputTx[];
  typicalDay: number;
  typicalAmountClp: number;
  amountCv: number;
  last: SeriesInputTx;
}

const CYCLE = 31;

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

function circularDistance(a: number, b: number): number {
  const d = Math.abs(a - b);
  return Math.min(d, CYCLE - d);
}

/** Día (1..31) que minimiza la suma de distancias circulares — la "mediana" en un ciclo. */
function circularTypicalDay(days: number[]): number {
  let best = 1;
  let bestCost = Infinity;
  for (let c = 1; c <= CYCLE; c++) {
    const cost = days.reduce((s, d) => s + circularDistance(d, c), 0);
    if (cost < bestCost) {
      best = c;
      bestCost = cost;
    }
  }
  return best;
}

const dayOf = (t: SeriesInputTx) => Number(t.postedAt.slice(8, 10)) || 1;

/** "YYYY-MM" del ciclo, desplazando `shiftDays` para que un pago de borde de mes no se parta. */
function cycleOf(t: SeriesInputTx, shiftDays: number): string {
  if (shiftDays === 0) return t.postedAt.slice(0, 7);
  const d = new Date(`${t.postedAt}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + shiftDays);
  return d.toISOString().slice(0, 7);
}

const isOut = (t: SeriesInputTx) =>
  isInternalTransferTx(t) || t.isExtraordinary === true || t.isExtraordinary === 1;

/** Agrupa movimientos en series mensuales que cumplen los criterios. Pura: no usa "hoy". */
export function findMonthlySeries(txs: SeriesInputTx[], c: MonthlySeriesCriteria): MonthlySeries[] {
  const exclude = c.exclude ?? isOut;
  const relevant = txs.filter(
    (t) => t.description && !exclude(t) && (c.direction === "egreso" ? t.amount < 0 : t.amount > 0),
  );

  const groups = new Map<string, SeriesInputTx[]>();
  for (const t of relevant) {
    const key = c.keyOf(t.description);
    if (!key) continue;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(t);
  }

  const out: MonthlySeries[] = [];
  for (const [key, list] of groups) {
    // Borde de mes: si el día típico cae en los extremos, agrupar desplazado medio mes.
    const rawDays = list.map(dayOf);
    const roughDay = c.circularDays ? circularTypicalDay(rawDays) : 15;
    const shift = c.circularDays && (roughDay >= 25 || roughDay <= 5) ? 15 : 0;

    const byCycle = new Map<string, SeriesInputTx[]>();
    for (const t of list) {
      const k = cycleOf(t, shift);
      (byCycle.get(k) ?? byCycle.set(k, []).get(k)!).push(t);
    }
    if (list.length > byCycle.size * c.maxPerMonthRatio) continue;
    if (byCycle.size < c.minOccurrences) continue;

    const cycles = [...byCycle.keys()].sort();
    // Representante del ciclo: el más reciente; ante empate de fecha, el primero (mismo criterio
    // que tenía el detector de recordatorios, para no cambiar su comportamiento).
    const monthly = cycles.map((k) =>
      byCycle.get(k)!.reduce((best, t) => (t.postedAt > best.postedAt ? t : best)),
    );

    const days = monthly.map(dayOf);
    const typicalDay = c.circularDays ? circularTypicalDay(days) : Math.round(median(days));
    const spread = (d: number) =>
      c.circularDays ? circularDistance(d, typicalDay) : Math.abs(d - typicalDay);
    if (!days.every((d) => spread(d) <= c.maxDaySpread)) continue;

    const amounts = cycles.map((k) =>
      c.monthlyAmount === "sum"
        ? byCycle.get(k)!.reduce((s, t) => s + Math.abs(t.amount), 0)
        : Math.abs(monthly[cycles.indexOf(k)]!.amount),
    );
    const typicalAmount = Math.round(median(amounts));
    const mean = amounts.reduce((s, n) => s + n, 0) / amounts.length;
    const variance = amounts.reduce((s, n) => s + (n - mean) ** 2, 0) / amounts.length;
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 1;
    if (cv > c.maxAmountCv) continue;

    out.push({
      key,
      direction: c.direction,
      monthly,
      all: list,
      typicalDay,
      typicalAmountClp: typicalAmount,
      amountCv: cv,
      last: monthly.at(-1)!,
    });
  }
  return out;
}

// ─── Contraparte legible ───────────────────────────────────────────────────────

const RUT_DOTTED_RE = /\b\d{1,2}\.\d{3}\.\d{3}-[\dkK]\b/g;
const RUT_PLAIN_RE = /\b0?\d{7,8}[kK]\b|\b0\d{8,9}\b/g;
const TRANSFER_PREFIX_RE =
  /^(?:O\.?\s*GERENCIA\s+)?(?:TRANSF(?:ERENCIA)?\.?|TEF)\s*(?:(?:A|DE|PARA)\s+)?/i;

/**
 * Contraparte de una glosa: sin RUT, sin cuenta y sin "Transf. a/de". Las transferencias son
 * donde viven el sueldo, los honorarios y el arriendo, y su glosa trae el RUT unas veces sí y
 * otras no — sin limpiar, el mismo pagador quedaba como dos series.
 *   "76.543.210-3 Transf. SERVI TELE" → "SERVI TELE"
 */
export function counterpartyLabel(description: string): string {
  const cleaned = description
    .replace(RUT_DOTTED_RE, " ")
    .replace(RUT_PLAIN_RE, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(TRANSFER_PREFIX_RE, "")
    .trim();
  return cleaned || description.trim();
}

/** Clave de agrupación de la contraparte (normalizada como el categorizador). */
export function counterpartyKey(description: string): string {
  return normalizeMerchant(counterpartyLabel(description));
}

// ─── Comercios que cambian de glosa ───────────────────────────────────────────

/**
 * Palabras que NO identifican a un comercio: aparecen en glosas de cualquiera. Un token de
 * estos nunca puede ser la razón para fusionar dos series.
 */
const TOKENS_GENERICOS = new Set([
  "TRANSF",
  "TRANSFERENCIA",
  "PAGO",
  "PAGOS",
  "COMPRA",
  "SUBSCRIPTION",
  "SUBSCR",
  "MEMBER",
  "PREMIUM",
  "SERVICIO",
  "SERVICIOS",
  "LIMITADA",
  "SPA",
  "CHILE",
  "SANTIAGO",
  "BANCO",
  "ESTADO",
  "SEGURO",
  "SEGUROS",
  "CUENTA",
  "TARJETA",
  "CREDITO",
  "DEBITO",
  "MENSUAL",
  "ONLINE",
  "INTERNET",
]);

/** Diferencia máxima entre montos típicos para aceptar que dos glosas son el mismo cobro. */
const MAX_DIF_MONTO = 0.15;

const tokensDistintivos = (key: string) =>
  key
    .split(/[^A-ZÁÉÍÓÚÑ]+/i)
    .map((t) => t.toUpperCase())
    .filter((t) => t.length >= 5 && !TOKENS_GENERICOS.has(t));

/**
 * Un mismo servicio cambia de glosa con el tiempo y queda partido en varias series:
 * "PLAYSTATION" y "PlayStation Network", o "ANTHROPIC ANTHROPIC." y
 * "CLAUDE.AI SUBSCRIPTION ANTHROPIC.". Partido, cada trozo puede no llegar al mínimo de meses
 * y la suscripción **desaparece**: en datos reales, 8 meses de PlayStation se mostraban como 3,
 * y Anthropic no aparecía en absoluto.
 *
 * Por eso la unión ocurre ANTES de aplicar los criterios, no después.
 *
 * Se fusiona sólo con dos condiciones juntas, porque un falso positivo mezcla cobros de
 * comercios distintos:
 *  - comparten un token DISTINTIVO (≥5 letras, no genérico) que además es RARO entre las glosas
 *    de esta persona — si aparece en muchas, no identifica a nadie;
 *  - sus montos típicos difieren ≤15%.
 *
 * Devuelve el mapa clave → clave canónica (la de la glosa más frecuente).
 */
export function unificarGlosasDelMismoComercio(
  porClave: Map<string, { montos: number[]; veces: number }>,
): Map<string, string> {
  const claves = [...porClave.keys()];
  const padre = new Map(claves.map((k) => [k, k]));
  const raiz = (k: string): string => (padre.get(k) === k ? k : raiz(padre.get(k)!));
  const unir = (a: string, b: string) => padre.set(raiz(a), raiz(b));

  const mediana = (v: number[]) => {
    const s = [...v].sort((x, y) => x - y);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
  };
  const tipico = new Map(claves.map((k) => [k, mediana(porClave.get(k)!.montos)]));

  const porToken = new Map<string, string[]>();
  for (const k of claves) {
    for (const t of new Set(tokensDistintivos(k))) {
      (porToken.get(t) ?? porToken.set(t, []).get(t)!).push(k);
    }
  }

  for (const [, grupo] of porToken) {
    // Un token compartido por muchas glosas no distingue: es ruido, no identidad.
    if (grupo.length < 2 || grupo.length > 3) continue;
    for (let i = 0; i < grupo.length; i++) {
      for (let j = i + 1; j < grupo.length; j++) {
        const a = tipico.get(grupo[i]!)!;
        const b = tipico.get(grupo[j]!)!;
        const mayor = Math.max(a, b);
        if (mayor > 0 && Math.abs(a - b) / mayor <= MAX_DIF_MONTO) unir(grupo[i]!, grupo[j]!);
      }
    }
  }

  // Canónica del grupo: la glosa con más movimientos (desempata la más larga).
  const mejorPorRaiz = new Map<string, string>();
  for (const k of claves) {
    const r = raiz(k);
    const actual = mejorPorRaiz.get(r);
    if (
      !actual ||
      porClave.get(k)!.veces > porClave.get(actual)!.veces ||
      (porClave.get(k)!.veces === porClave.get(actual)!.veces && k.length > actual.length)
    ) {
      mejorPorRaiz.set(r, k);
    }
  }
  return new Map(claves.map((k) => [k, mejorPorRaiz.get(raiz(k))!]));
}

// ─── Inventario (endpoint) ─────────────────────────────────────────────────────

export interface RecurringItem {
  label: string;
  direction: "egreso" | "ingreso";
  typicalAmountClp: number;
  typicalDay: number;
  /** Meses con movimiento. */
  occurrences: number;
  firstSeen: string;
  lastSeen: string;
  /** Último movimiento dentro de ACTIVE_WITHIN_DAYS respecto de la fecha de los datos. */
  active: boolean;
  /** Monto prácticamente fijo (CV ≤ 5%): suscripción, dividendo, sueldo fijo. */
  fixedAmount: boolean;
  transactionIds: string[];
}

export interface RecurringInventory {
  /** Fecha de referencia: el último movimiento del usuario (los datos vienen de cartolas). */
  asOf: string | null;
  charges: RecurringItem[];
  income: RecurringItem[];
  /** Suma del monto típico de las series ACTIVAS. */
  monthlyChargesClp: number;
  monthlyIncomeClp: number;
}

export const ACTIVE_WITHIN_DAYS = 45;

export const CHARGE_CRITERIA: MonthlySeriesCriteria = {
  direction: "egreso",
  keyOf: counterpartyKey,
  minOccurrences: 3,
  maxDaySpread: 4,
  circularDays: true,
  maxAmountCv: 0.35,
  maxPerMonthRatio: 1.6,
  monthlyAmount: "latest",
};

export const INCOME_CRITERIA: MonthlySeriesCriteria = {
  direction: "ingreso",
  keyOf: counterpartyKey,
  minOccurrences: 3,
  maxDaySpread: 5,
  circularDays: true,
  maxAmountCv: 0.4,
  maxPerMonthRatio: 2.5, // anticipo + sueldo (+ algún ajuste)
  monthlyAmount: "sum",
};

function toItem(s: MonthlySeries, asOf: Date): RecurringItem {
  const ageDays = Math.round(
    (asOf.getTime() - new Date(`${s.last.postedAt}T00:00:00Z`).getTime()) / 86_400_000,
  );
  return {
    label: counterpartyLabel(s.last.description),
    direction: s.direction,
    typicalAmountClp: s.typicalAmountClp,
    typicalDay: s.typicalDay,
    occurrences: s.monthly.length,
    firstSeen: s.monthly[0]!.postedAt,
    lastSeen: s.last.postedAt,
    active: ageDays <= ACTIVE_WITHIN_DAYS,
    fixedAmount: s.amountCv <= 0.05,
    transactionIds: s.all.map((t) => t.id).filter((id): id is string => Boolean(id)),
  };
}

/**
 * Inventario de recurrentes del usuario. La referencia para "activa" es el último movimiento
 * de sus datos, no hoy: las cartolas llegan con meses de desfase, y medir contra hoy marcaría
 * todo como cancelado.
 */
export function detectRecurringSeries(
  txs: SeriesInputTx[],
  opts: { asOf?: Date } = {},
): RecurringInventory {
  const latest = txs.reduce<string | null>(
    (m, t) => (m === null || t.postedAt > m ? t.postedAt : m),
    null,
  );
  const asOf = opts.asOf ?? (latest ? new Date(`${latest}T00:00:00Z`) : new Date());

  const byAmount = (a: RecurringItem, b: RecurringItem) => b.typicalAmountClp - a.typicalAmountClp;

  /** Criterios con la clave unificada: un comercio que cambió de glosa sigue siendo uno solo. */
  const conGlosasUnidas = (
    c: MonthlySeriesCriteria,
  ): { criterios: MonthlySeriesCriteria; canonica: Map<string, string> } => {
    const porClave = new Map<string, { montos: number[]; veces: number }>();
    for (const t of txs) {
      if (!t.description) continue;
      if ((c.direction === "egreso" ? t.amount < 0 : t.amount > 0) === false) continue;
      const k = c.keyOf(t.description);
      if (!k) continue;
      const e = porClave.get(k) ?? { montos: [], veces: 0 };
      e.montos.push(Math.abs(t.amount));
      e.veces++;
      porClave.set(k, e);
    }
    const canonica = unificarGlosasDelMismoComercio(porClave);
    return {
      criterios: {
        ...c,
        keyOf: (d) => {
          const k = c.keyOf(d);
          return canonica.get(k) ?? k;
        },
      },
      canonica,
    };
  };

  /**
   * Unir glosas NUNCA puede costar una serie. Al juntar dos nombres del mismo comercio, el mes
   * de transición queda con cargos de ambas glosas y la serie unida puede pasarse del máximo de
   * cargos por mes — criterio pensado para descartar consumo variable— y quedar descartada
   * entera. En producción eso hizo DESAPARECER una suscripción que antes al menos se veía a
   * medias (PlayStation: se veían 3 meses; tras unir, ninguno).
   *
   * Así que si la clave unificada no llega a serie, se conservan las que sí formaban las glosas
   * por separado. La unión sólo puede AGREGAR.
   */
  const seriesConRespaldo = (c: MonthlySeriesCriteria) => {
    const { criterios, canonica } = conGlosasUnidas(c);
    const unidas = findMonthlySeries(txs, criterios);
    const formadas = new Set(unidas.map((s) => s.key));
    const rescatadas = findMonthlySeries(txs, c).filter(
      (s) => !formadas.has(canonica.get(s.key) ?? s.key),
    );
    return [...unidas, ...rescatadas];
  };

  const charges = seriesConRespaldo(CHARGE_CRITERIA)
    .map((s) => toItem(s, asOf))
    .sort(byAmount);
  const income = seriesConRespaldo(INCOME_CRITERIA)
    .map((s) => toItem(s, asOf))
    .sort(byAmount);
  const activeSum = (items: RecurringItem[]) =>
    items.filter((i) => i.active).reduce((s, i) => s + i.typicalAmountClp, 0);

  return {
    asOf: latest,
    charges,
    income,
    monthlyChargesClp: activeSum(charges),
    monthlyIncomeClp: activeSum(income),
  };
}
