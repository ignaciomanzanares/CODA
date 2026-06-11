/**
 * Extractor de inscripciones del Conservador de Bienes Raíces (CBR) → prefill del
 * formulario de activos (atajo de entrada manual de propiedades).
 *
 * Camino SEPARADO de los uploaders de cartola (no comparte estado). Opera sobre
 * el texto del PDF. El bundle puede traer varios documentos CBR; se segmentan por
 * sus encabezados:
 *   - Dominio/Compraventa → "Registro de Propiedad"
 *   - Hipoteca            → "Registro de Hipotecas"   (PUEDE NO ESTAR)
 *   - Prohibición         → "Registro de Prohibiciones"
 *
 * Ojo: en el doc de Dominio hay anotaciones marginales de gravámenes
 * (p.ej. "HIPOTECA.", "PROHIBICION.") que NO son segmentos de documento. La
 * presencia de hipoteca se determina por el encabezado "Registro de Hipotecas",
 * nunca por la anotación marginal — así un bundle sólo-Dominio devuelve
 * mortgage=null en vez de un falso positivo.
 *
 * Montos en UF (forma dígitos "2.236,82" = punto miles / coma decimal). El valor
 * canónico se guarda en UF; la conversión a CLP es para mostrar, vía
 * indicators.getUf(date) (Task 1), con fxPending si no hay tasa.
 */

const MESES: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

/** UF en forma chilena, preservando decimales: "2.975"→2975, "2.236,82"→2236.82. */
export function parseUf(input: string | number | null | undefined): number {
  if (input === null || input === undefined) return 0;
  if (typeof input === 'number') return Number.isFinite(input) ? input : 0;
  const normalized = String(input).trim().replace(/\./g, '').replace(',', '.');
  const n = parseFloat(normalized);
  return Number.isFinite(n) ? n : 0;
}

export interface InscripcionHipoteca {
  acreedor: string;
  montoUf: number;
}

export interface InscripcionDominio {
  fojas: number | null;
  numero: number | null;
  anio: number | null;
  /** Etiqueta legible: "Fs 3675 Nº 3171-2024". */
  referencia: string;
}

export interface InscripcionResult {
  titular: string;
  rut: string;
  comuna: string;
  dominio: InscripcionDominio;
  rolAvaluo: string;
  unidad: string;
  departamento: string;
  condominio: string;
  descripcion: string;
  /** Precio de compraventa en UF (valor canónico). */
  compraventaUf: number;
  /** Hipoteca, sólo si el bundle incluye un documento "Registro de Hipotecas". */
  hipoteca: InscripcionHipoteca | null;
  prohibiciones: string[];
  fechaInscripcion: Date | null;
  documentos: { dominio: boolean; hipoteca: boolean; prohibicion: boolean };
  warnings: string[];
}

/** Prefill para el formulario de activos (el usuario revisa y guarda). */
export interface AssetPrefill {
  type: 'property';
  name: string;
  /** Costo de adquisición = compraventa UF × UF a la fecha de escritura (Dominio). */
  acquisitionCostClp: number | null;
  /** Valor estimado actual = compraventa UF × UF de HOY (opcional). */
  estimatedValueClp: number | null;
  hasLien: boolean;
  lienAmountClp: number | null;
  notes: string;
  /** true si no se pudo convertir el costo UF→CLP (faltó la tasa de escritura). */
  fxPending: boolean;
  /** Trazabilidad: valores nativos en UF + tasas aplicadas. */
  source: {
    compraventaUf: number;
    hipotecaUf: number | null;
    /** UF a la fecha de escritura (Dominio) usada para el costo y la hipoteca. */
    escrituraUfRate: number | null;
    /** UF actual usada para el valor estimado (si se calculó). */
    currentUfRate: number | null;
    escrituraDate: string | null;
    dominio: string;
    rolAvaluo: string;
  };
}

function firstMatch(text: string, re: RegExp): RegExpMatchArray | null {
  return text.match(re);
}

export function extractInscripcion(text: string): InscripcionResult {
  const warnings: string[] = [];

  // ── Segmentación por documento ──────────────────────────────────────────────
  const tieneDominio = /Registro de Propiedad/i.test(text);
  const tieneHipoteca = /Registro de Hipotecas/i.test(text); // header de documento, NO la anotación marginal
  const tieneProhibicion = /Registro de Prohibiciones/i.test(text);

  // ── Dominio: fojas / número / año ───────────────────────────────────────────
  let fojas: number | null = null, numero: number | null = null, anio: number | null = null;
  const fsM = firstMatch(text, /Registro de Propiedad\s+Fs\s+(\d+)\s+Nro\s+(\d+)\s*-\s*(\d{4})/i)
    ?? firstMatch(text, /fojas\s+(\d+)\s+n[uú]mero\s+(\d+)\s+correspondiente al Registro de Propiedad del a[ñn]o\s+(\d{4})/i);
  if (fsM) {
    fojas = parseInt(fsM[1]!, 10);
    numero = parseInt(fsM[2]!, 10);
    anio = parseInt(fsM[3]!, 10);
  } else {
    warnings.push('No se pudo leer fojas/número/año del Dominio.');
  }
  const referencia = fojas != null ? `Fs ${fojas} Nº ${numero}-${anio}` : '';

  // ── Titular + RUT (comprador) ───────────────────────────────────────────────
  const titularM = firstMatch(text, /vendi[oó]\s+a\s+don[a]?\s+([A-ZÑÁÉÍÓÚ][A-ZÑÁÉÍÓÚ ]+?),/i);
  const titular = titularM ? titularM[1]!.replace(/\s+/g, ' ').trim() : '';
  const rutM = firstMatch(text, /c[eé]dula de identidad\s+([\d.]+-[\dkK])/i)
    ?? firstMatch(text, /\b(\d{1,2}\.\d{3}\.\d{3}-[\dkK])\b/);
  const rut = rutM ? rutM[1]! : '';

  // ── Comuna ──────────────────────────────────────────────────────────────────
  const comunaM = firstMatch(text, /comuna de\s+([A-ZÑÁÉÍÓÚ][A-ZÑÁÉÍÓÚ]+)/i);
  const comuna = comunaM ? comunaM[1]!.trim() : '';

  // ── Unidad / departamento / condominio ──────────────────────────────────────
  const unidadM = firstMatch(text, /UNIDAD[\s\S]{0,40}?\((\d+)\)/i);
  const unidad = unidadM ? unidadM[1]! : '';
  const deptoM = firstMatch(text, /DEPARTAMENTO\s+[\s\S]{0,40}?\(([A-Z]\s?\d+)\)/i);
  const departamento = deptoM ? deptoM[1]!.replace(/\s+/g, ' ').trim() : '';
  const condoM = firstMatch(text, /Condominio\s+([A-ZÑÁÉÍÓÚ][A-ZÑÁÉÍÓÚ ]+?)(?:,|\bconstruido|\bubicado)/i);
  const condominio = condoM ? condoM[1]!.replace(/\s+/g, ' ').trim() : '';

  const descParts: string[] = [];
  if (departamento) descParts.push(`Departamento ${departamento}`);
  else if (unidad) descParts.push(`Unidad ${unidad}`);
  if (condominio) descParts.push(`Condominio ${condominio}`);
  const descripcion = descParts.join(', ');

  // ── Precio de compraventa (UF) ──────────────────────────────────────────────
  const precioM = firstMatch(text, /precio[\s\S]{0,120}?\(([\d.,]+)\)\s*unidades?\s+de\s+fomento/i);
  const compraventaUf = precioM ? parseUf(precioM[1]!) : 0;
  if (compraventaUf === 0) warnings.push('No se pudo leer el precio de compraventa en UF.');

  // ── Rol de avalúo ───────────────────────────────────────────────────────────
  const rolM = firstMatch(text, /rol\s+de\s+aval[uú]o\s+n[uú]mero\s+([\d]+\s*-\s*[\d]+)/i);
  const rolAvaluo = rolM ? rolM[1]!.replace(/\s+/g, '') : '';

  // ── Hipoteca (sólo si hay documento "Registro de Hipotecas") ────────────────
  let hipoteca: InscripcionHipoteca | null = null;
  if (tieneHipoteca) {
    const seg = text.slice(text.search(/Registro de Hipotecas/i));
    const montoM = firstMatch(seg, /\(([\d.,]+)\)\s*unidades?\s+de\s+fomento/i);
    const acreedorM = firstMatch(seg, /(COOPEUCH|BANCO\s+[A-ZÑÁÉÍÓÚ ]+?|CAJA\s+[A-ZÑÁÉÍÓÚ ]+?|MUTUARIA\s+[A-ZÑÁÉÍÓÚ ]+?)(?:,|\.|\bpor\b)/i);
    hipoteca = {
      acreedor: acreedorM ? acreedorM[1]!.replace(/\s+/g, ' ').trim() : '',
      montoUf: montoM ? parseUf(montoM[1]!) : 0,
    };
    if (hipoteca.montoUf === 0) warnings.push('Documento de Hipoteca presente pero no se pudo leer el monto UF.');
  }

  // ── Prohibiciones ───────────────────────────────────────────────────────────
  const prohibiciones: string[] = [];
  if (tieneProhibicion || /PROHIBICION/i.test(text)) {
    for (const m of text.matchAll(/PROHIBICION[.\s]+(\d+\s*-\s*\d+\s*-\s*\d{4})/gi)) {
      prohibiciones.push(m[1]!.replace(/\s+/g, ''));
    }
  }

  // ── Fecha de inscripción ────────────────────────────────────────────────────
  let fechaInscripcion: Date | null = null;
  const fechaM = firstMatch(text, /Concepci[oó]n,\s+(\d{1,2})\s+de\s+([a-záéíóú]+)\s+de\s+(\d{4})/i)
    ?? firstMatch(text, /(\d{1,2})\s+de\s+([a-záéíóú]+)\s+de(?:l a[ñn]o[^()]*)?\s*\((\d{4})\)/i);
  if (fechaM) {
    const mes = MESES[fechaM[2]!.toLowerCase()];
    if (mes) fechaInscripcion = new Date(parseInt(fechaM[3]!, 10), mes - 1, parseInt(fechaM[1]!, 10), 12, 0, 0, 0);
  }

  return {
    titular,
    rut,
    comuna,
    dominio: { fojas, numero, anio, referencia },
    rolAvaluo,
    unidad,
    departamento,
    condominio,
    descripcion,
    compraventaUf,
    hipoteca,
    prohibiciones,
    fechaInscripcion,
    documentos: { dominio: tieneDominio, hipoteca: tieneHipoteca, prohibicion: tieneProhibicion },
    warnings,
  };
}

function validRate(r: number | null | undefined): r is number {
  return r != null && Number.isFinite(r) && r > 0;
}

/**
 * Construye el prefill del formulario de activos.
 *  - `escrituraUfRate` = CLP por 1 UF a la FECHA DE ESCRITURA (Dominio). Es la
 *    tasa correcta para el COSTO DE ADQUISICIÓN y la hipoteca — NO la de hoy.
 *  - `currentUfRate` (opcional) = UF de hoy, para el VALOR ESTIMADO actual.
 * Tasa de escritura null → fxPending y costo CLP null (muestra UF, reintenta).
 * NO crea el activo: el usuario revisa y guarda.
 */
export function buildAssetPrefill(
  result: InscripcionResult,
  escrituraUfRate: number | null,
  currentUfRate?: number | null,
): AssetPrefill {
  const haveEscritura = validRate(escrituraUfRate);
  const haveCurrent = validRate(currentUfRate);
  const hipotecaUf = result.hipoteca?.montoUf ?? null;

  // Costo de adquisición e hipoteca → UF a la fecha de escritura.
  const acquisitionCostClp = haveEscritura ? Math.round(result.compraventaUf * escrituraUfRate) : null;
  const lienAmountClp = haveEscritura && hipotecaUf != null ? Math.round(hipotecaUf * escrituraUfRate) : null;
  // Valor estimado actual (opcional) → UF de hoy.
  const estimatedValueClp = haveCurrent ? Math.round(result.compraventaUf * currentUfRate) : null;

  const notesParts: string[] = [];
  if (result.dominio.referencia) notesParts.push(`Dominio ${result.dominio.referencia}`);
  if (result.rolAvaluo) notesParts.push(`Rol ${result.rolAvaluo}`);
  if (result.comuna) notesParts.push(`Comuna ${result.comuna}`);
  notesParts.push(`Compraventa ${result.compraventaUf} UF`);
  if (result.hipoteca) notesParts.push(`Hipoteca ${result.hipoteca.acreedor} ${result.hipoteca.montoUf} UF`);

  return {
    type: 'property',
    name: result.descripcion || 'Propiedad',
    acquisitionCostClp,
    estimatedValueClp,
    // tiene_garantia = true SÓLO si hay documento de hipoteca en el bundle.
    hasLien: result.hipoteca != null,
    lienAmountClp,
    notes: notesParts.join(' · '),
    fxPending: !haveEscritura,
    source: {
      compraventaUf: result.compraventaUf,
      hipotecaUf,
      escrituraUfRate: haveEscritura ? escrituraUfRate : null,
      currentUfRate: haveCurrent ? currentUfRate : null,
      escrituraDate: result.fechaInscripcion ? result.fechaInscripcion.toISOString().slice(0, 10) : null,
      dominio: result.dominio.referencia,
      rolAvaluo: result.rolAvaluo,
    },
  };
}

/**
 * Orquesta el prefill resolviendo las tasas UF correctas:
 *  - costo/hipoteca → getUf(fecha de escritura del Dominio);
 *  - valor estimado → getUf(hoy).
 * `getUf` es inyectable para tests; por defecto indicators.getUf. Nunca lanza:
 * si una tasa no está, ese monto queda null (fxPending para el costo).
 */
export async function resolveInscripcionPrefill(
  result: InscripcionResult,
  getUf?: (date: Date) => Promise<number | null>,
): Promise<AssetPrefill> {
  const ufFn = getUf ?? (await import('../services/indicators.js')).getUf;
  // Costo a la fecha de escritura (NO hoy). Sin fecha → no se puede fechar el costo.
  const escrituraUfRate = result.fechaInscripcion ? await ufFn(result.fechaInscripcion) : null;
  const currentUfRate = await ufFn(new Date());
  return buildAssetPrefill(result, escrituraUfRate, currentUfRate);
}
