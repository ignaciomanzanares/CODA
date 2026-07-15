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

import { logger } from "../logger.js";

const MESES: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};

/** UF en forma chilena, preservando decimales: "2.975"→2975, "2.236,82"→2236.82. */
export function parseUf(input: string | number | null | undefined): number {
  if (input === null || input === undefined) return 0;
  if (typeof input === "number") return Number.isFinite(input) ? input : 0;
  const normalized = String(input).trim().replace(/\./g, "").replace(",", ".");
  const n = parseFloat(normalized);
  return Number.isFinite(n) ? n : 0;
}

// Números cardinales en palabras (es-CL) para rescatar montos cuando el OCR
// mutila los dígitos (p. ej. la compraventa quedó deletreada, no en cifras).
const CARDINAL_UNIDADES: Record<string, number> = {
  cero: 0,
  un: 1,
  uno: 1,
  una: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12,
  trece: 13,
  catorce: 14,
  quince: 15,
  dieciseis: 16,
  diecisiete: 17,
  dieciocho: 18,
  diecinueve: 19,
  veinte: 20,
  veintiun: 21,
  veintiuno: 21,
  veintiuna: 21,
  veintidos: 22,
  veintitres: 23,
  veinticuatro: 24,
  veinticinco: 25,
  veintiseis: 26,
  veintisiete: 27,
  veintiocho: 28,
  veintinueve: 29,
  treinta: 30,
  cuarenta: 40,
  cincuenta: 50,
  sesenta: 60,
  setenta: 70,
  ochenta: 80,
  noventa: 90,
};
const CARDINAL_CIENTOS: Record<string, number> = {
  cien: 100,
  ciento: 100,
  doscientos: 200,
  doscientas: 200,
  trescientos: 300,
  trescientas: 300,
  cuatrocientos: 400,
  cuatrocientas: 400,
  quinientos: 500,
  quinientas: 500,
  seiscientos: 600,
  seiscientas: 600,
  setecientos: 700,
  setecientas: 700,
  ochocientos: 800,
  ochocientas: 800,
  novecientos: 900,
  novecientas: 900,
};

/**
 * Convierte un cardinal en palabras (es) a entero, o null si no es parseable.
 * Conservador: ignora palabras de relleno al inicio/fin pero, una vez empezado el
 * número, corta al toparse con una palabra desconocida (evita inventar montos).
 * Ej.: "DOS MIL QUINIENTAS CINCUENTA Y NUEVE" → 2559.
 */
export function parseSpanishCardinal(phrase: string | null | undefined): number | null {
  if (!phrase) return null;
  const norm = String(phrase)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // sin acentos
    .replace(/[^a-z\s]/g, " ")
    .trim();
  const tokens = norm.split(/\s+/).filter((t) => t && t !== "y");
  let total = 0,
    current = 0,
    started = false;
  for (const w of tokens) {
    if (CARDINAL_UNIDADES[w] != null) {
      current += CARDINAL_UNIDADES[w];
      started = true;
    } else if (CARDINAL_CIENTOS[w] != null) {
      current += CARDINAL_CIENTOS[w];
      started = true;
    } else if (w === "mil") {
      current = (current === 0 ? 1 : current) * 1000;
      total += current;
      current = 0;
      started = true;
    } else if (w === "millon" || w === "millones") {
      current = (current === 0 ? 1 : current) * 1_000_000;
      total += current;
      current = 0;
      started = true;
    } else if (started) break; // ya venía un número y apareció ruido → cortar
    // si aún no empezó, se ignora la palabra de relleno
  }
  total += current;
  return started && total > 0 ? total : null;
}

export interface InscripcionHipoteca {
  acreedor: string;
  montoUf: number;
  /** Inscripción de la hipoteca en el Registro de Hipotecas (línea de gravámenes). */
  fojas: number | null;
  numero: number | null;
  anio: number | null;
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
  type: "property";
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
  let fojas: number | null = null,
    numero: number | null = null,
    anio: number | null = null;
  // OCR-tolerante: espacios flexibles y "correspondiente al" | "del". El ancla
  // "Registro de Propiedad" entre número y año evita confundirlo con el fojas/
  // número de la HIPOTECA ("...del año 2024" SIN "Registro de Propiedad").
  const fsM =
    firstMatch(text, /Registro de Propiedad\s+Fs\s+(\d+)\s+Nro\s+(\d+)\s*-\s*(\d{4})/i) ??
    firstMatch(
      text,
      /fojas\s+(\d+)\s+n[uú]mero\s+(\d+)\s+(?:correspondiente\s+al|del)\s+Registro\s+de\s+Propiedad\s+del\s+a[ñn]o\s+(\d{4})/i,
    );
  if (fsM) {
    fojas = parseInt(fsM[1]!, 10);
    numero = parseInt(fsM[2]!, 10);
    anio = parseInt(fsM[3]!, 10);
  } else {
    warnings.push("No se pudo leer fojas/número/año del Dominio.");
  }
  const referencia = fojas != null ? `Fs ${fojas} Nº ${numero}-${anio}` : "";

  // ── Titular + RUT (comprador) ───────────────────────────────────────────────
  const titularM = firstMatch(text, /vendi[oó]\s+a\s+don[a]?\s+([A-ZÑÁÉÍÓÚ][A-ZÑÁÉÍÓÚ ]+?),/i);
  const titular = titularM ? titularM[1]!.replace(/\s+/g, " ").trim() : "";
  const rutM =
    firstMatch(text, /c[eé]dula de identidad\s+([\d.]+-[\dkK])/i) ??
    firstMatch(text, /\b(\d{1,2}\.\d{3}\.\d{3}-[\dkK])\b/);
  const rut = rutM ? rutM[1]! : "";

  // ── Comuna ──────────────────────────────────────────────────────────────────
  const comunaM = firstMatch(text, /comuna de\s+([A-ZÑÁÉÍÓÚ][A-ZÑÁÉÍÓÚ]+)/i);
  const comuna = comunaM ? comunaM[1]!.trim() : "";

  // ── Unidad / departamento / condominio ──────────────────────────────────────
  const unidadM = firstMatch(text, /UNIDAD[\s\S]{0,40}?\((\d+)\)/i);
  const unidad = unidadM ? unidadM[1]! : "";
  const deptoM = firstMatch(text, /DEPARTAMENTO\s+[\s\S]{0,40}?\(([A-Z]\s?\d+)\)/i);
  const departamento = deptoM ? deptoM[1]!.replace(/\s+/g, " ").trim() : "";
  const condoM = firstMatch(
    text,
    /Condominio\s+([A-ZÑÁÉÍÓÚ][A-ZÑÁÉÍÓÚ ]+?)(?:,|\bconstruido|\bubicado)/i,
  );
  const condominio = condoM ? condoM[1]!.replace(/\s+/g, " ").trim() : "";

  const descParts: string[] = [];
  if (departamento) descParts.push(`Departamento ${departamento}`);
  else if (unidad) descParts.push(`Unidad ${unidad}`);
  if (condominio) descParts.push(`Condominio ${condominio}`);
  const descripcion = descParts.join(", ");

  // ── Precio de compraventa (UF) ──────────────────────────────────────────────
  // 1) Forma dígitos "(2.559) Unidades de Fomento" cerca de "precio".
  const precioM = firstMatch(text, /precio[\s\S]{0,120}?\(([\d.,]+)\)\s*unidades?\s+de\s+fomento/i);
  let compraventaUf = precioM ? parseUf(precioM[1]!) : 0;
  // 2) Si el OCR mutiló los dígitos, intentar la forma DELETREADA antes de
  //    "Unidades de Fomento" (anclada a "precio"/"compraventa"). Si no, queda 0.
  if (compraventaUf === 0) {
    const spelledM = firstMatch(
      text,
      /(?:precio|compra\s*venta)[\s\S]{0,160}?([a-zñáéíóú][a-zñáéíóú\s]+?)\s+unidades?\s+de\s+fomento/i,
    );
    const spelled = spelledM ? parseSpanishCardinal(spelledM[1]!) : null;
    if (spelled != null) compraventaUf = spelled;
  }
  if (compraventaUf === 0) warnings.push("No se pudo leer el precio de compraventa en UF.");

  // ── Rol de avalúo ───────────────────────────────────────────────────────────
  const rolM = firstMatch(text, /rol\s+de\s+aval[uú]o\s+n[uú]mero\s+([\d]+\s*-\s*[\d]+)/i);
  const rolAvaluo = rolM ? rolM[1]!.replace(/\s+/g, "") : "";

  // ── Hipoteca ────────────────────────────────────────────────────────────────
  // En la inscripción REAL, los datos de la hipoteca están REPARTIDOS:
  //   (A) línea de gravámenes → acreedor real + inscripción (fojas/número/año):
  //       "5.- HIPOTECA : A fojas 2894 número 2352 del año 2024 en favor de <acreedor>."
  //   (B) párrafo de la escritura → el MONTO, que ANTECEDE a "constituyó HIPOTECA"
  //       y cuyo acreedor es anafórico ("en favor de dicha institución").
  //   (C) capa de texto antigua → encabezado "Registro de Hipotecas".
  // Detección por (A) | (B) | (C) — señales fuertes de hipoteca real. La anotación
  // marginal suelta ("HIPOTECA.") de un bundle sólo-Dominio NO califica.
  let hipoteca: InscripcionHipoteca | null = null;
  const gravamenM = firstMatch(
    text,
    /\d+\s*\.?-?\s*HIPOTECA\s*:?\s*A\s+fojas\s+(\d+)\s+n[uú]mero\s+(\d+)\s+del\s+a[ñn]o\s+(\d{4})\s+en\s+favor\s+de\s+([A-Za-zÑÁÉÍÓÚñáéíóú0-9.&\s]+?)\s*\./i,
  );
  const constIdx = text.search(/constituy[oó]\s+HIPOTECA/i);
  const tieneHeaderHip = tieneHipoteca; // "Registro de Hipotecas"

  if (gravamenM || constIdx >= 0 || tieneHeaderHip) {
    // Monto: del párrafo de la escritura (ventana alrededor de "constituyó
    // HIPOTECA", el monto puede ir ANTES o después). Forma con centavos
    // "(2.236,82)" → nunca toma la compraventa (cifra entera "(2.559)").
    let montoUf = 0;
    if (constIdx >= 0) {
      const deed = text.slice(Math.max(0, constIdx - 600), constIdx + 200);
      const m = firstMatch(deed, /\(([\d.]+,\d+)\)\s*unidades?\s+de\s+fomento/i);
      if (m) montoUf = parseUf(m[1]!);
    }
    // Camino capa-de-texto (header): acota al segmento del header.
    if (montoUf === 0 && tieneHeaderHip) {
      const seg = text.slice(text.search(/Registro de Hipotecas/i));
      const m = firstMatch(seg, /\(([\d.,]+)\)\s*unidades?\s+de\s+fomento/i);
      if (m) montoUf = parseUf(m[1]!);
    }

    // Acreedor: el de la línea de gravámenes (institución real). El "en favor de
    // dicha institución" de la escritura es anafórico → se descarta.
    let acreedor = gravamenM ? gravamenM[4]!.replace(/\s+/g, " ").trim() : "";
    if (!acreedor || /dicha\s+instituci/i.test(acreedor)) {
      const segForLender = tieneHeaderHip
        ? text.slice(text.search(/Registro de Hipotecas/i))
        : text;
      const fb = firstMatch(
        segForLender,
        /(COOPEUCH|BANCO\s+[A-ZÑÁÉÍÓÚ ]+?|CAJA\s+[A-ZÑÁÉÍÓÚ ]+?|MUTUARIA\s+[A-ZÑÁÉÍÓÚ ]+?)(?:,|\.|\bpor\b)/i,
      );
      acreedor = fb ? fb[1]!.replace(/\s+/g, " ").trim() : acreedor;
    }

    hipoteca = {
      acreedor,
      montoUf,
      fojas: gravamenM ? parseInt(gravamenM[1]!, 10) : null,
      numero: gravamenM ? parseInt(gravamenM[2]!, 10) : null,
      anio: gravamenM ? parseInt(gravamenM[3]!, 10) : null,
    };
    if (montoUf === 0) warnings.push("Hipoteca presente pero no se pudo leer el monto UF.");
  }

  // ── Prohibiciones ───────────────────────────────────────────────────────────
  const prohibiciones: string[] = [];
  if (tieneProhibicion || /PROHIBICION/i.test(text)) {
    for (const m of text.matchAll(/PROHIBICION[.\s]+(\d+\s*-\s*\d+\s*-\s*\d{4})/gi)) {
      prohibiciones.push(m[1]!.replace(/\s+/g, ""));
    }
  }

  // ── Fecha de inscripción ────────────────────────────────────────────────────
  let fechaInscripcion: Date | null = null;
  const fechaM =
    firstMatch(text, /Concepci[oó]n,\s+(\d{1,2})\s+de\s+([a-záéíóú]+)\s+de\s+(\d{4})/i) ??
    firstMatch(text, /(\d{1,2})\s+de\s+([a-záéíóú]+)\s+de(?:l a[ñn]o[^()]*)?\s*\((\d{4})\)/i);
  if (fechaM) {
    const mes = MESES[fechaM[2]!.toLowerCase()];
    if (mes)
      fechaInscripcion = new Date(
        parseInt(fechaM[3]!, 10),
        mes - 1,
        parseInt(fechaM[1]!, 10),
        12,
        0,
        0,
        0,
      );
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
    documentos: {
      dominio: tieneDominio,
      hipoteca: hipoteca != null,
      prohibicion: tieneProhibicion,
    },
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
  // Null-safe ante un result parcial/hueco (OCR ruidoso): nunca debe lanzar
  // (este era el crash "reading 'referencia'" cuando dominio venía undefined).
  const compraventaUf = result.compraventaUf ?? 0;
  const hipotecaUf = result.hipoteca?.montoUf ?? null;
  const referencia = result.dominio?.referencia ?? "";
  const rolAvaluo = result.rolAvaluo ?? "";

  // Costo de adquisición → sólo si hay compraventa legible (>0); si el OCR no la
  // rescató, queda null (NO 0) y aun así se arma el prefill con la hipoteca.
  const acquisitionCostClp =
    haveEscritura && compraventaUf > 0 ? Math.round(compraventaUf * escrituraUfRate) : null;
  // Hipoteca → UF a la fecha de escritura. Independiente de la compraventa.
  const lienAmountClp =
    haveEscritura && hipotecaUf != null && hipotecaUf > 0
      ? Math.round(hipotecaUf * escrituraUfRate)
      : null;
  // Valor estimado actual (opcional) → UF de hoy.
  const estimatedValueClp =
    haveCurrent && compraventaUf > 0 ? Math.round(compraventaUf * currentUfRate) : null;

  const notesParts: string[] = [];
  if (referencia) notesParts.push(`Dominio ${referencia}`);
  if (rolAvaluo) notesParts.push(`Rol ${rolAvaluo}`);
  if (result.comuna) notesParts.push(`Comuna ${result.comuna}`);
  if (compraventaUf > 0) notesParts.push(`Compraventa ${compraventaUf} UF`);
  if (result.hipoteca)
    notesParts.push(`Hipoteca ${result.hipoteca.acreedor} ${result.hipoteca.montoUf} UF`);

  return {
    type: "property",
    name: result.descripcion || "Propiedad",
    acquisitionCostClp,
    estimatedValueClp,
    // tiene_garantia = true si se detectó una hipoteca (header o "en favor de").
    hasLien: result.hipoteca != null,
    lienAmountClp,
    notes: notesParts.join(" · "),
    fxPending: !haveEscritura,
    source: {
      compraventaUf,
      hipotecaUf,
      escrituraUfRate: haveEscritura ? escrituraUfRate : null,
      currentUfRate: haveCurrent ? currentUfRate : null,
      escrituraDate: result.fechaInscripcion
        ? result.fechaInscripcion.toISOString().slice(0, 10)
        : null,
      dominio: referencia,
      rolAvaluo,
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
  const ufFn = getUf ?? (await import("../services/indicators.js")).getUf;
  // Costo a la fecha de escritura (NO hoy). Sin fecha → no se puede fechar el costo.
  const escrituraUfRate = result.fechaInscripcion ? await ufFn(result.fechaInscripcion) : null;
  const currentUfRate = await ufFn(new Date());
  return buildAssetPrefill(result, escrituraUfRate, currentUfRate);
}

// ──────────────────────────────────────────────────────────────────────────────
// Extracción desde buffer con fallback OCR (copias autorizadas escaneadas)
// ──────────────────────────────────────────────────────────────────────────────

/** Mínimo de texto útil para considerar legible una inscripción. */
const MIN_TEXT_LEN = 200;

export const MANUAL_FALLBACK_MSG =
  "No pudimos leer el PDF escaneado. Ingresa los datos de la propiedad manualmente.";

export interface InscripcionExtractionOutcome {
  ok: boolean;
  result?: InscripcionResult;
  usedOcr: boolean;
  /** true si no se pudo leer → el formulario debe pedir ingreso manual. */
  manualFallback: boolean;
  /**
   * true SÓLO con `skipOcr`: la capa de texto no alcanzó y se necesita OCR (lento).
   * El endpoint lo usa para encolar un job async en vez de correr OCR en el request.
   */
  needsOcr?: boolean;
  message?: string;
}

/**
 * Extrae una inscripción desde el BUFFER del PDF, con fallback a OCR cuando la
 * capa de texto está vacía/escasa (copias autorizadas del CBR suelen ser
 * imágenes). Nunca lanza: si OCR no está disponible o el texto es ilegible,
 * devuelve manualFallback=true con un mensaje claro (no un 500).
 *
 * `deps` inyectable para tests (sin red, sin OCR real).
 */
export async function extractInscripcionFromBuffer(
  buffer: Buffer,
  deps?: {
    extractText?: (b: Buffer) => Promise<string>;
    ocr?: (b: Buffer) => Promise<string>;
    /**
     * No correr OCR (fast-path sincrónico). Si la capa de texto no alcanza,
     * devuelve { needsOcr: true } para que el caller encole un job async.
     * NO cambia la lógica de OCR — sólo decide CUÁNDO se ejecuta.
     */
    skipOcr?: boolean;
  },
): Promise<InscripcionExtractionOutcome> {
  const extractText =
    deps?.extractText ??
    (async (b: Buffer) => {
      const { extractPdfText } = await import("../services/documents/pdfAnalysis.js");
      const r = await extractPdfText(b);
      return r.text ?? "";
    });

  let text = "";
  try {
    text = await extractText(buffer);
  } catch (e) {
    logger.warn({ err: e }, "inscripcion: text-layer extraction failed");
    text = "";
  }

  let usedOcr = false;
  if (text.trim().length < MIN_TEXT_LEN) {
    // Fast-path: si nos pidieron NO correr OCR, señalar que se necesita (el caller
    // encola un job async). No tocamos la capa de OCR; sólo no la disparamos aquí.
    if (deps?.skipOcr) {
      return { ok: false, usedOcr: false, manualFallback: false, needsOcr: true };
    }
    // Capa de texto insuficiente → PDF escaneado: intentar OCR (best-effort).
    try {
      const ocr =
        deps?.ocr ??
        (async (b: Buffer) => {
          const { performOcrOnFullPdf } = await import("../services/documents/ocrService.js");
          const r = await performOcrOnFullPdf(b);
          return r.text ?? "";
        });
      const ocrText = await ocr(buffer);
      if (ocrText.trim().length > text.trim().length) {
        text = ocrText;
        usedOcr = true;
      }
    } catch (e) {
      // OCR no instalado/fallido → fallback manual, sin romper el flujo del activo.
      logger.warn({ err: e }, "inscripcion: OCR fallback unavailable/failed");
    }
  }

  if (text.trim().length < MIN_TEXT_LEN) {
    return { ok: false, usedOcr, manualFallback: true, message: MANUAL_FALLBACK_MSG };
  }

  // Red de seguridad: NUNCA propagar (el endpoint /extract-inscripcion no debe 500).
  try {
    const result = extractInscripcion(text);
    // Manual sólo si NO hay NINGÚN campo útil (OCR basura). Si hay hipoteca o rol
    // aunque falte la compraventa, se devuelve el resultado PARCIAL (el prefill se
    // arma igual; la compraventa mutilada no debe botar toda la extracción).
    const hasUsableField =
      result.dominio.fojas != null ||
      result.compraventaUf > 0 ||
      result.hipoteca != null ||
      result.rolAvaluo !== "";
    if (!hasUsableField) {
      return { ok: false, usedOcr, manualFallback: true, message: MANUAL_FALLBACK_MSG };
    }
    return { ok: true, result, usedOcr, manualFallback: false };
  } catch (e) {
    logger.warn({ err: e }, "inscripcion: extraction failed on extracted text");
    return { ok: false, usedOcr, manualFallback: true, message: MANUAL_FALLBACK_MSG };
  }
}
