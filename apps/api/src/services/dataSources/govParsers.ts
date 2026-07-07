/**
 * Parsers de los PDFs oficiales de AFP / SII / Tesorería (Fase 5).
 *
 * CALIBRACIÓN: ajustados contra un documento real de cada fuente (carpeta tributaria SII,
 * certificado de cotizaciones AFP Modelo, certificado de deuda TGR). Los formatos varían entre
 * AFP e incluso entre años del F22 del SII, así que cada parser es TOLERANTE: si no encuentra el
 * dato lo omite o devuelve ok=false con un mensaje, nunca lanza. Recalibrar al incorporar más
 * muestras (p. ej. otras AFP, carpetas con renta de sueldos código 1098).
 */
import type { GovParseResult, GovSource } from './types.js';

/** Rango razonable de una renta mensual en CLP, para filtrar montos espurios del PDF. */
const MIN_RENTA_MENSUAL = 100_000;
const MAX_RENTA_MENSUAL = 30_000_000;

/** La cuenta obligatoria recibe el 10% de la renta imponible → renta ≈ cotización / 0,10. */
const TASA_COTIZACION_OBLIGATORIA = 0.1;

/** Extrae todos los montos en CLP del texto (formato chileno: puntos como separador de miles). */
export function extractMontosClp(text: string): number[] {
  const montos: number[] = [];
  // $ 1.234.567  |  1.234.567  |  1234567  (con o sin símbolo, con o sin puntos)
  const re = /\$?\s*(\d{1,3}(?:\.\d{3})+|\d{4,})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const n = parseInt(m[1].replace(/\./g, ''), 10);
    if (Number.isFinite(n) && n > 0) montos.push(n);
  }
  return montos;
}

/** Primer monto con separador de miles de una línea (p. ej. la columna «Monto Pesos» de la AFP). */
function firstMontoConMiles(line: string): number | null {
  const m = line.match(/(\d{1,3}(?:\.\d{3})+)/);
  if (!m) return null;
  const n = parseInt(m[1].replace(/\./g, ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Valor de un código del Formulario 22: `<código> <glosa sin dígitos> <monto>`.
 * Acotar el texto a la sección F22 evita capturar el mismo código en el F29 (IVA).
 */
function codigoF22(text: string, codigo: number): number | null {
  const re = new RegExp(`\\b${codigo}\\b\\D{0,80}?(\\d{1,3}(?:\\.\\d{3})+|\\d{4,})`);
  const m = text.match(re);
  if (!m) return null;
  const n = parseInt(m[1].replace(/\./g, ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Aísla el bloque del año tributario más reciente dentro de la sección F22 (cada año puede abarcar
 * varias páginas que repiten «AÑO TRIBUTARIO 20XX»). Evita mezclar códigos de años distintos.
 */
function bloqueAnioReciente(f22: string): string {
  const marcas = [...f22.matchAll(/A[ÑN]O TRIBUTARIO\s+(20\d{2})/gi)].map((m) => ({
    year: parseInt(m[1], 10),
    idx: m.index ?? 0,
  }));
  if (marcas.length === 0) return f22;
  const maxYear = Math.max(...marcas.map((m) => m.year));
  const inicio = marcas.find((m) => m.year === maxYear)!.idx;
  const fin = marcas.find((m) => m.idx > inicio && m.year < maxYear)?.idx ?? f22.length;
  return f22.slice(inicio, fin);
}

const median = (nums: number[]): number => {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
};

/**
 * Clasifica a qué fuente corresponde un texto de PDF (valida el documento subido).
 * Basado en puntaje de marcadores: la carpeta SII contiene «cotizaciones previsionales» y la
 * palabra «tesorería», así que un simple orden de reglas las confunde. Gana el mayor puntaje.
 */
export function detectGovSource(text: string): GovSource | null {
  const t = text.toLowerCase();
  const count = (re: RegExp) => (t.match(re) ?? []).length;

  const score: Record<GovSource, number> = {
    sii:
      2 * count(/servicio de impuestos internos|carpeta tributaria|formulario 22|impuestos anuales a la renta/g) +
      count(/base imponible|boletas de honorarios|declaraci[oó]n de renta|declaraci[oó]n mensual/g),
    afp:
      2 * count(/certificado\s+cotizaciones|cuenta obligatoria|a\.?f\.?p\.?\s/g) +
      count(/cotizaci[oó]n normal|renta imponible|remuneraci[oó]n imponible/g),
    tgr:
      2 * count(/tesorer[íi]a general|servicio de tesorer[íi]a|certificado de deuda|cuenta [uú]nica tributaria/g) +
      count(/no registra deuda|deuda fiscal|deuda tributaria/g),
  };

  let best: GovSource | null = null;
  let bestScore = 0;
  for (const src of ['sii', 'afp', 'tgr'] as const) {
    if (score[src] > bestScore) {
      bestScore = score[src];
      best = src;
    }
  }
  return best;
}

/**
 * AFP — certificado de cotizaciones. El certificado NO trae la renta imponible como tal: lista, por
 * período, la cotización depositada en la cuenta obligatoria («Monto Pesos»). Contamos los períodos
 * cotizados (señal robusta de estabilidad) y estimamos la renta imponible ≈ mediana(cotización)/0,10.
 * Si el certificado sí trae «renta imponible» explícita, se prefiere ese valor.
 */
export function parseAfp(text: string): GovParseResult {
  const lines = text.split(/\r?\n/);
  const cotizacionLines = lines.filter((l) => /cotizaci[oó]n\s+(normal|rezagad|obligatori)/i.test(l));
  const contributionMonths = cotizacionLines.length || null;

  // 1) Renta imponible explícita, si el certificado la trae en alguna línea.
  const rentaExplicita = lines
    .filter((l) => /renta|remuneraci[oó]n/i.test(l) && /imponible/i.test(l))
    .flatMap((l) => extractMontosClp(l))
    .filter((n) => n >= MIN_RENTA_MENSUAL && n <= MAX_RENTA_MENSUAL);

  let verifiedMonthlyIncomeClp: number | null = null;
  let estimadaDeCotizacion = false;

  if (rentaExplicita.length > 0) {
    verifiedMonthlyIncomeClp = median(rentaExplicita);
  } else if (cotizacionLines.length > 0) {
    // 2) Estimar desde la columna «Monto Pesos» (primer monto con miles de cada línea de cotización).
    const cotizaciones = cotizacionLines
      .map((l) => firstMontoConMiles(l))
      .filter((n): n is number => n != null && n > 0);
    if (cotizaciones.length > 0) {
      const estimada = Math.round(median(cotizaciones) / TASA_COTIZACION_OBLIGATORIA);
      if (estimada >= MIN_RENTA_MENSUAL && estimada <= MAX_RENTA_MENSUAL) {
        verifiedMonthlyIncomeClp = estimada;
        estimadaDeCotizacion = true;
      }
    }
  }

  if (verifiedMonthlyIncomeClp == null && contributionMonths == null) {
    return { source: 'afp', ok: false, raw: {}, message: 'No se pudo leer el certificado de cotizaciones AFP.' };
  }
  return {
    source: 'afp',
    ok: true,
    verifiedMonthlyIncomeClp,
    contributionMonths,
    raw: { periodosCotizados: contributionMonths, ingresoEstimadoDeCotizacion: estimadaDeCotizacion },
  };
}

/**
 * SII — carpeta tributaria. La renta de una persona está en el Formulario 22 (declaración anual),
 * no en las «base imponible» del F29 (que son bases de IVA, montos ínfimos). Acotamos al bloque del
 * año tributario MÁS RECIENTE (para no mezclar sueldos de un año con honorarios de otro) y sumamos
 * sueldos (código 1098) + honorarios brutos (código 547 «Total Ingresos Brutos», o 461/467). /12.
 */
export function parseSii(text: string): GovParseResult {
  const f22Start = text.search(/Formulario 22|IMPUESTOS ANUALES A LA RENTA/i);
  const f22Full = f22Start >= 0 ? text.slice(f22Start) : text;
  const f22 = bloqueAnioReciente(f22Full);

  const sueldos = codigoF22(f22, 1098) ?? 0; // Sueldos, pensiones y otras rentas de fuente nacional.
  const honorarios =
    codigoF22(f22, 547) ?? // Total Ingresos Brutos (honorarios).
    codigoF22(f22, 461) ?? // Honorarios Anuales Con Retención.
    codigoF22(f22, 467) ?? // Total Honorarios.
    0;
  const rentaAnual = sueldos + honorarios;

  if (rentaAnual <= 0) {
    return {
      source: 'sii',
      ok: false,
      raw: { f22Encontrado: f22Start >= 0 },
      message: 'No se pudo leer la renta en el Formulario 22 de la carpeta tributaria.',
    };
  }

  const verifiedMonthlyIncomeClp = Math.round(rentaAnual / 12);
  const ok = verifiedMonthlyIncomeClp >= MIN_RENTA_MENSUAL && verifiedMonthlyIncomeClp <= MAX_RENTA_MENSUAL;
  return {
    source: 'sii',
    ok,
    verifiedMonthlyIncomeClp: ok ? verifiedMonthlyIncomeClp : null,
    raw: { rentaAnual, sueldos, honorarios },
    message: ok ? undefined : 'La renta extraída quedó fuera de rango; revisa el documento.',
  };
}

/** TGR — certificado de deuda fiscal: monto adeudado (0 si no registra deuda). */
export function parseTgr(text: string): GovParseResult {
  const t = text.toLowerCase();
  if (/no registra deuda|sin deuda|no presenta deuda|no mantiene deuda/.test(t)) {
    return { source: 'tgr', ok: true, fiscalDebtClp: 0, raw: { sinDeuda: true } };
  }
  const montos = extractMontosClp(text);
  if (montos.length === 0) {
    return { source: 'tgr', ok: false, raw: {}, message: 'No se pudo leer el monto de deuda fiscal.' };
  }
  // El total adeudado suele ser el mayor monto del certificado.
  const fiscalDebtClp = Math.max(...montos);
  return { source: 'tgr', ok: true, fiscalDebtClp, raw: { montosDetectados: montos.length } };
}

/** Dispatcher por fuente. */
export function parseGovDocument(source: GovSource, text: string): GovParseResult {
  switch (source) {
    case 'afp':
      return parseAfp(text);
    case 'sii':
      return parseSii(text);
    case 'tgr':
      return parseTgr(text);
  }
}
