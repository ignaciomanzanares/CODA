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
 * Extracción de texto con coordenadas X por item.
 * Devuelve líneas agrupadas por Y y, para cada línea, los items con posición X.
 * Esto permite al parser de cartolas aislar columnas (fecha, descripción, monto, saldo).
 */
export interface PdfLineItem { str: string; x: number; }
export interface PdfLine { items: PdfLineItem[]; text: string; y: number; }

export async function extractPdfText(buffer: Buffer): Promise<{ text: string; numPages: number; lines: PdfLine[] }> {
  const uint8Array = new Uint8Array(buffer);

  const loadingTask = pdfjs.getDocument(uint8Array as any);
  const pdfDocument = await loadingTask.promise;

  let fullText = '';
  const allLines: PdfLine[] = [];

  for (let i = 1; i <= pdfDocument.numPages; i++) {
    const page = await pdfDocument.getPage(i);
    const textContent = await page.getTextContent();

    const items = textContent.items
      .filter((item: any) => 'str' in item && item.str.trim() !== '')
      .map((item: any) => ({
        str: item.str as string,
        x: (item.transform?.[4] ?? 0) as number,
        y: (item.transform?.[5] ?? 0) as number,
      }));

    if (items.length === 0) continue;

    // Sort by Y descending (top of page first), then X ascending (left to right)
    items.sort((a: any, b: any) => {
      const yDiff = b.y - a.y;
      if (Math.abs(yDiff) > 2) return yDiff;
      return a.x - b.x;
    });

    // Group into lines by Y (3pt tolerance)
    let currentY = items[0].y;
    let currentLineItems: PdfLineItem[] = [{ str: items[0].str, x: items[0].x }];

    for (let j = 1; j < items.length; j++) {
      if (Math.abs(items[j].y - currentY) <= 3) {
        currentLineItems.push({ str: items[j].str, x: items[j].x });
      } else {
        const lineText = currentLineItems.map(it => it.str).join(' ');
        fullText += lineText + '\n';
        allLines.push({ items: currentLineItems, text: lineText, y: currentY });
        currentY = items[j].y;
        currentLineItems = [{ str: items[j].str, x: items[j].x }];
      }
    }
    const lineText = currentLineItems.map(it => it.str).join(' ');
    fullText += lineText + '\n';
    allLines.push({ items: currentLineItems, text: lineText, y: currentY });
  }

  return {
    text: fullText,
    numPages: pdfDocument.numPages,
    lines: allLines,
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
 * Parsea texto de una cartola bancaria chilena.
 *
 * Soporta: Santander, BCI, Banco de Chile, Scotiabank, Itaú, BICE, Security, BancoEstado.
 *
 * Estrategia robusta:
 *  1. Detección de secciones: "Cheques y Cargos" → egresos, "Depósitos y Abonos" → ingresos.
 *  2. Cada línea se analiza buscando: [FECHA] [NDOC] [SUCURSAL] [DESCRIPCIÓN] [MONTO] [SALDO]
 *     Los montos CLP se reconocen por formato 1.234.567 (puntos de miles, coma decimal opcional).
 *     Se aíslan del final de la línea: último = saldo, penúltimo = monto.
 *  3. Fechas en hora 12:00:00 local para evitar desfase de zona horaria.
 *  4. Limpieza de descripción: quita doc numbers, sucursal, oficina, montos sueltos.
 *  5. Prueba de integridad: saldo_prev + abono − cargo ≈ saldo_actual; auto-corrige swap.
 */
export function parseCartolaPdf(text: string): CartolaExtraida | null {
  const transacciones: CartolaExtraida['transacciones'] = [];

  // ── RUT ────────────────────────────────────────────────────────────────────
  let rut = text.match(RUT_RE)?.[0];
  if (!rut) {
    const idx = text.search(/[A-ZÁÉÍÓÚÑ]{3,}\s+[A-ZÁÉÍÓÚÑ]{3,}/);
    if (idx !== -1) {
      const ctx = text.slice(Math.max(0, idx - 120), idx + 120);
      rut = ctx.match(RUT_RE)?.[0];
    }
  }

  // ── Saldos globales del resumen ─────────────────────────────────────────────
  let saldoInicial: number | undefined;
  let saldoFinal: number | undefined;

  // Santander format: "Saldo Inicial ... Saldo Final ... N1 N2 N3 N4"
  const saldoHeaderMatch = text.match(
    /Saldo\s+Inicial.*?Saldo\s+Final.*?([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)/is
  );
  if (saldoHeaderMatch) {
    saldoInicial = parseChile(saldoHeaderMatch[1]);
    saldoFinal   = parseChile(saldoHeaderMatch[4]);
  }
  // BCI/Banco de Chile format: "Saldo Anterior: $1.234.567" / "Saldo Final: $1.234.567"
  if (saldoInicial === undefined) {
    const saMatch = text.match(/Saldo\s+(?:Anterior|Inicial)\s*[:\$]\s*\$?\s*([\d.,]+)/i);
    if (saMatch) saldoInicial = parseChile(saMatch[1]);
  }
  if (saldoFinal === undefined) {
    const sfMatch = text.match(/Saldo\s+Final\s*[:\$]\s*\$?\s*([\d.,]+)/i);
    if (sfMatch) saldoFinal = parseChile(sfMatch[1]);
  }

  // ── Año del período ─────────────────────────────────────────────────────────
  const year = extractYear(text);

  // ── Regexes de control ─────────────────────────────────────────────────────
  const HEADER_RE = /^(?:CARTOLA|DESDE|HASTA|P[AÁ]GINA|MENSAJES|INF[ÓO]RMESE|CUENTA\s+VISTA|CUENTA\s+CORRIENTE|ESTADO\s+DE\s+CUENTA|RESUMEN|N[°º]\s*DOC|SUCURSAL|DESCRIPCI[ÓO]N|FECHA|CHEQUES\s+O\s+CARGOS|DEP[ÓO]SITOS\s+O\s+ABONOS|DETALLE\s+DE\s+MOVIMIENTOS|MOVIMIENTOS\s+DEL\s+PER[IÍ]ODO|BANCO\s+|WWW\.|FOLIO|COMPROBANTE|RUT\s|NOMBRE|PRODUCTO|MONEDA|TIPO\s+CUENTA)\b/i;
  const SALDO_DIA_RE = /---\s*Saldo\s+Dia|Saldo\s+al\s+d[ií]a|SUBTOTAL|TOTAL\s+CARGOS|TOTAL\s+ABONOS|TOTAL\s+DEP[OÓ]SITOS|TOTAL\s+CHEQUES/i;

  // Detectores de sección (multi-banco)
  const SECTION_CARGO_RE = /CHEQUES?\s+[YO]\s+CARGOS?|CARGOS?\s+[YO]\s+CHEQUES?|CARGOS\s+DEL\s+PER[IÍ]ODO|EGRESOS|MOVIMIENTOS\s+DE\s+(?:D[EÉ]BITO|CARGO)/i;
  const SECTION_ABONO_RE = /DEP[ÓO]SITOS?\s+[YO]\s+ABONOS?|ABONOS?\s+[YO]\s+DEP[ÓO]SITOS?|ABONOS\s+DEL\s+PER[IÍ]ODO|INGRESOS|MOVIMIENTOS\s+DE\s+(?:CR[EÉ]DITO|ABONO)/i;

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function parseChile(s: string): number {
    return parseFloat(s.replace(/\./g, '').replace(',', '.'));
  }

  /** Reconoce un monto CLP: 1.234 / 12.345 / 1.234.567 / con coma decimal */
  const CLP_RE = /\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?/g;

  /**
   * Extrae los últimos N montos CLP de una línea de texto.
   * Devuelve {monto, saldo} donde:
   *   - Si hay 2+ montos: penúltimo = monto, último = saldo
   *   - Si hay 1 monto: es el monto, sin saldo
   */
  function extractAmounts(line: string): { monto: number; saldo: number | undefined } {
    const matches = Array.from(line.matchAll(CLP_RE));
    const nums = matches
      .map(m => ({ val: parseChile(m[0]), idx: m.index! }))
      .filter(n => !isNaN(n.val) && n.val >= 10);

    if (nums.length === 0) return { monto: 0, saldo: undefined };
    if (nums.length === 1) return { monto: nums[0].val, saldo: undefined };

    // Último = saldo, penúltimo = monto operación
    return {
      monto: nums[nums.length - 2].val,
      saldo: nums[nums.length - 1].val,
    };
  }

  /**
   * Limpia la descripción: quita doc numbers, sucursal, oficina, montos sueltos.
   * Debe producir texto legible como "Compra Nacional STARBUCKS" o "Transf a JUAN PEREZ".
   */
  function cleanDescription(raw: string): string {
    let d = raw.replace(/\s+/g, ' ').trim();

    // Quitar prefijos de oficina: "O.Gerencia", "S.Central", etc.
    d = d.replace(/^[A-Z]\.[A-Za-záéíóúñÁÉÍÓÚÑ]+\s+/, '');

    // Quitar SUCURSAL(1-4d) + NDOC(7-12d): "93 0222260043 Transf..."
    d = d.replace(/^\d{1,4}\s+\d{7,12}\s+/, '');

    // Quitar NDOC(6-12d) + campo extra: "0650447700 3 Transf..."
    d = d.replace(/^\d{6,12}\s+\d{1,6}\s+/, '');

    // Quitar NDOC solo: "0650447700 Transf..." → "Transf..."
    d = d.replace(/^\d{6,12}\s+/, '');

    // Quitar cualquier token numérico al inicio
    d = d.replace(/^(?:\d+\s+)+/, '');

    // Quitar montos CLP que se colaron al final: "... 11.000" / "... 1.234.567,00"
    d = d.replace(/\s+\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?\s*$/, '');
    // Repetir (puede haber monto + saldo)
    d = d.replace(/\s+\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?\s*$/, '');

    // Quitar standalone large number al final (sub-doc): "... 0222260043"
    d = d.replace(/\s+\d{5,12}\s*$/, '');

    // Quitar "$" sueltos
    d = d.replace(/\$\s*/g, '');

    return d.replace(/\s+/g, ' ').trim();
  }

  // ── Loop principal ──────────────────────────────────────────────────────────
  type SectionCtx = 'cargo' | 'abono' | null;
  let currentSection: SectionCtx = null;
  let currentDate = '';

  const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);

  for (const line of lines) {
    // ── Detectar sección ANTES del filtro de header ──
    if (SECTION_CARGO_RE.test(line)) { currentSection = 'cargo'; continue; }
    if (SECTION_ABONO_RE.test(line)) { currentSection = 'abono'; continue; }
    if (HEADER_RE.test(line) || SALDO_DIA_RE.test(line)) continue;

    // ── Detectar fecha al inicio de la línea ──
    // Formato DD/MM, DD/MM/YY, DD/MM/YYYY, DD-MM-YYYY
    const dateMatch = line.match(/^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\s+(.*)/);
    if (dateMatch) {
      const [, dayStr, monthStr, yearStr, rest] = dateMatch;
      const day   = Math.min(31, Math.max(1, parseInt(dayStr, 10)));
      const month = Math.min(12, Math.max(1, parseInt(monthStr, 10)));
      let y = year;
      if (yearStr) {
        y = yearStr.length === 2 ? 2000 + parseInt(yearStr, 10) : parseInt(yearStr, 10);
        if (y < 2015 || y > new Date().getFullYear() + 1) y = year;
      }
      currentDate = `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      processLine(rest, currentDate, currentSection);
      continue;
    }

    // Línea sin fecha: doc number al inicio → continúa fecha actual
    if (currentDate && /^\d{4,}/.test(line)) {
      processLine(line, currentDate, currentSection);
      continue;
    }

    // Línea sin fecha ni doc number pero con al menos un monto CLP y texto → podría ser continuación
    if (currentDate && CLP_RE.test(line) && /[A-Za-záéíóúñ]{3,}/.test(line)) {
      processLine(line, currentDate, currentSection);
    }
  }

  // ── processLine: extrae descripción y monto de una línea individual ────────
  function processLine(line: string, fecha: string, section: SectionCtx) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length < 3) return;

    // Extraer montos CLP del final de la línea
    const { monto, saldo } = extractAmounts(trimmed);
    if (!monto || monto <= 0) return;

    // Extraer descripción: lo que NO es montos al final
    // Quitar todos los montos CLP del string para obtener la descripción limpia
    let rawDesc = trimmed;
    // Eliminar los montos CLP encontrados al final (de derecha a izquierda)
    const clpMatches = Array.from(trimmed.matchAll(CLP_RE));
    if (clpMatches.length > 0) {
      // Encontrar el primer match que sea parte de los montos (no de un doc number)
      // Simplificación: quitar todo desde el inicio del penúltimo o último match CLP
      const lastIdx = clpMatches[clpMatches.length - 1].index!;
      const secondLastIdx = clpMatches.length >= 2 ? clpMatches[clpMatches.length - 2].index! : lastIdx;
      rawDesc = trimmed.slice(0, secondLastIdx).trim();
    }

    const descripcion = cleanDescription(rawDesc);
    if (descripcion.length < 3) return;
    if (/^\d+$/.test(descripcion)) return; // puro número

    // ── Determinar tipo ──
    let tipo: 'cargo' | 'abono';
    if (section === 'cargo') {
      tipo = 'cargo';
    } else if (section === 'abono') {
      tipo = 'abono';
    } else {
      // Sin contexto de sección: inferir por keywords
      const esCargo  = /Compra|Pago\s|Transf\.?\s+a\s|Traspaso\s+a\s|Carga\s|PAC\s|PAT\s|Giro\s|Cobro\s|D[eé]bito|Cargo\s|Ret(?:iro)?\.?\s/i.test(descripcion);
      const esAbono  = /Transf\.?\s+de\s|Traspaso\s+de\s|Dep[oó]sito|Abono|TEF\s+Cr|Traspaso\s+Autom|Cr[eé]dito|Remuneraci[oó]n|Sueldo|Bono\s/i.test(descripcion);
      if (esCargo && !esAbono)      tipo = 'cargo';
      else if (esAbono && !esCargo) tipo = 'abono';
      else if (esCargo && esAbono)  tipo = 'cargo'; // ambiguous → default cargo
      else return; // no keyword match, skip to avoid wrong classification
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
  if (saldoInicial !== undefined) {
    let running = saldoInicial;
    for (const tx of transacciones) {
      if (tx.saldo === undefined) { running += tx.abono - tx.cargo; continue; }
      const expected = running + tx.abono - tx.cargo;
      if (Math.abs(expected - tx.saldo) > 1) {
        // Posible swap monto↔saldo: intentar corregir
        const altMonto = tx.saldo;
        const altSaldo = tx.cargo > 0 ? tx.cargo : tx.abono;
        const altExpected = running + (tx.abono > 0 ? altMonto : 0) - (tx.cargo > 0 ? altMonto : 0);
        if (Math.abs(altExpected - altSaldo) <= 1) {
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

/** Extrae el año del período desde el texto de la cartola. */
function extractYear(text: string): number {
  const nowYear = new Date().getFullYear();
  let year = nowYear;

  const patterns: RegExp[] = [
    /HASTA\s*(\d{2})\/(\d{2})\/(\d{4})/i,
    /DESDE\s*(\d{2})\/(\d{2})\/(\d{4})/i,
    /\bAL\s+(\d{2})\/(\d{2})\/(\d{4})/i,
    /[Pp]er[ií]odo[:\s]+(?:\d{2}\/\d{2}\/\d{4}\s*[-–a]\s*)?(\d{2})\/(\d{2})\/(\d{4})/,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (!m) continue;
    const y = parseInt(m[3], 10);
    if (y >= 2015 && y <= nowYear + 1) { year = y; break; }
  }

  if (year === nowYear) {
    const shortPatterns: RegExp[] = [
      /HASTA\s*(\d{2})\/(\d{2})\/(\d{2})\b/i,
      /DESDE\s*(\d{2})\/(\d{2})\/(\d{2})\b/i,
      /\bAL\s+(\d{2})\/(\d{2})\/(\d{2})\b/i,
    ];
    for (const re of shortPatterns) {
      const m = text.match(re);
      if (!m) continue;
      const y = 2000 + parseInt(m[3], 10);
      if (y >= 2015 && y <= nowYear + 1) { year = y; break; }
    }
  }

  if (year === nowYear) {
    const monthYear = text.match(
      /(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+(202[0-9]|201[5-9])/i
    );
    if (monthYear) {
      const y = parseInt(monthYear[1], 10);
      if (y >= 2015 && y <= nowYear + 1) year = y;
    }
  }

  if (year === nowYear) {
    const allYears = text.match(/\b(201[5-9]|202[0-9])\b/g);
    if (allYears) {
      const candidates = allYears.map(s => parseInt(s, 10)).filter(y => y >= 2015 && y <= nowYear);
      if (candidates.length > 0) year = Math.max(...candidates);
    }
  }

  return Math.min(nowYear, Math.max(2015, year));
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
