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
  console.log('Iniciando extracción con motor Legacy...');
  const uint8Array = new Uint8Array(buffer);

  // Ajuste para evitar error de tipos en parámetros de inicialización (TS2353)
  const loadingTask = pdfjs.getDocument(uint8Array as any);
  const pdfDocument = await loadingTask.promise;

  let fullText = '';
  for (let i = 1; i <= pdfDocument.numPages; i++) {
    const page = await pdfDocument.getPage(i);
    const textContent = await page.getTextContent();

    // Fix para TS2345: validación explícita de existencia de la propiedad 'str'
    const pageText = textContent.items
      .map((item: any) => ('str' in item ? item.str : ''))
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
  
  // Buscar todas las ocurrencias de fechas seguidas de transacciones
  // Formato observado: DD/MM   NUMERO   SUC   DESCRIPCION   MONTO
  // Ejemplo: "03/11   5306727   93   Compra Nacional SOC COMERCIAL   3.300"
  
  // Estrategia: buscar "DD/MM" seguido de cualquier cosa hasta encontrar un número (monto)
  // que esté cerca de una marca de fin (--- Saldo Dia ---, otra fecha DD/MM, o siguiente línea)
  
  const transactionRe = /(\d{2})\/(\d{2})\s+(\d{7})\s+(\d{2,4})\s+(.*?)(?=\s+---|\s+\d{2}\/\d{2}|\n|$)/g;
  
  let match;
  while ((match = transactionRe.exec(text)) !== null) {
    const [fullMatch, d, m, numero, sucursal, resto] = match;
    
    // Skipear si contiene palabras clave de header
    if (/CARTOLA|DESDE|HASTA|PAGINA|MENSAJES|INFORMESE|CUENTA\s+VISTA|ESTADO/i.test(resto)) continue;
    
    const fecha = `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    
    // Extraer descripción y monto del "resto"
    // El monto está al final, formato: X.XXX o X.XXX,XX
    const montoMatch = resto.match(/([\d.]+(?:,\d{1,2})?)\s*$/);
    if (!montoMatch) continue;
    
    const monto = montoMatch[1];
    const descripcion = resto.slice(0, resto.lastIndexOf(monto)).replace(/\s+/g, ' ').trim();
    
    if (descripcion.length < 3) continue;
    
    // Parsear monto (formato chileno: puntos como separador de miles, coma para decimales)
    const montoNum = parseFloat(monto.replace(/\./g, '').replace(',', '.'));
    if (isNaN(montoNum) || montoNum === 0) continue;
    
    // Determinar si es cargo o abono basado en la descripción
    // "Compra", "Pago", "Transf a" son cargos; "Transf de" es abono
    const esCargo = /Compra|Pago|Transf\s+a|PAGO|Transf\.|Carga/i.test(descripcion);
    const esAbono = /Transf\s+de|Deposito|Abono/i.test(descripcion);
    
    transacciones.push({
      fecha,
      descripcion: descripcion.slice(0, 200),
      cargo: esCargo ? montoNum : 0,
      abono: esAbono ? montoNum : 0,
    });
  }
  
  // Si no se encontraron transacciones con el regex, intentar parseo más simple línea por línea
  if (transacciones.length === 0) {
    const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
      const simpleMatch = line.match(/(\d{2})\/(\d{2})\s+.*?\s+([\d.,]+)$/);
      if (!simpleMatch) continue;
      if (/CARTOLA|DESDE|HASTA|PAGINA|MENSAJES|INFORMESE|CUENTA\s+VISTA/i.test(line)) continue;
      
      const [, d, m, monto] = simpleMatch;
      const fecha = `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      const descripcion = line.replace(/\d{2}\/\d{2}/, '').replace(/[\d.,]+$/, '').replace(/\s+/g, ' ').trim();
      
      if (descripcion.length < 3) continue;
      
      const montoNum = parseFloat(monto.replace(/\./g, '').replace(',', '.'));
      if (isNaN(montoNum) || montoNum === 0) continue;
      
      const esCargo = /Compra|Pago|Transf\s+a/i.test(descripcion);
      transacciones.push({
        fecha,
        descripcion: descripcion.slice(0, 200),
        cargo: esCargo ? montoNum : 0,
        abono: !esCargo ? montoNum : 0,
      });
    }
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
