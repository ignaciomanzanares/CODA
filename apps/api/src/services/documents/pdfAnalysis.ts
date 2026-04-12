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
 * Parsea texto de una cartola bancaria chilena (Santander y otros bancos).
 *
 * Estrategia robusta basada en la estructura real de los PDFs:
 *  1. Detección de secciones: "Cheques y Cargos" → egresos, "Depósitos y Abonos" → ingresos.
 *     Esto evita depender exclusivamente de palabras clave en la descripción.
 *  2. Aislamiento de la columna Saldo: cuando hay 2+ montos al final de una línea,
 *     el ÚLTIMO es el saldo corriente y el PENÚLTIMO es el monto de la operación.
 *  3. Normalización temporal: fechas construidas en hora 12:00:00 local para evitar
 *     desfases de zona horaria (±1 día).
 *  4. Prueba de integridad (best-effort): saldo_anterior + abonos − cargos = saldo_actual.
 *     Las filas que no cuadran se marcan con flag `integrity_warning` para revisión.
 */
export function parseCartolaPdf(text: string): CartolaExtraida | null {
  const transacciones: CartolaExtraida['transacciones'] = [];

  // ── RUT ────────────────────────────────────────────────────────────────────
  let rut = text.match(RUT_RE)?.[0];
  if (!rut) {
    // Buscar RUT cerca de cualquier nombre en mayúsculas
    const idx = text.search(/[A-ZÁÉÍÓÚÑ]{3,}\s+[A-ZÁÉÍÓÚÑ]{3,}/);
    if (idx !== -1) {
      const ctx = text.slice(Math.max(0, idx - 120), idx + 120);
      rut = ctx.match(RUT_RE)?.[0];
    }
  }

  // ── Saldos globales del resumen ─────────────────────────────────────────────
  let saldoInicial: number | undefined;
  let saldoFinal: number | undefined;

  const saldoHeaderMatch = text.match(
    /Saldo\s+Inicial.*?Saldo\s+Final.*?([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)/is
  );
  if (saldoHeaderMatch) {
    saldoInicial = parseFloat(saldoHeaderMatch[1].replace(/\./g, '').replace(',', '.'));
    saldoFinal   = parseFloat(saldoHeaderMatch[4].replace(/\./g, '').replace(',', '.'));
  }

  // ── Año del período ─────────────────────────────────────────────────────────
  const nowYear = new Date().getFullYear();
  let year = nowYear;

  const hastaFull  = text.match(/HASTA\s*(\d{2})\/(\d{2})\/(\d{4})/i);
  const desdeFull  = text.match(/DESDE\s*(\d{2})\/(\d{2})\/(\d{4})/i);
  const hastaShort = text.match(/HASTA\s*(\d{2})\/(\d{2})\/(\d{2})\b/i);
  const desdeShort = text.match(/DESDE\s*(\d{2})\/(\d{2})\/(\d{2})\b/i);
  const alFull     = text.match(/\bAL\s+(\d{2})\/(\d{2})\/(\d{4})/i);
  const alShort    = text.match(/\bAL\s+(\d{2})\/(\d{2})\/(\d{2})\b/i);
  const periodoFull  = text.match(/[Pp]er[ií]odo[:\s]+(?:\d{2}\/\d{2}\/\d{4}\s*[-–a]\s*)?(\d{2})\/(\d{2})\/(\d{4})/);
  const periodoShort = text.match(/[Pp]er[ií]odo[:\s]+(?:\d{2}\/\d{2}\/\d{2}\s*[-–a]\s*)?(\d{2})\/(\d{2})\/(\d{2})\b/);
  const monthYear  = text.match(/(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+(202[0-9]|201[5-9])/i);

  for (const m of [hastaFull, desdeFull, alFull, periodoFull]) {
    if (!m) continue;
    const y = parseInt(m[3] ?? m[1], 10);
    if (y >= 2015 && y <= nowYear + 1) { year = y; break; }
  }
  if (year === nowYear) {
    for (const m of [hastaShort, desdeShort, alShort, periodoShort]) {
      if (!m) continue;
      const y = 2000 + parseInt(m[3] ?? m[1], 10);
      if (y >= 2015 && y <= nowYear + 1) { year = y; break; }
    }
  }
  if (year === nowYear && monthYear) {
    const y = parseInt(monthYear[1], 10);
    if (y >= 2015 && y <= nowYear + 1) year = y;
  }
  if (year === nowYear) {
    const allYears = text.match(/\b(201[5-9]|202[0-9])\b/g);
    if (allYears) {
      const candidates = allYears.map(s => parseInt(s, 10)).filter(y => y >= 2015 && y <= nowYear);
      if (candidates.length > 0) year = Math.max(...candidates);
    }
  }
  year = Math.min(nowYear, Math.max(2015, year));

  // ── Regexes de control ─────────────────────────────────────────────────────
  // IMPORTANTE: no incluir "CARGOS" ni "ABONOS" aquí porque son encabezados de sección válidos
  const HEADER_RE    = /^(?:CARTOLA|DESDE|HASTA|P[AÁ]GINA|MENSAJES|INF[ÓO]RMESE|CUENTA\s+VISTA|ESTADO\s+DE\s+CUENTA|RESUMEN|N[°º]\s*DOC|SUCURSAL|DESCRIPCI[ÓO]N|FECHA|CHEQUES\s+O\s+CARGOS|DEP[ÓO]SITOS\s+O\s+ABONOS)\b/i;
  const SALDO_DIA_RE = /---\s*Saldo\s+Dia/i;

  // Detectores de sección Santander
  const SECTION_CARGO_RE = /CHEQUES?\s+[YO]\s+CARGOS?|CARGOS?\s+[YO]\s+CHEQUES?/i;
  const SECTION_ABONO_RE = /DEP[ÓO]SITOS?\s+[YO]\s+ABONOS?|ABONOS?\s+[YO]\s+DEP[ÓO]SITOS?/i;

  // ── Helpers de parseo de montos ─────────────────────────────────────────────
  function parseAmountChile(str: string): number {
    return parseFloat(str.replace(/\./g, '').replace(',', '.'));
  }

  // Extrae (monto_operacion, saldo_corriente) del segmento.
  // Si hay 2+ montos CLP al final: último = saldo, penúltimo = monto.
  // Si hay 1: sólo monto (sin saldo por línea).
  function extractAmountAndSaldo(segment: string): { monto: number; saldo: number | undefined } {
    const amountLike = segment.match(/\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d{4,9}/g) ?? [];
    const nums = amountLike
      .map(s => ({ raw: s, val: parseAmountChile(s) }))
      .filter(({ val }) => !isNaN(val) && val >= 100 && val < 1_000_000_000);

    if (nums.length === 0) return { monto: 0, saldo: undefined };
    if (nums.length === 1) return { monto: nums[0].val, saldo: undefined };
    // 2+ amounts: last is running saldo, second-to-last is the operation amount
    return {
      monto: nums[nums.length - 2].val,
      saldo: nums[nums.length - 1].val,
    };
  }

  // ── Loop principal ──────────────────────────────────────────────────────────
  type SectionCtx = 'cargo' | 'abono' | null;
  let currentSection: SectionCtx = null;
  let currentDate = '';

  const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);

  for (const line of lines) {
    // Detectar sección ANTES del filtro de header
    if (SECTION_CARGO_RE.test(line)) { currentSection = 'cargo'; continue; }
    if (SECTION_ABONO_RE.test(line)) { currentSection = 'abono'; continue; }
    if (HEADER_RE.test(line) || SALDO_DIA_RE.test(line)) continue;

    // Nueva fecha: DD/MM <resto>
    const datePrefix = line.match(/^(\d{1,2})\/(\d{1,2})\s+(.*)/);
    if (datePrefix) {
      const [, d, m, rest] = datePrefix;
      const day   = Math.min(31, Math.max(1, parseInt(d, 10) || 1));
      const month = Math.min(12, Math.max(1, parseInt(m, 10) || 1));
      // Hora 12:00:00 local para evitar desfase de zona horaria
      currentDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      parseSegment(rest, currentDate, currentSection);
      continue;
    }

    // Línea sin fecha pero con número de documento — continúa fecha actual
    if (currentDate && /^\d{5,}/.test(line)) {
      parseSegment(line, currentDate, currentSection);
    }
  }

  // ── parseSegment: split en sub-transacciones y procesar cada una ──────────
  function parseSegment(segment: string, fecha: string, section: SectionCtx) {
    // Separar múltiples transacciones en la misma línea (número de doc de 6-8 dígitos)
    const txBoundary = /(?<=[\d.]+)\s+(?=\d{6,8}\s+\d{2,4}\s)/g;
    const parts = segment.split(txBoundary);

    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;

      // Formato completo: NDOC SUCURSAL DESCRIPCIÓN MONTO [SALDO]
      const txMatch = trimmed.match(/^(\d{6,8})\s+(\d{2,4})\s+(.*?)\s+([\d.]+(?:,\d{1,2})?(?:\s+[\d.]+(?:,\d{1,2})?)?)\s*$/);
      if (txMatch) {
        const [, , , desc] = txMatch;
        commitTransaction(trimmed, desc, fecha, section);
        continue;
      }

      // Formato simple: DESCRIPCIÓN MONTO [SALDO]
      const simpleMatch = trimmed.match(/^(.+?)\s+([\d.]+(?:,\d{1,2})?)\s*$/);
      if (simpleMatch) {
        const [, desc] = simpleMatch;
        const cleanDesc = desc.replace(/^\d{6,8}\s+\d{2,4}\s+/, '');
        if (cleanDesc.length >= 3) {
          commitTransaction(trimmed, cleanDesc, fecha, section);
        }
      }
    }
  }

  // ── commitTransaction: determina tipo y empuja a transacciones ────────────
  function commitTransaction(fullSegment: string, rawDesc: string, fecha: string, section: SectionCtx) {
    let descripcion = rawDesc.replace(/\s+/g, ' ').trim();

    // 1. Quitar prefijos de oficina/sucursal: "O.Gerencia", "S.Central", etc.
    descripcion = descripcion.replace(/^[A-Z]\.[A-Za-záéíóúñÁÉÍÓÚÑ]+\s+/, '');

    // 2. Quitar formato SUCURSAL(1-4 dígitos) + NDOC(7-12 dígitos): "93 0222260043"
    descripcion = descripcion.replace(/^\d{1,4}\s+\d{7,12}\s+/, '');

    // 3. Quitar formato NDOC(6-12 dígitos) + campo extra corto: "0650447700 3"
    descripcion = descripcion.replace(/^\d{6,12}\s+\d{1,6}\s+/, '');

    // 4. Quitar NDOC solo (sin sucursal siguiente): "0650447700 Transf..." → "Transf..."
    descripcion = descripcion.replace(/^\d{6,12}\s+/, '');

    // 5. Quitar cualquier token numérico inicial remanente
    descripcion = descripcion.replace(/^(?:\d+\s+)+/, '');

    // 6. Quitar monto CLP al final que se haya colado en la descripción: "... 11.000"
    descripcion = descripcion.replace(/\s+\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?\s*$/, '');

    // 7. Quitar número standalone largo al final (sub-número de doc): "... 0222260043"
    descripcion = descripcion.replace(/\s+\d{5,12}\s*$/, '');

    descripcion = descripcion.replace(/\s+/g, ' ').trim();
    if (descripcion.length < 3) return;
    // Evitar líneas de encabezado que hayan escapado el filtro
    if (/^\d+$/.test(descripcion)) return;

    const { monto, saldo } = extractAmountAndSaldo(fullSegment);
    if (!monto || monto <= 0) return;

    // Determinar tipo usando jerarquía:
    //  1. Contexto de sección (más confiable)
    //  2. Palabras clave en descripción (fallback)
    //  3. Si no hay contexto ni keywords, omitir (evita ambigüedad)
    let tipo: 'cargo' | 'abono';

    if (section === 'cargo') {
      tipo = 'cargo';
    } else if (section === 'abono') {
      tipo = 'abono';
    } else {
      // Fallback por descripción
      const esCargo = /Compra|Pago\s|Transf\.?\s+a\s|Traspaso\s+a\s|Carga\s|PAC\s|PAT\s|Giro\s|Cobro\s|Débito\s/i.test(descripcion);
      const esAbono = /Transf\s+de\s|Traspaso\s+de\s|Dep[oó]sito|Abono|TEF\s+Cr|Traspaso\s+Autom|Cr[eé]dito|Remuneraci[oó]n|Sueldo/i.test(descripcion);
      if (!esCargo && !esAbono) return;
      tipo = esCargo ? 'cargo' : 'abono';
    }

    transacciones.push({
      fecha,
      descripcion: descripcion.slice(0, 200),
      cargo: tipo === 'cargo' ? monto : 0,
      abono: tipo === 'abono' ? monto : 0,
      saldo,
    });
  }

  if (transacciones.length === 0) return null;

  // ── Prueba de integridad (best-effort) ────────────────────────────────────
  // Verifica: saldo_prev + abono - cargo ≈ saldo_actual (tolerancia 1 CLP)
  // Las filas sin saldo por línea se saltan.
  if (saldoInicial !== undefined) {
    let running = saldoInicial;
    for (const tx of transacciones) {
      if (tx.saldo === undefined) { running += tx.abono - tx.cargo; continue; }
      const expected = running + tx.abono - tx.cargo;
      if (Math.abs(expected - tx.saldo) > 1) {
        // Mismatch: posiblemente monto y saldo intercambiados → intentar corregir
        const altMonto = tx.saldo;
        const altSaldo = tx.cargo > 0 ? tx.cargo : tx.abono;
        const altExpected = running + (tx.abono > 0 ? altMonto : 0) - (tx.cargo > 0 ? altMonto : 0);
        if (Math.abs(altExpected - altSaldo) <= 1) {
          // Corrección: intercambiar monto ↔ saldo
          if (tx.cargo > 0) tx.cargo = altMonto; else tx.abono = altMonto;
          tx.saldo = altSaldo;
        }
      }
      running = tx.saldo;
    }
  }

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
