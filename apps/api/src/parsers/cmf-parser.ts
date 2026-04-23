/**
 * Parser de Certificado de Deudas CMF (PDF → CMFParseResult).
 * Extracción: pdf-parse con respaldo extractPdfText (pdfjs).
 */

import pdfParse from "pdf-parse";
import { extractPdfText } from "../services/documents/pdfAnalysis.js";
import { parseCLP } from "../utils/clp.js";

const RUT_RE = /\b\d{1,2}\.\d{3}\.\d{3}-[\dKk]\b/;

const parseChileAmount = parseCLP;

function parseDateDMY(s: string): Date | null {
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const d = parseInt(m[1]!, 10);
  const mo = parseInt(m[2]!, 10);
  const y = parseInt(m[3]!, 10);
  return new Date(y, mo - 1, d, 12, 0, 0, 0);
}

function tipoCreditoFromText(t: string): "vivienda" | "consumo" | "comercial" | "otro" {
  const u = t.toUpperCase();
  if (/VIVIENDA|HIPOTEC|DIV4030|DIV\s*4030/.test(u)) return "vivienda";
  if (/COMERCIAL|EMPRESA|PYME/.test(u)) return "comercial";
  if (/CONSUMO|TARJETA|CREDITO\s+DE\s+CONSUMO|LINEA|LINEA\s+DE\s+CREDITO/.test(u)) return "consumo";
  return "otro";
}

export interface CMFParseResult {
  titular: string;
  rut: string;
  fecha_emision: Date;
  fecha_actualizacion: Date;
  deuda_total: number;
  deuda_directa: Array<{
    institucion: string;
    tipo_credito: "vivienda" | "consumo" | "comercial" | "otro";
    total: number;
    vigente: number;
    atraso_30_59: number;
    atraso_60_89: number;
    atraso_90_mas: number;
  }>;
  deuda_indirecta: Array<{
    institucion: string;
    tipo_credito: string;
    total: number;
    vigente: number;
    atraso_30_59: number;
    atraso_60_89: number;
    atraso_90_mas: number;
  }>;
  lineas_credito: Array<{
    institucion: string;
    disponible_directo: number;
    disponible_indirecto: number;
  }>;
  metricas: {
    tiene_deuda: boolean;
    porcentaje_al_dia: number;
    porcentaje_en_atraso: number;
    tiene_atraso_grave: boolean;
    score_cmf: number;
    credito_disponible_total: number;
  };
}

async function bufferToText(buffer: Buffer): Promise<string> {
  try {
    const data = await pdfParse(buffer);
    const t = (data.text || "").trim();
    if (t.length >= 80) return t;
  } catch {
    /* ignore */
  }
  const { text } = await extractPdfText(buffer);
  return (text || "").trim();
}

function extractLabelDateOrNull(text: string, labels: RegExp[]): Date | null {
  const flat = text.replace(/\r\n/g, "\n");
  for (const re of labels) {
    const m = flat.match(re);
    if (m?.[1]) {
      const d = parseDateDMY(m[1]);
      if (d) return d;
    }
  }
  return null;
}

function extractTitular(text: string): string {
  const n = text.match(/(?:Nombre|Titular|Titular\(es\))\s*[:\s]+([^\n]+)/i);
  if (n?.[1]) return n[1].trim().slice(0, 200);
  const lines = text.split(/\n/).map((l) => l.trim());
  const hit = lines.find(
    (l) => /^[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s]{10,}/.test(l) && !/INFORME|DEUDA|CMF|COMISI/i.test(l)
  );
  return hit ? hit.slice(0, 200) : "";
}

/**
 * Intenta extraer filas tipo tabla "Institución ... montos" desde texto plano.
 */
function parseDeudaRowsDirecta(section: string): CMFParseResult["deuda_directa"] {
  const rows: CMFParseResult["deuda_directa"] = [];
  const lines = section.split(/\n/).map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    if (/total|vigente|atraso|instituci/i.test(line) && line.length < 40) continue;
    const nums = line.match(/\$?\s*[\d.]+(?:\s+\$?\s*[\d.]+){2,}/);
    if (!nums) continue;
    const parts = line
      .replace(/\$/g, "")
      .split(/\s+/)
      .filter((p) => /^[\d.]+$/.test(p));
    if (parts.length < 3) continue;

    const institucion = line
      .replace(/\$?\s*[\d.,]+\s*/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
    if (institucion.length < 3) continue;

    const values = parts.map((p) => parseChileAmount(p));
    if (values.every((v) => v === 0)) continue;

    const total = values[0] ?? 0;
    const vigente = values[1] ?? total;
    const a30 = values[2] ?? 0;
    const a60 = values[3] ?? 0;
    const a90 = values[4] ?? 0;

    const tipo = tipoCreditoFromText(line);
    rows.push({
      institucion,
      tipo_credito: tipo,
      total,
      vigente,
      atraso_30_59: a30,
      atraso_60_89: a60,
      atraso_90_mas: a90,
    });
  }
  return rows;
}

function parseDeudaRowsIndirecta(section: string): CMFParseResult["deuda_indirecta"] {
  const rows: CMFParseResult["deuda_indirecta"] = [];
  const lines = section.split(/\n/).map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    if (/total|vigente|atraso|instituci/i.test(line) && line.length < 40) continue;
    const nums = line.match(/\$?\s*[\d.]+(?:\s+\$?\s*[\d.]+){2,}/);
    if (!nums) continue;
    const parts = line
      .replace(/\$/g, "")
      .split(/\s+/)
      .filter((p) => /^[\d.]+$/.test(p));
    if (parts.length < 3) continue;

    const institucion = line
      .replace(/\$?\s*[\d.,]+\s*/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
    if (institucion.length < 3) continue;

    const values = parts.map((p) => parseChileAmount(p));
    if (values.every((v) => v === 0)) continue;

    const total = values[0] ?? 0;
    const vigente = values[1] ?? total;
    const a30 = values[2] ?? 0;
    const a60 = values[3] ?? 0;
    const a90 = values[4] ?? 0;

    rows.push({
      institucion,
      tipo_credito: tipoCreditoFromText(line),
      total,
      vigente,
      atraso_30_59: a30,
      atraso_60_89: a60,
      atraso_90_mas: a90,
    });
  }
  return rows;
}

function sliceSection(text: string, startRe: RegExp, endRes: RegExp[]): string {
  const start = text.search(startRe);
  if (start === -1) return "";
  let end = text.length;
  const slice = text.slice(start);
  for (const er of endRes) {
    const m = slice.search(er);
    if (m !== -1 && m > 20) end = Math.min(end, start + m);
  }
  return text.slice(start, end);
}

function computeMetricas(r: Omit<CMFParseResult, "metricas">): CMFParseResult["metricas"] {
  let totalAll = 0;
  let vigenteAll = 0;
  let a30 = 0;
  let a60 = 0;
  let a90 = 0;

  for (const d of r.deuda_directa) {
    totalAll += d.total;
    vigenteAll += d.vigente;
    a30 += d.atraso_30_59;
    a60 += d.atraso_60_89;
    a90 += d.atraso_90_mas;
  }
  for (const d of r.deuda_indirecta) {
    totalAll += d.total;
    vigenteAll += d.vigente;
    a30 += d.atraso_30_59;
    a60 += d.atraso_60_89;
    a90 += d.atraso_90_mas;
  }

  const tiene_deuda = r.deuda_total > 0 || totalAll > 0;
  const porcentaje_al_dia = totalAll > 0 ? (vigenteAll / totalAll) * 100 : 0;
  const moraTotal = a30 + a60 + a90;
  const porcentaje_en_atraso = totalAll > 0 ? (moraTotal / totalAll) * 100 : 0;
  const tiene_atraso_grave = a90 > 0;

  let score_cmf = 85;
  if (tiene_deuda) {
    if (a90 > 0) score_cmf = 15 + Math.min(15, porcentaje_al_dia / 5);
    else if (a60 > 0) score_cmf = 40 + Math.min(10, porcentaje_al_dia / 10);
    else if (a30 > 0) score_cmf = 60 + Math.min(10, porcentaje_al_dia / 10);
    else score_cmf = 90 + Math.min(10, porcentaje_al_dia / 20);
  }

  score_cmf = Math.max(0, Math.min(100, Math.round(score_cmf)));

  const credito_disponible_total = r.lineas_credito.reduce(
    (s, l) => s + l.disponible_directo + l.disponible_indirecto,
    0
  );

  return {
    tiene_deuda,
    porcentaje_al_dia: Math.round(porcentaje_al_dia * 10) / 10,
    porcentaje_en_atraso: Math.round(porcentaje_en_atraso * 10) / 10,
    tiene_atraso_grave,
    score_cmf,
    credito_disponible_total,
  };
}

/**
 * Extrae totales globales del informe CMF (texto normalizado o multilinea).
 */
function extractDeudaTotal(text: string): number {
  const normalized = text.replace(/\s+/g, " ");
  const patterns = [
    /Deuda\s+total\s+y\s+estado\s+de\s+pago\s*\$?\s*([\d.]+)/i,
    /Deuda\s+Total\s+Vigente\s*\$?\s*([\d.]+)/i,
    /Total\s+vigente\s*\$?\s*([\d.]+)/i,
  ];
  for (const p of patterns) {
    const m = normalized.match(p);
    if (m?.[1]) return parseChileAmount(m[1]);
  }
  return 0;
}

function parseLineasCredito(text: string): CMFParseResult["lineas_credito"] {
  const sec = sliceSection(text, /l[ií]neas?\s+de\s+cr[eé]dito|cr[eé]dito\s+disponible/i, [
    /informaci[oó]n\s+relevante|notas?\s*$/i,
  ]);
  const out: CMFParseResult["lineas_credito"] = [];
  if (!sec) return out;
  const lines = sec.split(/\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const nums = line.match(/(?:[\d.]+\s*){2,}/);
    if (!nums) continue;
    const parts = line.match(/\$?\s*[\d.]+/g);
    if (!parts || parts.length < 2) continue;
    const disponible_directo = parseChileAmount(parts[0]!.replace(/\$/g, ""));
    const disponible_indirecto = parseChileAmount(parts[1]!.replace(/\$/g, ""));
    const institucion = line.replace(/\$?\s*[\d.]+\s*/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
    if (institucion.length >= 3) {
      out.push({ institucion, disponible_directo, disponible_indirecto });
    }
  }
  return out;
}

/**
 * Parsea buffer PDF de certificado CMF / informe de deudas.
 */
export async function parseCmfPdfBuffer(buffer: Buffer): Promise<CMFParseResult> {
  const text = await bufferToText(buffer);
  if (!text || text.length < 40) {
    throw new Error("No se pudo extraer texto del PDF.");
  }

  const rut = text.match(RUT_RE)?.[0] ?? "";
  if (!rut) {
    throw new Error("No se detectó un RUT válido en el certificado CMF.");
  }

  const titular = extractTitular(text);
  const fecha_emision = extractLabelDateOrNull(text, [
    /Fecha\s+de\s+emisi[oó]n\s*[:\s]+(\d{1,2}\/\d{1,2}\/\d{4})/i,
    /Emitido\s+el\s*(\d{1,2}\/\d{1,2}\/\d{4})/i,
  ]);
  const fecha_actualizacion = extractLabelDateOrNull(text, [
    /Fecha\s+de\s+actualizaci[oó]n\s*[:\s]+(\d{1,2}\/\d{1,2}\/\d{4})/i,
    /[ÚU]ltima\s+actualizaci[oó]n\s*[:\s]+(\d{1,2}\/\d{1,2}\/\d{4})/i,
  ]);
  if (!fecha_emision && !fecha_actualizacion) {
    throw new Error(
      "No se pudieron detectar fechas de emisión ni de actualización en el certificado CMF."
    );
  }
  const fe = fecha_emision ?? fecha_actualizacion!;
  const fa = fecha_actualizacion ?? fecha_emision!;

  const secDirecta = sliceSection(text, /Deuda\s+directa/i, [/Deuda\s+indirecta/i, /L[ií]neas?\s+de/i]);
  const secIndirecta = sliceSection(text, /Deuda\s+indirecta/i, [/L[ií]neas?\s+de/i, /Informaci[oó]n/i]);

  let deuda_directa = parseDeudaRowsDirecta(secDirecta);
  let deuda_indirecta = parseDeudaRowsIndirecta(secIndirecta);

  if (/No\s+registra\s+informaci/i.test(secDirecta)) deuda_directa = [];
  if (/No\s+registra\s+informaci/i.test(secIndirecta)) deuda_indirecta = [];

  let deuda_total = extractDeudaTotal(text);
  if (deuda_total === 0) {
    deuda_total =
      deuda_directa.reduce((s, r) => s + r.total, 0) +
      deuda_indirecta.reduce((s, r) => s + r.total, 0);
  }

  const lineas_credito = parseLineasCredito(text);

  const base: Omit<CMFParseResult, "metricas"> = {
    titular: (titular || "").trim(),
    rut,
    fecha_emision: fe,
    fecha_actualizacion: fa,
    deuda_total,
    deuda_directa,
    deuda_indirecta,
    lineas_credito,
  };

  return {
    ...base,
    metricas: computeMetricas(base),
  };
}
