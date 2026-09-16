/**
 * Movimientos EXTRAORDINARIOS: plata que sí entró o salió, pero que no describe el
 * ritmo mensual de la persona. Un matrimonio, un auto, el pie de un departamento,
 * una operación.
 *
 * El problema que resuelve: CODA diagnosticaba el mes de un evento así como si fuera
 * la vida financiera normal del usuario. Un pago de $10.000.000 a un catering entra
 * como "gasto personal" y arrastra la tasa de ahorro a −18%, la variable Ahorro/Ingreso
 * a "Crítico" y las features del modelo a una PD de cola no confiable. `ratiosDerivation`
 * sólo ACOTA el ratio (±1000%) para que la UI no reviente — un parche visual, no un
 * diagnóstico correcto.
 *
 * Política: **el detector propone, el usuario decide**. Nunca se marca solo. Sacar plata
 * del diagnóstico sin que el dueño lo sepa sería reescribirle las finanzas en silencio,
 * y en un producto de crédito eso además tiene que ser auditable (quién y cuándo).
 *
 * Lo extraordinario SIGUE contando en saldo, patrimonio y Movimientos — la plata se gastó.
 * Sólo sale del baseline que modela el ritmo recurrente.
 */
import { isInternalTransferTx } from "../assistantContext.js";

/**
 * Mínimo de movimientos en esa dirección (ingreso/egreso) para que la mediana signifique
 * algo. Con menos historia no proponemos nada: no sabríamos qué es "habitual" para esta
 * persona, y preguntar por cada monto grande de un usuario nuevo sería ruido puro.
 */
export const MIN_SAMPLE_SIZE = 12;

/**
 * Cuántas veces la mediana habitual de SU dirección tiene que ser un movimiento para
 * sospechar. Mediana y no promedio: el promedio ya viene contaminado por el propio outlier.
 *
 * Distinto por dirección, porque las distribuciones no se parecen. Los egresos son muchos
 * y chicos (cafés, bencina, supermercado) → mediana baja, un evento queda a cientos de
 * veces. Los ingresos son pocos y grandes (sueldo, honorarios) → la mediana ya es alta, y
 * un 10× sobre un sueldo es casi inalcanzable. Caso real que lo calibró: mediana de egreso
 * $9.907 (502 cargos) vs. de ingreso $365.000 (70 abonos). Las transferencias de terceros
 * asociadas a un evento puntual quedaban en 6,8× y NUNCA se proponían; marcar sólo el gasto
 * del evento dejaba el ingreso inflado y la tasa de ahorro saltaba a ~81% — otro
 * diagnóstico falso, al revés. Con 5× entran, y un pago recurrente de empresa (3,7×) no.
 *
 * Errar hacia proponer de más es barato (un clic en "Es habitual" y no se vuelve a
 * preguntar); errar hacia proponer de menos deja un diagnóstico equivocado sin salida.
 */
export const MEDIAN_MULTIPLE = { egreso: 10, ingreso: 5 } as const;

/** Además tiene que ser material dentro de su mes: un evento explica parte grande del mes. */
export const MIN_MONTH_SHARE = 0.2;

/**
 * Piso absoluto en CLP. Sin esto, a quien sólo registra cafés le preguntaríamos por una
 * compra de $40.000 — técnicamente un outlier, pero no un evento de vida.
 */
export const MIN_AMOUNT_CLP = 500_000;

export interface BaselineTxLike {
  description?: string;
  descripcion?: string;
  category?: string;
  categoria?: string;
  es_transferencia?: boolean;
  is_internal_transfer?: number | boolean;
  isInternalTransfer?: number | boolean;
  /** Señal autoritativa de la tabla `transactions`. null = sin decidir. */
  is_extraordinary?: number | null;
  isExtraordinary?: number | boolean | null;
}

/**
 * Decisión del usuario sobre el movimiento, en tres estados: 1 puntual, 0 habitual, null sin
 * decidir. Manda la columna autoritativa `is_extraordinary`; el booleano `isExtraordinary`
 * sólo se usa si esa columna no viene.
 *
 * OJO: el booleano COLAPSA null y 0 en `false`, así que nunca puede significar "decidido
 * habitual". Leerlo así fue un bug real: `is_extraordinary ?? isExtraordinary` convertía
 * cada fila sin decidir (null) en `false` → "ya decidida" → el detector saltaba TODO en
 * producción, mientras los tests (sin el booleano en el fixture) pasaban.
 */
export function extraordinaryDecision(t: BaselineTxLike): 0 | 1 | null {
  if (t.is_extraordinary === 1 || t.is_extraordinary === 0) return t.is_extraordinary;
  if (t.is_extraordinary === null) return null;
  if (t.isExtraordinary === 1 || t.isExtraordinary === true) return 1;
  if (t.isExtraordinary === 0) return 0; // numérico explícito; `false` NO cuenta
  return null;
}

/** True sólo si el USUARIO confirmó que el movimiento fue puntual. NULL (sin decidir) es false. */
export function isExtraordinaryTx(t: BaselineTxLike): boolean {
  if (t.is_extraordinary === 1) return true;
  if (t.isExtraordinary === 1 || t.isExtraordinary === true) return true;
  return false;
}

/**
 * Predicado ÚNICO de "esto no describe el ritmo recurrente": transferencia interna
 * (traspaso entre productos propios, nunca fue ingreso ni gasto) o evento extraordinario
 * confirmado por el usuario (sí fue real, pero irrepetible).
 *
 * Lo usan las superficies que modelan el ritmo: salud financiera, tasa de ahorro, features
 * del modelo de riesgo y reconciliación de ingresos. NO lo usan Movimientos, saldo ni
 * patrimonio, que muestran la realidad tal cual.
 */
export function isOutsideBaselineTx(t: BaselineTxLike): boolean {
  return isInternalTransferTx(t) || isExtraordinaryTx(t);
}

export interface CandidateTxLike extends BaselineTxLike {
  id: string;
  postedAt: string;
  month: string;
  cargo: number;
  abono: number;
  tipo: "ingreso" | "egreso";
}

export interface ExtraordinaryCandidate {
  id: string;
  postedAt: string;
  month: string;
  description: string;
  categoria: string;
  tipo: "ingreso" | "egreso";
  /** Magnitud en CLP (siempre positiva). */
  amountClp: number;
  /** Cuántas veces el movimiento habitual de esa dirección. Redondeado a 1 decimal. */
  medianMultiple: number;
  /** Qué fracción del mes (en esa dirección) explica este solo movimiento. 0–1. */
  monthShare: number;
}

/** Mediana de una lista no vacía. Robusta al outlier que justamente estamos buscando. */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

const magnitudeOf = (t: CandidateTxLike) => (t.tipo === "ingreso" ? t.abono : t.cargo);

/**
 * Propone los movimientos que parecen puntuales. Función PURA: recibe las transacciones
 * normalizadas y devuelve candidatos ordenados por monto, sin tocar la base.
 *
 * Un candidato tiene que cumplir las TRES condiciones a la vez — muy por encima de lo
 * habitual, material dentro de su mes, y grande en términos absolutos. Cualquiera sola
 * produce falsos positivos: el múltiplo solo dispara con quien gasta poco, la fracción
 * sola dispara en meses con pocos movimientos, y el piso solo dispara con quien gasta
 * mucho todos los meses.
 */
export function detectExtraordinaryCandidates(
  txs: CandidateTxLike[],
  limit = 10,
): ExtraordinaryCandidate[] {
  // Los traspasos propios nunca son candidatos: ya están fuera del baseline por otra vía.
  const relevant = txs.filter((t) => !isInternalTransferTx(t) && magnitudeOf(t) > 0);

  // Población para la mediana: lo que hoy consideramos ritmo normal. Se excluye lo ya
  // marcado como extraordinario para que un segundo evento no se compare contra una
  // mediana ya inflada por el primero.
  const ordinary = relevant.filter((t) => !isExtraordinaryTx(t));

  const medianByTipo = new Map<string, number>();
  const monthTotals = new Map<string, number>();
  for (const tipo of ["ingreso", "egreso"] as const) {
    const sample = ordinary.filter((t) => t.tipo === tipo).map(magnitudeOf);
    medianByTipo.set(tipo, sample.length >= MIN_SAMPLE_SIZE ? median(sample) : 0);
  }
  // Denominador del mes: el total REAL de esa dirección, incluido el propio candidato —
  // es lo que hace verdadera la frase "explica el X% del mes".
  for (const t of relevant) {
    const key = `${t.month}|${t.tipo}`;
    monthTotals.set(key, (monthTotals.get(key) ?? 0) + magnitudeOf(t));
  }

  const candidates: ExtraordinaryCandidate[] = [];
  for (const t of relevant) {
    // Ya decidido por el usuario (puntual o habitual): no se vuelve a preguntar.
    if (extraordinaryDecision(t) !== null) continue;

    const amount = magnitudeOf(t);
    if (amount < MIN_AMOUNT_CLP) continue;

    const med = medianByTipo.get(t.tipo) ?? 0;
    if (med <= 0) continue; // sin historia suficiente para juzgar

    const multiple = amount / med;
    if (multiple < MEDIAN_MULTIPLE[t.tipo]) continue;

    const monthTotal = monthTotals.get(`${t.month}|${t.tipo}`) ?? 0;
    const share = monthTotal > 0 ? amount / monthTotal : 0;
    if (share < MIN_MONTH_SHARE) continue;

    candidates.push({
      id: t.id,
      postedAt: t.postedAt,
      month: t.month,
      description: t.descripcion ?? t.description ?? "",
      categoria: t.categoria ?? t.category ?? "otro",
      tipo: t.tipo,
      amountClp: Math.round(amount),
      medianMultiple: Math.round(multiple * 10) / 10,
      monthShare: Math.round(share * 100) / 100,
    });
  }

  candidates.sort((a, b) => b.amountClp - a.amountClp);
  return candidates.slice(0, limit);
}
