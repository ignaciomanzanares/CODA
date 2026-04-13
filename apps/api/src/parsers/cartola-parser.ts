/**
 * Parser de cartolas bancarias chilenas (PDF → CartolaParseResult).
 * Extracción: pdf-parse (primario); si el texto es insuficiente, extractPdfText (pdfjs) como respaldo.
 * Parsing de movimientos: reutiliza parseCartolaPdf (pdfAnalysis) sobre el texto unificado.
 */

import pdfParse from "pdf-parse";
import {
  extractPdfText,
  parseCartolaPdf,
  type CartolaExtraida,
} from "../services/documents/pdfAnalysis.js";

export type TransactionCategory =
  | "educacion"
  | "alimentacion"
  | "transporte"
  | "telecomunicaciones"
  | "transferencia_enviada"
  | "transferencia_recibida"
  | "comercio"
  | "entretenimiento"
  | "salud"
  | "ingreso_principal"
  | "otro";

export interface CartolaParseResult {
  banco: string;
  titular: string;
  cuenta: string;
  periodo: {
    desde: Date;
    hasta: Date;
    dias: number;
  };
  saldo_inicial: number;
  saldo_final: number;
  total_cargos: number;
  total_abonos: number;
  transacciones: Array<{
    fecha: Date;
    descripcion: string;
    tipo: "cargo" | "abono";
    monto: number;
    saldo_despues: number;
    categoria: TransactionCategory;
    es_transferencia: boolean;
    es_compra: boolean;
    es_pago_recurrente: boolean;
  }>;
  saldos_diarios: Array<{ fecha: Date; saldo: number }>;
}

const CUENTA_RE = /\b\d+-\d+-\d+-\d+-\d+\b/;

function parseChileAmount(str: string): number {
  const cleaned = str.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

/** Detecta banco por marcas típicas en el PDF. */
export function detectBankFromText(text: string): string {
  const t = text.toUpperCase();
  if (/SANTANDER|BANCO\s+SANTANDER/.test(t)) return "Santander";
  if (/\bBCI\b|BANCO\s+DE\s+CR[ÉE]DITO\s+E\s+INVERSIONES/.test(t)) return "BCI";
  if (/BANCO\s+DE\s+CHILE|EDWARDS|CITI/.test(t)) return "Banco de Chile";
  if (/SCOTIABANK|SCOTIA/.test(t)) return "Scotiabank";
  if (/ITAU|IT[ÁA]U/.test(t)) return "Itaú";
  if (/BICE|BANCO\s+BICE/.test(t)) return "BICE";
  if (/SECURITY|BANCO\s+SECURITY/.test(t)) return "Security";
  return "Otro";
}

function extractTitular(text: string): string {
  const lines = text.split(/\n/).map((l) => l.trim());
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    if (/titular|nombre\s+del\s+cliente/i.test(l)) {
      const m = l.match(/:\s*(.+)$/);
      if (m) return m[1]!.trim().slice(0, 120);
    }
  }
  const nameLine = lines.find(
    (x) => /^[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s]{8,}/.test(x) && !/CARTOLA|CUENTA|BANCO|SANTANDER|CHILE/i.test(x)
  );
  if (nameLine) return nameLine.slice(0, 120);
  return "";
}

function extractCuenta(text: string): string {
  const m = text.match(CUENTA_RE);
  return m ? m[0]! : "";
}

function inferYearFromText(text: string): number {
  const nowYear = new Date().getFullYear();
  let year = nowYear;
  const hastaFull = text.match(/HASTA\s*(\d{2})\/(\d{2})\/(\d{4})/i);
  const desdeFull = text.match(/DESDE\s*(\d{2})\/(\d{2})\/(\d{4})/i);
  const alFull = text.match(/\bAL\s+(\d{2})\/(\d{2})\/(\d{4})/i);
  const periodoFull = text.match(
    /[Pp]er[ií]odo[:\s]+(?:\d{2}\/\d{2}\/\d{4}\s*[-–a]\s*)?(\d{2})\/(\d{2})\/(\d{4})/
  );
  for (const match of [hastaFull, desdeFull, alFull, periodoFull]) {
    if (!match) continue;
    const y = parseInt(match[3]!, 10);
    if (y >= 2015 && y <= nowYear + 1) {
      year = y;
      break;
    }
  }
  if (year === nowYear) {
    const hastaShort = text.match(/HASTA\s*(\d{2})\/(\d{2})\/(\d{2})\b/i);
    if (hastaShort) {
      const y = 2000 + parseInt(hastaShort[3]!, 10);
      if (y >= 2015 && y <= nowYear + 1) year = y;
    }
  }
  const monthYear = text.match(
    /(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+(202[0-9]|201[5-9])/i
  );
  if (monthYear) {
    const y = parseInt(monthYear[1]!, 10);
    if (y >= 2015 && y <= nowYear + 1) year = y;
  }
  return Math.min(nowYear + 1, Math.max(2015, year));
}

function extractPeriodo(text: string): { desde: Date; hasta: Date; dias: number } {
  const year = inferYearFromText(text);
  let desde: Date | null = null;
  let hasta: Date | null = null;

  const d1 = text.match(/DESDE\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/i);
  const d2 = text.match(/HASTA\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/i);
  const d3 = text.match(/\bAL\s+(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/i);

  function toDate(d: number, m: number, y: number): Date {
    return new Date(y, m - 1, d, 12, 0, 0, 0);
  }

  if (d1) {
    const dd = parseInt(d1[1]!, 10);
    const mm = parseInt(d1[2]!, 10);
    let y = year;
    if (d1[3]) {
      const yy = d1[3].length === 2 ? 2000 + parseInt(d1[3], 10) : parseInt(d1[3], 10);
      y = yy;
    }
    desde = toDate(dd, mm, y);
  }
  const hMatch = d2 || d3;
  if (hMatch) {
    const dd = parseInt(hMatch[1]!, 10);
    const mm = parseInt(hMatch[2]!, 10);
    let y = year;
    if (hMatch[3]) {
      const yy = hMatch[3].length === 2 ? 2000 + parseInt(hMatch[3], 10) : parseInt(hMatch[3], 10);
      y = yy;
    }
    hasta = toDate(dd, mm, y);
  }

  if (!desde && !hasta) {
    // Fallback: intentar extraer cualquier fecha DD/MM o DD/MM/YYYY del texto
    const anyDate = text.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
    if (anyDate) {
      const dd = parseInt(anyDate[1]!, 10);
      const mm = parseInt(anyDate[2]!, 10);
      const yy = anyDate[3]
        ? (anyDate[3].length === 2 ? 2000 + parseInt(anyDate[3], 10) : parseInt(anyDate[3], 10))
        : year;
      const mid = toDate(Math.min(28, dd), Math.min(12, mm), yy);
      desde = new Date(mid.getFullYear(), mid.getMonth(), 1, 12, 0, 0, 0);
      hasta = new Date(mid.getFullYear(), mid.getMonth() + 1, 0, 12, 0, 0, 0);
    } else {
      // Último recurso: mes actual
      const now = new Date();
      desde = new Date(now.getFullYear(), now.getMonth(), 1, 12, 0, 0, 0);
      hasta = new Date(now.getFullYear(), now.getMonth() + 1, 0, 12, 0, 0, 0);
    }
  } else if (!desde) {
    desde = new Date(hasta!.getFullYear(), hasta!.getMonth(), 1, 12, 0, 0, 0);
  } else if (!hasta) {
    hasta = new Date(desde.getFullYear(), desde.getMonth() + 1, 0, 12, 0, 0, 0);
  }

  const msPerDay = 86400000;
  const dias = Math.max(1, Math.round((hasta!.getTime() - desde!.getTime()) / msPerDay) + 1);
  return { desde: desde!, hasta: hasta!, dias };
}

/** Extrae saldos y totales del bloque tipo Santander (4 montos consecutivos). */
function extractResumenMontos(text: string): {
  saldo_inicial: number | null;
  total_cargos: number | null;
  total_abonos: number | null;
  saldo_final: number | null;
} {
  const saldoHeaderMatch = text.match(
    /Saldo\s+Inicial.*?Saldo\s+Final.*?([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)/is
  );
  if (saldoHeaderMatch) {
    return {
      saldo_inicial: parseChileAmount(saldoHeaderMatch[1]!),
      total_cargos: parseChileAmount(saldoHeaderMatch[2]!),
      total_abonos: parseChileAmount(saldoHeaderMatch[3]!),
      saldo_final: parseChileAmount(saldoHeaderMatch[4]!),
    };
  }
  return {
    saldo_inicial: null,
    total_cargos: null,
    total_abonos: null,
    saldo_final: null,
  };
}

function normalizeDescKey(d: string): string {
  return d
    .toUpperCase()
    .replace(/\s+/g, " ")
    .replace(/\d{6,}/g, "")
    .trim();
}

/**
 * Motor de categorización para cartolas chilenas.
 * Prioridad: transferencias → ingresos → educación → salud →
 * alimentación → supermercado → transporte → telecomunicaciones →
 * entretenimiento → servicios → comercio → otro.
 *
 * Las glosas de bancos chilenos suelen venir en mayúsculas y con abreviaciones
 * propias de cada institución (Santander, BCI, BancoEstado, Banco de Chile,
 * Scotiabank, Itaú, Security).
 *
 * Mejorado para mayor precisión en categorización.
 */
function categorizeTransaction(
  descripcion: string,
  monto: number,
  tipo: "cargo" | "abono"
): TransactionCategory {
  const u = descripcion.toUpperCase();

  // ── Transferencias (más específico primero) ──────────────────────────────
  // Outgoing transfers (expenses) - transfers TO someone
  if (/TRANSF(?:E?R)?\.?\s+A\s+|TRANS(?:F|E)?\s+A\s+|TRASPASO\s+A\s+|TEF\s+A\s+|GIRO\s+A\s+|PAGO\s+A\s+|TRANSF(?:E?R)?\s+DESDE|TRANSFERENCIA\s+A/i.test(u))
    return "transferencia_enviada";
  // Incoming transfers (income) - transfers FROM someone
  if (/TRANSF(?:E?R)?\.?\s+DE\s+|TRANS(?:F|E)?\s+DE\s+|TRASPASO\s+DE\s+|TEF\s+DE\s+|TEF\s+CR|TRASPASO\s+AUTOM|ABONO\s+TEF|ABONO\s+TRANSF|TRANSF(?:E?R)?ENCIA\s+RECIBIDA|TRANSF(?:E?R)?\s+RECIB|ABONO\s+POR\s+TRANSF/i.test(u))
    return "transferencia_recibida";

  // ── Ingresos (sueldos, remuneraciones) ───────────────────────────────────
  if (
    tipo === "abono" &&
    /REMUNERACI[OÓ]N|SUELDO|LIQUIDACI[OÓ]N|HONORARIO|PAGO\s+SUELDO|PLANILLA|BONIFICACI[OÓ]N|GRATIFICACI[OÓ]N|AGUINALDO|SUBSIDIO|DEVOLUCI[OÓ]N\s+SII|DEVOLUCI[OÓ]N\s+IMPUESTO|RENTA|PAGOS?\s+DESDE\s+BANCO/i.test(u)
  )
    return "ingreso_principal";
  if (tipo === "abono" && monto >= 300_000 && /EMPRESA|S\.A\.|LTDA|SPA\b|EIRL|CORP|CORPORACION|LIMITADA/i.test(u))
    return "ingreso_principal";

  // ── Educación ────────────────────────────────────────────────────────────
  if (/PONTIFICIA|UNIVERSIDAD|COLEGIO|LICEO|JARD[IÍ]N|JARDIN\s+INFANTIL|U\.\s*CHILE|UTFSM|DUOC|INACAP|CFT\b|PREUNIVERSITARIO|ACADEMIA|INSTITUTO\s+PROF|BRITANICO|NIDO|ESCUELA|KINDER|MATRICULA|ARANCEL|UNIVERSITARIA/i.test(u))
    return "educacion";

  // ── Salud ────────────────────────────────────────────────────────────────
  if (/FONASA|ISAPRE|BANM[EÉ]DICA|CONSALUD|COLMENA|MASVIDA|VIDA\s+TRES|ESENCIAL\s+SALUD|FARMACIA|FARMACIAS\s+AHUMADA|SALCO\s*BRAND|CRUZ\s+VERDE|DR\s+SIMI|MEDIC|DENTAL|DENTISTA|CLINICA|CL[IÍ]NICA|HOSPITAL|BUPA|ACHS|MUTUAL\s+DE\s+SEG|C[OÓ]NSULT|POLICL[IÍ]NICO|EX[AÁ]MENES|EXAMEN\s+MEDICO|URGENCIA|EMERGENCIA|CONSULTA\s+MEDICA/i.test(u))
    return "salud";

  // ── Supermercados / alimentación ─────────────────────────────────────────
  if (/\bL[IÍ]DER\b|WALMART|JUMBO\b|TOTTUS|SANTA\s+ISABEL|UNIMARC|EKONO|COOP\b|BIGGER|ACUENTA|DECA\b|LA\s+DEHESA\s+MARKET|MARKET\s+CENTER|SUPERMERCADO|MAYORISTA\s+10|BIGBOX|CENTRAL\s+MAYOR/i.test(u))
    return "alimentacion";
  if (/MC\s*DONALD|MCDONALD|MCDO|ARCOS\s+DORADOS|BURGER\s+KING|KFC\b|SUBWAY\b|PIZZA\s+HUT|DOMINO|DOMINO\s+PIZZA|PAPA\s+JOHN|SUSHI|SUSHITIME|TELEPIZZA|LOMITO|EMPANADA|PANADER[IÍ]A|CONFITER[IÍ]A|PASTELER[IÍ]A|RESTAURANT|RESTOBAR|PICADA|COMIDA\s+RAPIDA|STARBUCKS|JUAN\s+VALDEZ|CAF[EÉ]|CAFETER[IÍ]A|DELIVERY|RAPPI|PEDIDOS\s+YA|UBER\s*EATS|IFOOD|JUST\s+EAT|DIDI\s+FOOD|APP\s+DELIVERY/i.test(u))
    return "alimentacion";
  if (/VINOS|VINOTECA|BOTILLER[IÍ]A|CERVECER[IÍ]A|CERVECERIA|DESPENSA|ALMAC[EÉ]N|MINIMARKET|MINI\s+MARKET|KIOSKO|KIOSCO|MERKADERIA|ABARROTES/i.test(u))
    return "alimentacion";

  // ── Transporte ───────────────────────────────────────────────────────────
  if (/\bBIP\b|TNE\b|TRANSANTIAGO|RED\s+METROPOLITANA|METRO\s+DE\s+STGO|METRO\b.*SANTIAGO|METRO\s+SANTIAGO|BUSES|LOCOMOCION/i.test(u))
    return "transporte";
  if (/COPEC\b|SHELL\b|PETROBRAS|ENAP\b|TERPEL|PETRONOR|BENCINA|COMBUSTIBLE|NAFTA|GASOLINA|DIESEL|ESTACI[OÓ]N\s+DE\s+SERVICIO|GASOLINERA|PETRO/i.test(u))
    return "transporte";
  if (/AUTOPISTA|AUTOEXPR[EÉ]S|AUTOEXPRES|RUTA\s+5|VESPUCIO|COSTANERA\s+NORTE|SUR|AMERICO\s+VESPUCIO|TAG\b|TELEPASS|TELE\s+PASS|PEAJE|PASAJE\s+URBANO/i.test(u))
    return "transporte";
  if (/UBER\b(?!\s*EATS)|CABIFY|DIDI\b|LIFT\b|LYFT\b|EASY\s+TAXI|TAXI|RADIO\s+TAXI|RECO/i.test(u))
    return "transporte";
  if (/LATAM\b|SKY\s*AIRLINE|JET\s*SMART|JETSMART|AEROL[IÍ]NEA|VUELO|PASAJE\s+A[EÉ]REO|AEROPUERTO|AVION|DESPEGAR|BOOKING\s+VOO|KAYAK/i.test(u))
    return "transporte";
  if (/PARKING|AUTOPARKING|ESTACIONAMIENTO|PLAYA\s+DE\s+ESTAC|PLAYA\s+ESTACIONAMIENTO/i.test(u))
    return "transporte";
  if (/CHILEXPRESS|STARKEN|DHL\b|FEDEX|CORREO\s+CHILE|CORREOS|BLUE\s+EXPRESS|SERVICIO\s+COURIER|ENV[IÍ]O/i.test(u))
    return "transporte";

  // ── Telecomunicaciones ───────────────────────────────────────────────────
  if (/\bENTEL\b|CLARO\s*CHILE|CLARO\s*VTR|\bWOM\b|MOVISTAR|\bVTR\b|\bGTD\b|TELSUR|TELEF[OÓ]NICA|TELEFONICA|TELMEX|MUNDO\s*PAC[IÍ]FICO|PAQUETE\s+CELULAR|PLAN\s+M[OÓ]VIL|INTERNET\s+HOGAR|FIBRA\s+[OÓ]PTICA|TELECOM/i.test(u))
    return "telecomunicaciones";

  // ── Entretenimiento / streaming ──────────────────────────────────────────
  if (/NETFLIX|SPOTIFY|PRIME\s+VIDEO|HBO\s*MAX|HBO\s+MAX|DISNEY\+|DISNEY\s+PLUS|PARAMOUNT|APPLE\s+TV|YOUTUBE\s+PREMIUM|TWITCH|STEAM\b|EPIC\s+GAMES|PLAY\s*STATION|PLAYSTATION|XBOX\s+LIVE|NINTENDO|CINEMARK|CINE\s+H[OA]YTS|CINEHOYTS|MOVIELAND|HOYTS|CIN[ÉE]POLIS|ENTRADA\s+AL\s+CINE|TEATRO|CONCIERTO|EVENTO|ENTRETENIMIENTO/i.test(u))
    return "entretenimiento";
  if (/GIMNASIO|GYM\b|SMART\s*FIT|FITNESS|FITPASS|CLUB\s+DE\s+DEPORTES|PISCINA|ESTADIO|CANCHA|DEPORTE|ACTIVIDAD\s+F[IÍ]SICA|YOGA|PILATES/i.test(u))
    return "entretenimiento";

  // ── Servicios básicos / utilities ────────────────────────────────────────
  if (/ENEL\b|CGE\b|CHILECTRA|ELECTRA|LUZ\s+OSORNO|FRONTEL|SAESA|CONAFE|\bAGUA\b.*POTABLE|ESVAL|AGUAS\s+ANDINAS|AGUAS\s+ANTOFAGASTA|ESSBIO|AGUAS\s+DEL\s+VALLE|AGUAS\s+CHA[ÑN]AR|EMEL|EL[IÉ]CTRICA/i.test(u))
    return "comercio";
  if (/GAS\s+NATURAL|METROGAS|LIPIGAS|ABASTIBLE|GASVAL|GAS\s+ENERGY|GASCO|GLP/i.test(u))
    return "comercio";

  // ── Vivienda / arriendo ──────────────────────────────────────────────────
  if (/ARRIENDO|ARRENDAMIENTO|DIVIDENDO|ADMINISTRACI[OÓ]N\s+EDIFICIO|CONDOMINIO|INMOBILIARIA|CORREDORA\s+PROP|PROPIEDAD|INMUEBLE/i.test(u))
    return "otro";

  // ── Comercio general / retail ────────────────────────────────────────────
  if (/FALABELLA|RIPLEY|PARIS\b|LA\s+POLAR|H&M\b|ZARA\b|FOREVER\s+21|CORONA\b|HITES\b|ABC\s+DIN|EASY\b|HOMECENTER|SODIMAC|IKEA\b|ABCDIN|TIENDA|RETAIL|COMERCIO/i.test(u))
    return "comercio";
  if (/AMAZON\b|EBAY\b|ALIEXPRESS|SHEIN\b|WISH\b|SHOPEE|MERCADOLIBRE|MERCADO\s+LIBRE|LINIO\b|PARIS\.CL|FALABELLA\.COM|RIPLEY\.COM|TIENDA|COMPRA\s+ONLINE|ECOMMERCE|E-COMMERCE/i.test(u))
    return "comercio";
  if (/MERCADOPAGO|MERCADO\s+PAGO|PAYU\b|KUSHKI\b|STRIPE\b|WEBPAY|FLOW\b|TRANSBANK|GETNET|PAYPAL\b|PAY\s+GOOGLE|APPLE\s+PAY/i.test(u))
    return "comercio";

  // ── Financiero / seguros ─────────────────────────────────────────────────
  if (/SEGURO|PRIMA\b|P[OÓ]LIZA|AFP\b|APV\b|FONDO\s+MUTUO|INVERSI[OÓ]N|BURS[AÁ]TIL|CORREDORA\s+DE\s+BOLSA|CMF\b|SBIF\b|BANCO\s+CENTRAL|COMISI[OÓ]N|INTER[EÉ]S|GASTO\s+BANCARIO|COBRO\s+CUENTA|MANTENCION\s+CUENTA/i.test(u))
    return "otro";

  // Fallback según tipo (abono sin clasificar → ingreso menor)
  if (tipo === "abono" && monto >= 100_000)
    return "ingreso_principal";

  return "otro";
}

function txTipo(cargo: number, abono: number): "cargo" | "abono" | null {
  if (cargo > 0 && abono === 0) return "cargo";
  if (abono > 0 && cargo === 0) return "abono";
  return null;
}

function flagsForDescription(desc: string): {
  es_transferencia: boolean;
  es_compra: boolean;
} {
  const es_transferencia = /transf|traspaso/i.test(desc);
  const es_compra = /compra|pago\s+con\s+tarjeta|pos\s+/i.test(desc);
  return { es_transferencia, es_compra };
}

async function bufferToText(buffer: Buffer): Promise<string> {
  try {
    const data = await pdfParse(buffer);
    const t = (data.text || "").trim();
    if (t.length >= 80) return t;
  } catch {
    /* pdf-parse falló */
  }
  const { text } = await extractPdfText(buffer);
  return (text || "").trim();
}

function buildSaldosDiarios(
  desde: Date,
  hasta: Date,
  saldoInicialPeriodo: number,
  txs: Array<{ fecha: Date; saldo_despues: number }>
): Array<{ fecha: Date; saldo: number }> {
  const byDay = new Map<string, number>();
  for (const tx of txs) {
    const key = isoDate(tx.fecha);
    byDay.set(key, tx.saldo_despues);
  }
  const out: Array<{ fecha: Date; saldo: number }> = [];
  let cursor = startOfDay(desde);
  const end = startOfDay(hasta);
  let lastSaldo = saldoInicialPeriodo;
  while (cursor.getTime() <= end.getTime()) {
    const key = isoDate(cursor);
    if (byDay.has(key)) lastSaldo = byDay.get(key)!;
    out.push({ fecha: new Date(cursor), saldo: lastSaldo });
    cursor = new Date(cursor);
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0);
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseCartolaDate(fechaStr: string): Date {
  // First try ISO format: YYYY-MM-DD
  const iso = fechaStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return new Date(parseInt(iso[1]!, 10), parseInt(iso[2]!, 10) - 1, parseInt(iso[3]!, 10), 12, 0, 0, 0);
  }
  // Try DD/MM/YYYY format (common in Chilean bank statements)
  const ddmmyyyy = fechaStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (ddmmyyyy) {
    const day = parseInt(ddmmyyyy[1]!, 10);
    const month = parseInt(ddmmyyyy[2]!, 10) - 1;
    const year = parseInt(ddmmyyyy[3]!, 10);
    return new Date(year, month, day, 12, 0, 0, 0);
  }
  // Try DD/MM/YY format
  const ddmmyy = fechaStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})/);
  if (ddmmyy) {
    const day = parseInt(ddmmyy[1]!, 10);
    const month = parseInt(ddmmyy[2]!, 10) - 1;
    const year = 2000 + parseInt(ddmmyy[3]!, 10);
    return new Date(year, month, day, 12, 0, 0, 0);
  }
  // Default: try parsing as-is
  const d = new Date(fechaStr);
  if (!isNaN(d.getTime())) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0);
  }
  // Fallback to current date
  return new Date();
}

/**
 * Parsea un PDF de cartola y devuelve el resultado estructurado.
 */
export async function parseCartolaPdfBuffer(buffer: Buffer): Promise<CartolaParseResult> {
  const text = await bufferToText(buffer);
  if (!text || text.length < 40) {
    throw new Error("No se pudo extraer texto del PDF.");
  }

  const banco = detectBankFromText(text);
  const titular = extractTitular(text);
  const cuenta = extractCuenta(text);
  const periodo = extractPeriodo(text);
  const resumen = extractResumenMontos(text);

  const cartola = parseCartolaPdf(text);
  if (!cartola || cartola.transacciones.length === 0) {
    // Devolver estructura vacía válida en lugar de lanzar error
    const now = new Date();
    const periodoEmpty = {
      desde: new Date(now.getFullYear(), now.getMonth(), 1, 12, 0, 0, 0),
      hasta: new Date(now.getFullYear(), now.getMonth() + 1, 0, 12, 0, 0, 0),
      dias: 30,
    };
    return {
      banco,
      titular,
      cuenta,
      periodo: periodoEmpty,
      saldo_inicial: 0,
      saldo_final: 0,
      total_cargos: 0,
      total_abonos: 0,
      transacciones: [],
      saldos_diarios: [],
    };
  }

  const enriched = enrichCartola(cartola, banco, titular, cuenta, periodo, resumen);
  return enriched;
}

function enrichCartola(
  cartola: CartolaExtraida,
  banco: string,
  titular: string,
  cuenta: string,
  periodo: { desde: Date; hasta: Date; dias: number },
  resumen: {
    saldo_inicial: number | null;
    total_cargos: number | null;
    total_abonos: number | null;
    saldo_final: number | null;
  }
): CartolaParseResult {
  const descCounts = new Map<string, number>();
  for (const t of cartola.transacciones) {
    const k = normalizeDescKey(t.descripcion);
    if (k.length < 4) continue;
    descCounts.set(k, (descCounts.get(k) ?? 0) + 1);
  }

  let saldoInicial =
    resumen.saldo_inicial ?? cartola.saldoInicial ?? null;
  const saldoFinalReported = resumen.saldo_final ?? cartola.saldoFinal ?? null;

  let sumCargos = 0;
  let sumAbonos = 0;
  const base: Array<{
    fecha: Date;
    descripcion: string;
    tipo: "cargo" | "abono";
    monto: number;
    cargo: number;
    abono: number;
  }> = [];

  for (const t of cartola.transacciones) {
    const tipo = txTipo(t.cargo, t.abono);
    if (!tipo) continue;
    const monto = tipo === "cargo" ? t.cargo : t.abono;
    sumCargos += t.cargo;
    sumAbonos += t.abono;
    base.push({
      fecha: parseCartolaDate(t.fecha),
      descripcion: t.descripcion,
      tipo,
      monto,
      cargo: t.cargo,
      abono: t.abono,
    });
  }

  if (saldoInicial === null || Number.isNaN(saldoInicial)) {
    if (saldoFinalReported != null) {
      saldoInicial = saldoFinalReported - sumAbonos + sumCargos;
    } else {
      // Fallback: sin saldo inicial conocido, usar 0 y continuar (saldo_despues será relativo)
      saldoInicial = 0;
    }
  }

  let running = saldoInicial;
  const transacciones: CartolaParseResult["transacciones"] = [];

  for (const row of base) {
    running += row.abono - row.cargo;
    const cat = categorizeTransaction(row.descripcion, row.monto, row.tipo);
    const { es_transferencia, es_compra } = flagsForDescription(row.descripcion);
    const k = normalizeDescKey(row.descripcion);
    const es_pago_recurrente = k.length >= 4 && (descCounts.get(k) ?? 0) > 1;

    // CORRECT tipo based on categorization - fix mismatches
    let correctedTipo = row.tipo;
    let correctedMonto = row.monto;

    // If categorized as income but marked as expense, flip it
    if (cat === "transferencia_recibida" || cat === "ingreso_principal") {
      if (row.tipo === "cargo") {
        correctedTipo = "abono";
        correctedMonto = Math.abs(row.monto); // Ensure positive
      }
    }
    // If categorized as outgoing transfer but marked as income, flip it
    if (cat === "transferencia_enviada") {
      if (row.tipo === "abono") {
        correctedTipo = "cargo";
        correctedMonto = Math.abs(row.monto); // Ensure positive
      }
    }

    transacciones.push({
      fecha: row.fecha,
      descripcion: row.descripcion,
      tipo: correctedTipo,
      monto: correctedMonto,
      saldo_despues: running,
      categoria: cat,
      es_transferencia,
      es_compra,
      es_pago_recurrente,
    });
  }

  let saldo_final =
    saldoFinalReported != null ? saldoFinalReported : running;

  const total_cargos = resumen.total_cargos ?? sumCargos;
  const total_abonos = resumen.total_abonos ?? sumAbonos;

  const saldos_diarios = buildSaldosDiarios(
    periodo.desde,
    periodo.hasta,
    Math.round(saldoInicial),
    transacciones
  );

  return {
    banco,
    titular: (titular || "").trim(),
    cuenta: (cuenta || "").trim(),
    periodo,
    saldo_inicial: Math.round(saldoInicial),
    saldo_final: Math.round(saldo_final),
    total_cargos: Math.round(total_cargos),
    total_abonos: Math.round(total_abonos),
    transacciones,
    saldos_diarios,
  };
}
