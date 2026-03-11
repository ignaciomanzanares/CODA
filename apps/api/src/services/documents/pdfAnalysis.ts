/**
 * Análisis de PDFs: Informe CMF (Deudas) y Cartolas Bancarias.
 * Referencia: Informe de Deudas CMF (Deuda Total Vigente, Deuda Indirecta, Número de Instituciones).
 * Cartolas: mapeo a SFA según schema_csv (Información transaccional, Productos vigentes).
 * Motor de extracción: pdfjs-dist/legacy (Node.js/Render, evita DOMMatrix).
 */

// Importamos la versión legacy optimizada para Node.js
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
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
 * Motor de extracción de texto optimizado para entornos Node.js/Render.
 * Soluciona errores de tipos TS2353 y TS2345.
 */
export async function extractPdfText(buffer: Buffer): Promise<{ text: string; numPages: number }> {
  const uint8Array = new Uint8Array(buffer);

  const loadingTask = pdfjs.getDocument(uint8Array as any);
  const pdfDocument = await loadingTask.promise;

  let fullText = '';
  for (let i = 1; i <= pdfDocument.numPages; i++) {
    const page = await pdfDocument.getPage(i);
    const textContent = await page.getTextContent();

    // Group text items by Y position to preserve visual line breaks.
    // Items on the same visual row share approximately the same Y coordinate.
    const items = textContent.items
      .filter((item: any) => 'str' in item && item.str.trim() !== '')
      .map((item: any) => ({
        str: item.str,
        x: item.transform?.[4] ?? 0,
        y: item.transform?.[5] ?? 0,
      }));

    if (items.length === 0) continue;

    // Sort by Y descending (top of page first), then X ascending (left to right)
    items.sort((a: any, b: any) => {
      const yDiff = b.y - a.y;
      if (Math.abs(yDiff) > 2) return yDiff;
      return a.x - b.x;
    });

    // Merge items on the same visual line (Y within 3pt tolerance)
    let currentY = items[0].y;
    let currentLine = items[0].str;

    for (let j = 1; j < items.length; j++) {
      if (Math.abs(items[j].y - currentY) <= 3) {
        currentLine += ' ' + items[j].str;
      } else {
        fullText += currentLine + '\n';
        currentY = items[j].y;
        currentLine = items[j].str;
      }
    }
    fullText += currentLine + '\n';
  }

  return {
    text: fullText,
    numPages: pdfDocument.numPages,
  };
}

/**
 * Parsea texto de un Informe de Deudas CMF.
 * Campos típicos: Deuda Total Vigente, Deuda Indirecta, Número de Instituciones.
 * Mejorado para manejar variaciones en formato (ej: "Deuda total y estado de pago $0")
 */
export function parseCmfInformeDeudas(text: string): CmfInformeDeudas | null {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\s+/g, ' ');
  
  // Buscar "Deuda total y estado de pago $X" o "Deuda Total Vigente $X"
  let deudaTotal = extractNumberAfterLabel(normalized, 'Deuda Total Vigente')
    ?? extractNumberAfterLabel(normalized, 'Deuda total vigente')
    ?? extractNumberAfterLabel(normalized, 'Deuda total y estado de pago')
    ?? extractNumberAfterLabel(normalized, 'Deuda total')
    ?? extractNumberAfterLabel(normalized, 'Total vigente');
  
  // Buscar en secciones "Deuda Directa" y "Deuda Indirecta"
  const deudaDirectaMatch = normalized.match(/Deuda\s+Directa.*?Total\s+\$?\s*([\d.,]+)/is);
  const deudaIndirectaMatch = normalized.match(/Deuda\s+Indirecta.*?Total\s+\$?\s*([\d.,]+)/is);
  
  const deudaIndirecta = extractNumberAfterLabel(normalized, 'Deuda Indirecta')
    ?? extractNumberAfterLabel(normalized, 'Deuda indirecta')
    ?? (deudaIndirectaMatch ? parseFloat(deudaIndirectaMatch[1].replace(/\./g, '').replace(',', '.')) : null);
  
  // Si no encontramos deuda total directamente, intentar sumar Directa + Indirecta de las secciones
  if (deudaTotal === null && deudaDirectaMatch && deudaIndirectaMatch) {
    const directa = parseFloat(deudaDirectaMatch[1].replace(/\./g, '').replace(',', '.')) || 0;
    const indirecta = parseFloat(deudaIndirectaMatch[1].replace(/\./g, '').replace(',', '.')) || 0;
    deudaTotal = directa + indirecta;
  }
  
  // Número de instituciones: buscar "No registra información" para detectar 0
  let numInst = extractNumberAfterLabel(normalized, 'Número de Instituciones')
    ?? extractNumberAfterLabel(normalized, 'Número de instituciones')
    ?? (normalized.match(/instituciones?\s*[:\s]*(\d+)/i)?.[1] ? parseInt(normalized.match(/instituciones?\s*[:\s]*(\d+)/i)![1], 10) : null);
  
  // Si dice "No registra información para esta sección" en Deuda Directa, entonces 0 instituciones
  if (numInst === null && /No\s+registra\s+información\s+para\s+esta\s+sección/i.test(normalized)) {
    numInst = 0;
  }
  
  const rut = normalized.match(RUT_RE)?.[0];
  
  // Si detectamos que es un informe CMF (tiene las palabras clave) pero no encontramos valores, asumir $0
  // IMPORTANTE: Solo si también tiene RUT válido (evitar falsos positivos con cartolas)
  const isCmfDocument = /Informe\s+de\s+Deudas|CMF|Deuda\s+Directa|Deuda\s+Indirecta/i.test(normalized);
  if (isCmfDocument && rut && deudaTotal === null && deudaIndirecta === null) {
    // Documento CMF detectado con RUT válido pero sin valores: asumir $0 (perfil sin deudas)
    deudaTotal = 0;
  }
  
  // Si no hay RUT válido, no es un informe CMF válido (puede ser cartola u otro documento)
  if (!rut) return null;
  
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
 * Formato típico: fecha (dd/mm), número, sucursal, descripción, monto.
 * El texto extraído de PDFs tiene espacios múltiples entre palabras.
 * Mejorado para extraer RUT y saldos (Inicial/Final) del header.
 */
export function parseCartolaPdf(text: string): CartolaExtraida | null {
  const transacciones: CartolaExtraida['transacciones'] = [];
  
  // Extraer RUT del texto (formato 11.111.111-1)
  // Nota: el PDF puede tener RUT sin formato (ej: "55061" en cuenta) o con guiones incompletos
  // Primero buscar RUT con formato completo, luego intentar buscar cerca del nombre
  let rut = text.match(RUT_RE)?.[0];
  
  // Si no se encontró con el formato estándar, buscar cerca de nombre/email
  if (!rut) {
    const nombreMatch = text.match(/CASTELLANO\s+BANCHERO\s+IGNACIO/i);
    if (nombreMatch) {
      // Buscar RUT en un contexto de 200 caracteres alrededor del nombre
      const idx = nombreMatch.index!;
      const contexto = text.slice(Math.max(0, idx - 100), idx + 100);
      rut = contexto.match(RUT_RE)?.[0];
    }
  }
  
  // Extraer saldos (buscar "Saldo Inicial X ... Saldo Final Y")
  // En el header puede aparecer en formato: "880.681   988.918   1.101.917   993.680"
  // Donde las columnas son: Saldo Inicial | Cheques o Cargos | Depósitos o Abonos | Saldo Final
  let saldoInicial: number | undefined;
  let saldoFinal: number | undefined;
  
  // Buscar el patrón: "Saldo Inicial ... Saldo Final" seguido de 4 números
  const saldoHeaderMatch = text.match(/Saldo\s+Inicial.*?Saldo\s+Final.*?([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)/is);
  if (saldoHeaderMatch) {
    saldoInicial = parseFloat(saldoHeaderMatch[1].replace(/\./g, '').replace(',', '.'));
    saldoFinal = parseFloat(saldoHeaderMatch[4].replace(/\./g, '').replace(',', '.'));
  }
  
  // Inferir año de las fechas en la cartola (buscar "DESDE dd/mm/yyyy HASTA dd/mm/yyyy")
  let year = new Date().getFullYear();
  const periodoMatch = text.match(/DESDE\s+(\d{2})\/(\d{2})\/(\d{4})|(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2})\/(\d{2})\/(\d{4})/i);
  if (periodoMatch) {
    year = parseInt(periodoMatch[3] || periodoMatch[6], 10);
  }
  
  // Parse line by line. Each visual line from the PDF is now separated by \n
  // thanks to the Y-coordinate aware text extraction.
  //
  // Strategy:
  //  1. If a line starts with DD/MM, it's a new date block.
  //  2. Within a date block, each sub-line that starts with a 7-digit tx number
  //     is a separate transaction.
  //  3. Lines containing "--- Saldo Dia ---" or similar separators are skipped.

  const HEADER_RE = /CARTOLA|DESDE|HASTA|PAGINA|MENSAJES|INFORMESE|CUENTA\s+VISTA|ESTADO|RESUMEN|N\s*°\s*DOC|SUCURSAL|DESCRIPCION|CARGOS|ABONOS/i;
  const SALDO_DIA_RE = /---\s*Saldo\s+Dia/i;

  const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
  let currentDate = '';

  for (const line of lines) {
    if (HEADER_RE.test(line) || SALDO_DIA_RE.test(line)) continue;

    // Check if line starts with DD/MM — new date context
    const datePrefix = line.match(/^(\d{2})\/(\d{2})\s+(.*)/);
    if (datePrefix) {
      const [, d, m, rest] = datePrefix;
      currentDate = `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      parseTransactionsFromSegment(rest, currentDate, transacciones);
      continue;
    }

    // Line doesn't start with date — could still be a transaction within the current date
    if (currentDate && /^\d{5,}/.test(line)) {
      parseTransactionsFromSegment(line, currentDate, transacciones);
    }
  }

  function parseTransactionsFromSegment(
    segment: string,
    fecha: string,
    out: CartolaExtraida['transacciones']
  ) {
    // A segment may contain one or more transactions chained together.
    // Each transaction starts with a 6-8 digit doc number followed by a 2-4 digit branch.
    // Pattern: DOCNUM BRANCH description AMOUNT [DOCNUM BRANCH description AMOUNT ...]
    //
    // Split on transaction boundaries: look for a 6-8 digit number followed by 2-4 digits (branch)
    // that appears after an amount (digits with dots).
    const txBoundary = /(?<=[\d.]+)\s+(?=\d{6,8}\s+\d{2,4}\s)/g;
    const parts = segment.split(txBoundary);

    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;

      // Try to match: [DOCNUM BRANCH] description AMOUNT
      const txMatch = trimmed.match(/^(\d{6,8})\s+(\d{2,4})\s+(.*?)\s+([\d.]+(?:,\d{1,2})?)\s*$/);
      if (txMatch) {
        const [, , , desc, montoStr] = txMatch;
        addTransaction(desc, montoStr, fecha, out);
        continue;
      }

      // Fallback: just find description + trailing amount
      const simpleMatch = trimmed.match(/^(.+?)\s+([\d.]+(?:,\d{1,2})?)\s*$/);
      if (simpleMatch) {
        const [, desc, montoStr] = simpleMatch;
        const cleanDesc = desc.replace(/^\d{6,8}\s+\d{2,4}\s+/, '');
        if (cleanDesc.length >= 3) {
          addTransaction(cleanDesc, montoStr, fecha, out);
        }
      }
    }
  }

  function addTransaction(
    desc: string,
    montoStr: string,
    fecha: string,
    out: CartolaExtraida['transacciones']
  ) {
    // Strip leading doc number + branch if still present (e.g. "0211661437 93 Transf...")
    let descripcion = desc.replace(/^\d{6,10}\s+\d{2,4}\s+/, '').replace(/\s+/g, ' ').trim();
    if (descripcion.length < 3) return;
    if (HEADER_RE.test(descripcion)) return;

    const montoNum = parseFloat(montoStr.replace(/\./g, '').replace(',', '.'));
    if (isNaN(montoNum) || montoNum === 0) return;

    const esCargo = /Compra|Pago|Transf\.|Transf\s+a|PAGO|Carga|PAC|PAT|Giro/i.test(descripcion);
    const esAbono = /Transf\s+de|Dep[oó]sito|Abono|TEF\s+Cr/i.test(descripcion);

    out.push({
      fecha,
      descripcion: descripcion.slice(0, 200),
      cargo: esCargo ? montoNum : (!esAbono ? montoNum : 0),
      abono: esAbono ? montoNum : 0,
    });
  }
  
  // Si aún no hay transacciones, retornar null
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
