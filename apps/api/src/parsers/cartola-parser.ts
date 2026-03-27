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

  if (!desde || !hasta) {
    throw new Error(
      "No se pudo determinar el período (DESDE/HASTA o AL) desde el PDF. El documento podría estar incompleto o en un formato no soportado."
    );
  }

  const msPerDay = 86400000;
  const dias = Math.max(1, Math.round((hasta.getTime() - desde.getTime()) / msPerDay) + 1);
  return { desde, hasta, dias };
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

function categorizeTransaction(
  descripcion: string,
  monto: number,
  tipo: "cargo" | "abono"
): TransactionCategory {
  const u = descripcion.toUpperCase();

  if (/TRANSF\.?\s+A\s+|TRANSF\s+A\s+|TRASPASO\s+A\s+/i.test(descripcion)) {
    return "transferencia_enviada";
  }
  if (/TRANSF\.?\s+DE\s+|TRANSF\s+DE\s+|TRASPASO\s+DE\s+/i.test(descripcion)) {
    return "transferencia_recibida";
  }
  if (/PONTIFICIA\s+UNIV|UNIVERSIDAD|COLEGIO|U\.\s*CHILE|U\.?CHILE|UTFSM|DUOC|INACAP/i.test(u)) {
    return "educacion";
  }
  if (/ARCOS\s+DORADOS|MC\s*DONALD|BURGER|BK\s|PIZZA|SUSHI|KFC|SUBWAY|STARBUCKS/i.test(u)) {
    return "alimentacion";
  }
  if (/BIP\b|PARKING|AUTOPARKING|BENCINA|COPEC|SHELL|PETROBRAS|TAG\b|AUTOPISTA/i.test(u)) {
    return "transporte";
  }
  if (/ENTEL|CLARO|WOM|MOVISTAR|VTR|GTD|MUNDOTECH/i.test(u)) {
    return "telecomunicaciones";
  }
  if (/MERCADOPAGO|PAYU|KUSHKI|STRIPE|WEBPAY|FLOW\b|TRANSBANK/i.test(u)) {
    return "comercio";
  }
  if (/NETFLIX|SPOTIFY|PRIME|HBO|DISNEY|CINE|CINEMARK|MOVISTAR\s+PLAY/i.test(u)) {
    return "entretenimiento";
  }
  if (/FONASA|ISAPRE|FARM|CRUZ\s+VERDE|SALCO|SALUD|DENTAL|HOSPITAL|CLINICA/i.test(u)) {
    return "salud";
  }
  if (
    tipo === "abono" &&
    (monto > 500_000 ||
      /INVERSION|INVERSI[ÓO]N|REMUNERACI[ÓO]N|SUELDO|LIQUIDACI[ÓO]N|HONORARIOS/i.test(u))
  ) {
    return "ingreso_principal";
  }
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
  const iso = fechaStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return new Date(parseInt(iso[1]!, 10), parseInt(iso[2]!, 10) - 1, parseInt(iso[3]!, 10), 12, 0, 0, 0);
  }
  return new Date(fechaStr);
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
    throw new Error(
      "No se detectaron movimientos de cartola. Formatos soportados en profundidad: Santander (CUENTA VISTA)."
    );
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
      throw new Error(
        "No se pudieron determinar el saldo inicial ni el saldo final en el PDF; no se puede reconstruir la cartola sin inventar datos."
      );
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

    transacciones.push({
      fecha: row.fecha,
      descripcion: row.descripcion,
      tipo: row.tipo,
      monto: row.monto,
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
