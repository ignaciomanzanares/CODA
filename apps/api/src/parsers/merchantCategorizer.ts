/**
 * Motor de categorización de comercios chilenos (Batch 10).
 *
 * Transparente y auditable (CMF NCG 502 — trazabilidad algorítmica): cada
 * categorización registra QUÉ regla la produjo (`ruleId`) y la versión del motor
 * (`CATEGORIZER_VERSION`), de modo que toda decisión sea explicable. No se inventan
 * categorías: lo desconocido permanece "Otro" con baja confianza.
 *
 * Dos etapas:
 *   1. normalizeMerchant(raw) — limpia glosas ruidosas/pegadas de las cartolas
 *      reales (prefijos de procesadores de pago, país/ciudad pegados, ruido de
 *      sucursal, números de local) → forma canónica MAYÚSCULA sin acentos.
 *   2. categorize(tx) — diccionario/regex determinista → { category, subcategory,
 *      confidence, ruleId, essential, recurring }.
 */

// ──────────────────────────────────────────────────────────────────────────────
// Etapa 1 — Normalización de comercio
// ──────────────────────────────────────────────────────────────────────────────

/** Quita acentos/diacríticos y pasa a MAYÚSCULAS. */
function foldAccentsUpper(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();
}

/**
 * Prefijos de procesadores de pago que anteceden al comercio real.
 * En las cartolas aparecen pegados con `*` o espacio: `PAYU *UBER TRIP`,
 * `MERPAGO*SPOTIFY`, `SumUp *CAFE`, `DLO*NETFLIX`.
 */
const PROCESSOR_PREFIX_RE =
  /^(?:PAYU|MERPAGO|MERCADO\s?PAGO|MPAGO|MP|SUMUP|SUM\s?UP|KUSHKI|DLOCAL|DLO|EBANX|PAYPAL|PP|PAYGOL|FLOW|KHIPU|GETNET|TRANSBANK|TBK|REDPAY|TOKU|FINTOC)\s*\*+\s*/;

/**
 * Tokens de país (2 letras) y de moneda que las filas internacionales arrastran
 * pegados al final: `LATAM.COM EUR LA`, `OPENAI *CHATGPT SUBSCR IR`.
 */
const TRAILING_CURRENCY_RE = /\s+(?:EUR|USD|US\$|CLP|GBP|BRL|ARS|PEN|MXN|UF)\b/g;
const COUNTRY_CODES = new Set([
  "LA", "IR", "US", "DE", "CL", "AR", "BR", "PE", "MX", "ES", "GB",
  "FR", "IT", "NL", "CA", "UY", "CO", "PA", "SG", "IE", "LU",
]);

/** Ruido de sucursal/ubicación: `PROV BILBAO`, `SUC PROVIDENCIA`, `LOCAL 12`. */
const BRANCH_NOISE_RE =
  /\s+(?:PROV|SUC|SUCURSAL|LOCAL|MALL|STRIP\s?CENTER|PLAZA)\b.*$/;

/** Abreviaciones frecuentes en glosas chilenas. */
const ABBREVIATIONS: Array<[RegExp, string]> = [
  [/\bSTA\b/g, "SANTA"],
  [/\bSTO\b/g, "SANTO"],
  [/\bSN\b/g, "SAN"],
  [/\bAV\b/g, "AVENIDA"],
];

/**
 * Normaliza la glosa cruda de una transacción a una forma canónica estable.
 * Idempotente y sin acentos: `STA ISABEL PROV BILBAO` → `SANTA ISABEL`.
 */
export function normalizeMerchant(raw: string): string {
  if (!raw) return "";

  let s = foldAccentsUpper(raw);

  // 1. Colapsar espacios temprano para que los anclajes funcionen.
  s = s.replace(/\s+/g, " ").trim();

  // 2. Quitar prefijo de procesador de pago (puede haber más de uno encadenado).
  let prev: string;
  do {
    prev = s;
    s = s.replace(PROCESSOR_PREFIX_RE, "").trim();
  } while (s !== prev);

  // 3. El `*` separa procesador/comercio/producto; tratarlo como espacio.
  s = s.replace(/\*+/g, " ");

  // 4. Quitar moneda arrastrada (EUR/USD/…) en filas internacionales.
  s = s.replace(TRAILING_CURRENCY_RE, " ");

  // 5. Quitar ruido de sucursal/ubicación.
  s = s.replace(BRANCH_NOISE_RE, " ");

  // 6. Quitar números de local/serie largos (3+ dígitos) — no identifican comercio.
  s = s.replace(/\b\d{3,}\b/g, " ");

  // 7. Expandir abreviaciones.
  for (const [re, full] of ABBREVIATIONS) s = s.replace(re, full);

  // 8. Colapsar de nuevo y quitar código de país de 2 letras al final.
  s = s.replace(/\s+/g, " ").trim();
  const tokens = s.split(" ");
  while (tokens.length > 1) {
    const last = tokens[tokens.length - 1]!;
    if (last.length === 2 && COUNTRY_CODES.has(last)) {
      tokens.pop();
    } else {
      break;
    }
  }
  s = tokens.join(" ").trim();

  // 9. Limpiar puntuación de borde residual.
  s = s.replace(/^[*\-.,\s]+|[*\-.,\s]+$/g, "").trim();

  return s;
}

// ──────────────────────────────────────────────────────────────────────────────
// Etapa 2 — Taxonomía + motor de reglas
// ──────────────────────────────────────────────────────────────────────────────

/** Versión del motor — se registra en cada categorización (NCG 502). */
export const CATEGORIZER_VERSION = "batch10.v2";

export type CategoryLabel =
  | "Vivienda"
  | "Servicios básicos"
  | "Supermercado y almacén"
  | "Combustible"
  | "Transporte"
  | "Salud y farmacia"
  | "Restaurantes y delivery"
  | "Suscripciones y software"
  | "Entretenimiento"
  | "Retail y compras"
  | "Viajes"
  | "Educación"
  | "Seguros"
  | "Impuestos y servicios públicos"
  | "Comisiones bancarias"
  | "Inversión y divisas"
  | "Transferencias"
  | "Transferencia interna"
  | "Ingresos"
  | "Otro";

interface CategoryMeta {
  essential: boolean;
  variability: "fixed" | "variable";
  /** Excluido del gasto (no es consumo): transferencias internas, ingresos. */
  excluded: boolean;
  /** Slug heredado para retro-compatibilidad con el score existente. */
  legacy: string;
}

/**
 * Taxonomía: cada categoría etiquetada esencial|discrecional y fija|variable.
 * `legacy` mapea al slug `TransactionCategory` que el score aún consume.
 */
export const TAXONOMY: Record<CategoryLabel, CategoryMeta> = {
  "Vivienda": { essential: true, variability: "fixed", excluded: false, legacy: "vivienda" },
  "Servicios básicos": { essential: true, variability: "fixed", excluded: false, legacy: "servicios_basicos" },
  "Supermercado y almacén": { essential: true, variability: "variable", excluded: false, legacy: "alimentacion" },
  "Combustible": { essential: true, variability: "variable", excluded: false, legacy: "transporte" },
  "Transporte": { essential: true, variability: "variable", excluded: false, legacy: "transporte" },
  "Salud y farmacia": { essential: true, variability: "variable", excluded: false, legacy: "salud" },
  "Restaurantes y delivery": { essential: false, variability: "variable", excluded: false, legacy: "restaurantes" },
  "Suscripciones y software": { essential: false, variability: "fixed", excluded: false, legacy: "suscripciones" },
  "Entretenimiento": { essential: false, variability: "variable", excluded: false, legacy: "entretenimiento" },
  "Retail y compras": { essential: false, variability: "variable", excluded: false, legacy: "comercio" },
  "Viajes": { essential: false, variability: "variable", excluded: false, legacy: "transporte" },
  "Educación": { essential: true, variability: "fixed", excluded: false, legacy: "educacion" },
  "Seguros": { essential: true, variability: "fixed", excluded: false, legacy: "seguros" },
  "Impuestos y servicios públicos": { essential: true, variability: "variable", excluded: false, legacy: "servicios" },
  "Comisiones bancarias": { essential: true, variability: "variable", excluded: false, legacy: "deudas" },
  "Inversión y divisas": { essential: false, variability: "variable", excluded: false, legacy: "inversiones" },
  "Transferencias": { essential: false, variability: "variable", excluded: false, legacy: "transferencia_enviada" },
  "Transferencia interna": { essential: false, variability: "variable", excluded: true, legacy: "otro" },
  "Ingresos": { essential: false, variability: "variable", excluded: true, legacy: "ingreso_principal" },
  "Otro": { essential: false, variability: "variable", excluded: false, legacy: "otro" },
};

export interface CategorizeInput {
  descripcion: string;
  monto?: number;
  tipo?: "cargo" | "abono";
  /** El llamador ya determinó que es un traspaso entre cuentas propias. */
  internalTransfer?: boolean;
}

export interface CategorizationResult {
  category: CategoryLabel;
  subcategory?: string;
  /** 0..1 — baja confianza para lo ambiguo; nunca se inventa una categoría. */
  confidence: number;
  /** Regla que decidió la categoría (auditable, NCG 502). */
  ruleId: string;
  version: string;
  essential: boolean;
  recurring: boolean;
  /** Excluido del gasto (transferencia interna / ingreso). */
  excluded: boolean;
  variability: "fixed" | "variable";
}

interface Rule {
  id: string;
  category: CategoryLabel;
  re: RegExp;
  /** Patrón que NO debe estar presente (p. ej. UBER pero no UBER EATS). */
  not?: RegExp;
  subcategory?: string;
  confidence: number;
  recurring?: boolean;
}

/**
 * Reglas en orden de prioridad (primera coincidencia gana).
 * Las reglas más específicas (banco, transferencias internas, vivienda) van antes
 * que las genéricas. Nunca se almacena el nombre de la contraparte de una
 * transferencia: sólo se hace match del PATRÓN (PII de terceros).
 */
const RULES: Rule[] = [
  // ── Vivienda (antes que transferencias: "Transf a Condominio") ─────────────
  { id: "cl.vivienda.condominio", category: "Vivienda", re: /\bCONDOMINIO\b|GASTOS?\s+COMUN/, subcategory: "Gastos comunes", confidence: 0.9, recurring: true },
  { id: "cl.vivienda.coopeuch", category: "Vivienda", re: /\bCOOPEUCH\b/, subcategory: "Dividendo hipotecario", confidence: 0.9, recurring: true },
  { id: "cl.vivienda.dividendo", category: "Vivienda", re: /\bDIVIDENDO\b|HIPOTECARIO|\bMUTUARIA\b/, subcategory: "Dividendo hipotecario", confidence: 0.92, recurring: true },
  { id: "cl.vivienda.arriendo", category: "Vivienda", re: /\bARRIENDO\b|ARRENDAMIENTO/, subcategory: "Arriendo", confidence: 0.9, recurring: true },

  // ── Impuestos y servicios públicos ────────────────────────────────────────
  { id: "cl.impuestos.tgr", category: "Impuestos y servicios públicos", re: /\bT\.?G\.?R\b|TESORERIA|\bS\.?I\.?I\b|PREVIRED|CONTRIBUCIONES|PERMISO\s+DE?\s*CIRCULACION|REGISTRO\s+CIVIL|\bMUNICIPALIDAD\b|PATENTE\s+(COMERCIAL|MUNICIPAL)/, confidence: 0.9 },

  // ── Comisiones bancarias ──────────────────────────────────────────────────
  { id: "bank.comisiones", category: "Comisiones bancarias", re: /COM\.?\s?MANT|COMISION|MANTENCION\s+(DE\s+)?CUENTA|GASTO\s+BANCARIO|CARGO\s+POR\s+MANTEN|IMP\.?\s?TIMBRES|\bCAE\b/, confidence: 0.9 },

  // ── Seguros ───────────────────────────────────────────────────────────────
  { id: "cl.seguros", category: "Seguros", re: /\bSEGURO\b|\bPOLIZA\b|\bPRIMA\b|PAC\s+SEG|\bSEG\.?\s+FRAUDE\b|\bMAPFRE\b|\bSURA\b|\bMETLIFE\b|\bHDI\b|CONSORCIO|BICE\s+VIDA|CHILENA\s+CONSOLIDADA|\bZURICH\b|BCI\s+SEGUROS/, confidence: 0.88, recurring: true },

  // ── Inversión y divisas ───────────────────────────────────────────────────
  { id: "cl.inversion.divisas", category: "Inversión y divisas", re: /\bAFEX\b|AGENTES?\s+DE\s+VAL|\bDIVISA(S)?\b|FONDO\s+MUTUO|\bFINTUAL\b|\bRACIONAL\b|CORREDORA\s+DE\s+BOLSA|CASA\s+DE\s+CAMBIO|\bAFP\b|\bAPV\b|DEP[O]?SITO\s+A\s+PLAZO|\bDAP\b/, confidence: 0.88 },

  // ── Suscripciones y software ──────────────────────────────────────────────
  { id: "cl.suscripciones", category: "Suscripciones y software", re: /NETFLIX|SPOTIFY|OPENAI|CHATGPT|ANTHROPIC|CLAUDE|\bHBO\b|DISNEY|PARAMOUNT|STAR\+|YOUTUBE\s*PREMIUM|AMAZON\s+PRIME|PRIME\s+VIDEO|\bAMZN\b|\bAMAZON\b|APPLE\.COM|ITUNES|ICLOUD|APPLE\s+MUSIC|\bADOBE\b|\bNOTION\b|\bCANVA\b|MICROSOFT|OFFICE\s?365|\bGITHUB\b|\bGOOGLE\b|DROPBOX|\bLINKEDIN\b|SUSCRIPCION|SUBSCRIPTION|\bSUBSCR\b|MEMBERSHIP|MEMBRESIA|\bPATREON\b/, confidence: 0.9, recurring: true },

  // ── Entretenimiento ───────────────────────────────────────────────────────
  { id: "cl.entretenimiento", category: "Entretenimiento", re: /PLAY\s?STATION|\bXBOX\b|NINTENDO|\bSTEAM\b|EPIC\s+GAMES|\bRIOT\b|\bTWITCH\b|CINEMARK|CINE\s?HOYTS|\bHOYTS\b|CINEPOLIS|\bCINE\b|\bTEATRO\b|CONCIERTO|\bGYM\b|GIMNASIO|SMART\s?FIT|\bPASS\s?LINE\b|PUNTO\s?TICKET|TICKETMASTER/, confidence: 0.88 },

  // ── Combustible ───────────────────────────────────────────────────────────
  { id: "cl.combustible", category: "Combustible", re: /\bCOPEC\b|\bSHELL\b|\bESMAX\b|PETROBRAS|\bARAMCO\b|\bENEX\b|\bTERPEL\b|PETRONOR|\bBENCINA\b|COMBUSTIBLE|\bGASOLINA\b|\bDIESEL\b|FULL\s+COPEC/, confidence: 0.92 },

  // ── Restaurantes — delivery (antes que Transporte por UBER EATS/DIDI FOOD) ─
  { id: "cl.restaurantes.delivery", category: "Restaurantes y delivery", re: /UBER\s*EATS|DIDI\s*FOOD|\bRAPPI\b|PEDIDOS\s?YA|\bIFOOD\b|JUST\s+EAT/, subcategory: "Delivery", confidence: 0.9 },

  // ── Transporte ────────────────────────────────────────────────────────────
  { id: "cl.transporte", category: "Transporte", re: /\bUBER\b|\bCABIFY\b|\bDIDI\b|\bBEAT\b|\bLIME\b|\bBIP\b|TRANSANTIAGO|RED\s+MOVILIDAD|METRO\s+DE\b|\bPASAJE\b|AUTOPISTA|\bTAG\b|\bPEAJE\b|ESTACIONAMIENTO|\bPARKING\b|\bTAXI\b|VESPUCIO|COSTANERA\s+NORTE/, not: /UBER\s*EATS|DIDI\s*FOOD/, confidence: 0.88 },
  { id: "cl.transporte.aereo", category: "Transporte", re: /\bLATAM\b|SKY\s?AIRLINE|\bJETSMART\b|JET\s+SMART|AEROLINEA|\bVUELO\b|AEROPUERTO/, confidence: 0.88 },

  // ── Restaurantes — locales ────────────────────────────────────────────────
  { id: "cl.restaurantes", category: "Restaurantes y delivery", re: /MC\s?DONALD|BURGER\s+KING|\bKFC\b|\bSUBWAY\b|\bPIZZA\b|\bSUSHI\b|STARBUCKS|JUAN\s+VALDEZ|\bVIPS\b|RESTAURANT|RESTOBAR|\bCAFE\b|CAFETERIA|\bBAR\b|EMPANAD|PANADERIA|PASTELERIA/, confidence: 0.82 },

  // ── Salud y farmacia ──────────────────────────────────────────────────────
  { id: "cl.salud", category: "Salud y farmacia", re: /CRUZ\s+VERDE|SALCO\s?BRAND|\bFARMACIA(S)?\b|\bAHUMADA\b|DR\.?\s?SIMI|\bFONASA\b|\bISAPRE\b|BANMEDICA|CONSALUD|\bCOLMENA\b|\bCLINICA\b|HOSPITAL|\bDENTAL\b|DENTISTA|\bMEDIC|\bOPTICA\b/, confidence: 0.88 },

  // ── Supermercado y almacén (sólo cadenas con nombre — evita falsos positivos)
  { id: "cl.supermercado", category: "Supermercado y almacén", re: /\bJUMBO\b|\bLIDER\b|SANTA\s+ISABEL|\bUNIMARC\b|\bTOTTUS\b|\bACUENTA\b|\bEKONO\b|\bSUPERMERCADO\b|\bMAYORISTA\b/, confidence: 0.92 },

  // ── Servicios básicos (luz/agua/gas/internet/telefonía) ───────────────────
  { id: "cl.servicios_basicos", category: "Servicios básicos", re: /\bENEL\b|\bCGE\b|CHILECTRA|\bSAESA\b|FRONTEL|CONAFE|AGUAS\s+ANDINAS|\bESVAL\b|\bESSBIO\b|AGUAS\s+DEL\s+VALLE|\bAGUAS\b|METROGAS|LIPIGAS|ABASTIBLE|\bGASCO\b|GAS\s+NATURAL|MOVISTAR|\bENTEL\b|\bWOM\b|\bVTR\b|\bCLARO\b|\bGTD\b|MUNDO\s+PACIFICO|INTERNET\s+HOGAR|FIBRA\s+OPTICA/, confidence: 0.9, recurring: true },

  // ── Viajes ────────────────────────────────────────────────────────────────
  { id: "cl.viajes", category: "Viajes", re: /\bBOOKING\b|DESPEGAR|\bAIRBNB\b|TRIP\.COM|\bHOTEL\b|\bEXPEDIA\b|\bKAYAK\b/, confidence: 0.85 },

  // ── Educación ─────────────────────────────────────────────────────────────
  { id: "cl.educacion", category: "Educación", re: /UNIVERSIDAD|\bCOLEGIO\b|\bLICEO\b|\bDUOC\b|\bINACAP\b|\bCFT\b|PREUNIVERSITARIO|MATRICULA|\bARANCEL\b|JARDIN\s+INFANTIL|INSTITUTO\s+PROF|PONTIFICIA|\bESCUELA\b/, confidence: 0.88, recurring: true },

  // ── Retail y compras ──────────────────────────────────────────────────────
  { id: "cl.retail", category: "Retail y compras", re: /FALABELLA|\bPARIS\b|\bRIPLEY\b|LA\s+POLAR|\bHITES\b|ABC\s?DIN|SODIMAC|\bEASY\b|HOMECENTER|\bIKEA\b|MERCADO\s?LIBRE|ALIEXPRESS|\bSHEIN\b|\bAMAZON\b|\bEBAY\b|\bSHOPEE\b|CASAIDEAS|\bTIENDA\b/, confidence: 0.8 },

  // ── Transferencias a terceros (PATRÓN — nunca el nombre de la contraparte) ─
  { id: "transfer.tercero", category: "Transferencias", re: /\bTRANSF(?:ERENCIA)?\.?\s+A\b|\bTRANSF(?:ERENCIA)?\.?\s+DE\b|\bTEF\b|\bTRASPASO\s+A\b|\bGIRO\s+A\b/, confidence: 0.78 },
];

/**
 * Traspasos/pagos entre PRODUCTOS PROPIOS (excluidos del gasto Y del ingreso):
 *  - MONTO CANCELADO                → pago de la tarjeta (estado de cuenta TC).
 *  - (ABONO|COMPRA|EGRESO|…) DE DIVISAS → plomería de divisas de la TC USD.
 *  - … A T. CRÉDITO / PAGO … T. CRÉDITO → fondeo/pago de TC propia desde la CC.
 *  - TRASPASO DEUDA NACIONAL/INTERNACIONAL → consolidación de deuda TC USD.
 *  - TRASPASO … (T. crédito|cta cte|cuenta vista|línea de crédito|ahorro).
 * Se evalúa con MÁXIMA prioridad en categorize() (antes que ingreso/gasto). NO
 * incluye transferencias a TERCEROS ("Transf a <persona>"): esos patrones son
 * específicos y nunca calzan el de tercero, que se mantiene como gasto/ingreso.
 */
const INTERNAL_TRANSFER_RE =
  /\bMONTO\s+CANCELADO\b|(?:ABONO|INGRESO|EGRESO|COMPRA|TRASPASO)\s+(?:POR\s+\w+\s+)?DE\s+DIVISAS\b|\bA\s+T\.?\s*CREDITO\b|\bPAGO\s+(?:DE\s+)?(?:TARJETA\s+(?:DE\s+)?)?T\.?\s*CREDITO\b|\bTRASPASO\s+DEUDA\s+(?:NACIONAL|INTERNACIONAL)\b|\bTRASPASO\b.*\b(T\.?\s*CREDITO|TARJETA\s+CREDITO|CUENTA\s+CORRIENTE|CTA\.?\s*CTE|CUENTA\s+VISTA|LINEA\s+(DE\s+)?CREDITO|AHORRO)\b/;

/**
 * ¿La glosa es un traspaso entre productos propios (transferencia interna)?
 * Fuente única de la detección por glosa — la reusan la ingesta (persistencia),
 * el backfill y el predicado consolidado de exclusión (assistantContext).
 */
export function isInternalTransferDesc(descripcion: string): boolean {
  return INTERNAL_TRANSFER_RE.test(normalizeMerchant(descripcion));
}

/** Detecta ingresos (sólo abonos con glosa de remuneración). */
const INCOME_RE =
  /REMUNERACION|\bSUELDO\b|LIQUIDACION|HONORARIO|PAGO\s+SUELDO|\bFINIQUITO\b|\bGRATIFICACION\b|\bAGUINALDO\b|ABONO\s+REMUN/;

function build(
  category: CategoryLabel,
  ruleId: string,
  confidence: number,
  opts: { subcategory?: string; recurring?: boolean } = {}
): CategorizationResult {
  const meta = TAXONOMY[category];
  return {
    category,
    subcategory: opts.subcategory,
    confidence,
    ruleId,
    version: CATEGORIZER_VERSION,
    essential: meta.essential,
    recurring: opts.recurring ?? meta.variability === "fixed",
    excluded: meta.excluded,
    variability: meta.variability,
  };
}

/**
 * Categoriza una transacción de forma determinista y auditable.
 * Lo desconocido permanece "Otro" con baja confianza — nunca se inventa.
 */
export function categorize(input: CategorizeInput): CategorizationResult {
  const haystack = normalizeMerchant(input.descripcion);

  // 1. Transferencia interna (excluida del gasto, no se re-clasifica).
  if (input.internalTransfer || INTERNAL_TRANSFER_RE.test(haystack)) {
    return build("Transferencia interna", "transfer.interna", 0.95);
  }

  // 2. Reglas en orden de prioridad.
  for (const rule of RULES) {
    if (rule.re.test(haystack) && !(rule.not && rule.not.test(haystack))) {
      return build(rule.category, rule.id, rule.confidence, {
        subcategory: rule.subcategory,
        recurring: rule.recurring,
      });
    }
  }

  // 3. Ingresos (sólo abonos con glosa explícita de remuneración).
  if (input.tipo === "abono" && INCOME_RE.test(haystack)) {
    return build("Ingresos", "income.remuneracion", 0.85);
  }

  // 4. Desconocido → Otro con baja confianza (no se fuerza).
  return build("Otro", "fallback.otro", 0.2);
}
