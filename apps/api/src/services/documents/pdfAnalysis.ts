/**
 * Análisis de PDFs: Informe CMF (Deudas) y Cartolas Bancarias.
 * Referencia: Informe de Deudas CMF (Deuda Total Vigente, Deuda Indirecta, Número de Instituciones).
 * Cartolas: mapeo a SFA según schema_csv (Información transaccional, Productos vigentes).
 * Motor de extracción: pdfjs-dist (Mozilla), compatible con ESM y Render.
 */

import * as pdfjs from 'pdfjs-dist';
import type { SfaTransaccionCuenta, SfaProductoVigenteCuenta } from '../../sfa/types.js';

export interface CmfInformeDeudas {
  tipo: 'cmf_informe_deudas';
  deudaTotalVigente: number;
  deudaIndirecta: number;
  numeroInstituciones: number;
  rutDocumento?: string;
  rawText?: string;
}

export interface CartolaExtraida {
  tipo: 'cartola';
  transacciones: Array<{
    fecha: string;
    descripcion: string;
    cargo: number;
    abono: number;
    saldo?: number;
  }>;
  saldoInicial?: number;
  saldoFinal?: number;
  rutDocumento?: string;
}

export type DocumentoExtraido = CmfInformeDeudas | CartolaExtraida;

const NUM_RE = /[\d.\s]+/;
const RUT_RE = /\b\d{1,2}\.\d{3}\.\d{3}-[\dKk]\b/;

function extractNumberAfterLabel(text: string, label: string): number | null {
  const idx = text.search(new RegExp(label.replace(/\s+/g, '\\s+'), 'i'));
  if (idx === -1) return null;
  const slice = text.slice(idx, idx + 120);
  const match = slice.match(/\$?\s*([\d.]+)\s*(?:UF|CLP|pesos)?/);
  if (match) return parseFloat(match[1].replace(/\./g, '').replace(/,/, '.') || match[1]) || null;
  const onlyDigits = slice.replace(/[^\d.]/g, ' ');
  const num = onlyDigits.trim().split(/\s+/)[0];
  return num ? parseFloat(num) : null;
}

/**
 * Extrae texto de un buffer PDF usando el motor de Mozilla (pdfjs-dist).
 * Compatible con ESM y entornos de producción como Render.
 */
export async function extractPdfText(buffer: Buffer): Promise<{ text: string; numPages: number }> {
  const uint8Array = new Uint8Array(buffer);

  const loadingTask = pdfjs.getDocument({
    data: uint8Array,
    useSystemFonts: true,
    disableFontFace: true,
  });

  const pdfDocument = await loadingTask.promise;
  let fullText = '';

  for (let i = 1; i <= pdfDocument.numPages; i++) {
    const page = await pdfDocument.getPage(i);
    const textContent = await page.getTextContent();

    const pageText = textContent.items
      .map((item: { str?: string }) => (item as { str: string }).str)
      .join(' ');

    fullText += pageText + '\n';
  }

  return {
    text: fullText,
    numPages: pdfDocument.numPages,
  };
}

/**
 * Parsea texto de un Informe de Deudas CMF.
 * Campos típicos: Deuda Total Vigente, Deuda Indirecta, Número de Instituciones.
 */
export function parseCmfInformeDeudas(text: string): CmfInformeDeudas | null {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\s+/g, ' ');
  const deudaTotal = extractNumberAfterLabel(normalized, 'Deuda Total Vigente')
    ?? extractNumberAfterLabel(normalized, 'Deuda total vigente')
    ?? extractNumberAfterLabel(normalized, 'Total vigente');
  const deudaIndirecta = extractNumberAfterLabel(normalized, 'Deuda Indirecta')
    ?? extractNumberAfterLabel(normalized, 'Deuda indirecta');
  const numInst = extractNumberAfterLabel(normalized, 'Número de Instituciones')
    ?? extractNumberAfterLabel(normalized, 'Número de instituciones')
    ?? (normalized.match(/instituciones?\s*[:\s]*(\d+)/i)?.[1] ? parseInt(normalized.match(/instituciones?\s*[:\s]*(\d+)/i)![1], 10) : null);
  const rut = normalized.match(RUT_RE)?.[0];
  if (deudaTotal === null && deudaIndirecta === null && numInst === null) return null;
  return {
    tipo: 'cmf_informe_deudas',
    deudaTotalVigente: deudaTotal ?? 0,
    deudaIndirecta: deudaIndirecta ?? 0,
    numeroInstituciones: numInst ?? 0,
    rutDocumento: rut,
    rawText: text.slice(0, 2000),
  };
}

/**
 * Parsea texto de una cartola bancaria (líneas con fecha, descripción, cargos/abonos).
 * Formato típico: fecha (dd/mm/yyyy o dd-mm-yyyy), descripción, monto (cargo negativo o abono positivo).
 */
export function parseCartolaPdf(text: string): CartolaExtraida | null {
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const transacciones: CartolaExtraida['transacciones'] = [];
  const dateRe = /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/;
  const amountRe = /([+-])?\s*\$?\s*([\d.,]+)/g;
  let saldoFinal: number | undefined;
  let saldoInicial: number | undefined;
  for (const line of lines) {
    const dateMatch = line.match(dateRe);
    if (!dateMatch) continue;
    const [, d, m, y] = dateMatch;
    const year = y.length === 2 ? 2000 + parseInt(y, 10) : parseInt(y, 10);
    const fecha = `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    const descripcion = line.replace(dateRe, '').replace(/\$?[\d.,]+\s*(UF|CLP)?/g, '').trim().slice(0, 200);
    const amounts = [...line.matchAll(/([+-])?\s*\$?\s*([\d.,]+)/g)];
    let cargo = 0;
    let abono = 0;
    for (const am of amounts) {
      const sign = am[1];
      const val = parseFloat((am[2] || '0').replace(/\./g, '').replace(',', '.'));
      if (sign === '-') cargo += val;
      else abono += val;
    }
    if (cargo === 0 && abono === 0) continue;
    transacciones.push({ fecha, descripcion, cargo, abono });
  }
  const rut = text.match(RUT_RE)?.[0];
  if (transacciones.length === 0) return null;
  return {
    tipo: 'cartola',
    transacciones,
    saldoInicial,
    saldoFinal,
    rutDocumento: rut,
  };
}

/**
 * Detecta tipo de documento por contenido y parsea.
 */
export async function analyzePdfBuffer(buffer: Buffer): Promise<DocumentoExtraido | null> {
  const { text } = await extractPdfText(buffer);
  if (!text || text.length < 50) return null;
  const cmf = parseCmfInformeDeudas(text);
  if (cmf) return cmf;
  const cartola = parseCartolaPdf(text);
  if (cartola) return cartola;
  return null;
}

/**
 * Convierte cartola extraída a transacciones SFA (cuenta) para el motor de scoring.
 */
export function cartolaToSfaTransactions(
  cartola: CartolaExtraida,
  rutCliente: string
): SfaTransaccionCuenta[] {
  return cartola.transacciones.map((t, i) => ({
    rutCliente,
    idInternoTransaccion: `cartola-${Date.now()}-${i}`,
    fechaOperacion: t.fecha,
    fechaContableOperacion: t.fecha,
    tipoProductoFinanciero: 'A001',
    tipoOperacion: t.abono > 0 ? 'abono' : 'cargo',
    montoOperacion: t.abono > 0 ? t.abono : -t.cargo,
    monedaOperacion: 'CLP',
  }));
}

/**
 * Genera un producto vigente (cuenta) a partir de saldos de cartola para el scoring.
 */
export function cartolaToSfaProductos(
  cartola: CartolaExtraida,
  rutCliente: string
): SfaProductoVigenteCuenta[] {
  const saldo = cartola.saldoFinal ?? cartola.saldoInicial ?? 0;
  return [{
    rutCliente,
    idInternoProducto: `cartola-cuenta-${Date.now()}`,
    fechaContratacionProducto: cartola.transacciones[0]?.fecha ?? new Date().toISOString().slice(0, 10),
    tipoProductoFinanciero: 'A001',
    saldo,
    moneda: 'CLP',
    lineaCreditoSobregiroTotal: 0,
    lineaCreditoSobregiroUtilizada: 0,
    lineaCreditoSobregiroDisponible: 0,
  }];
}
