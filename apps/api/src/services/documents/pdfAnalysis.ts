/**
 * Análisis de PDFs: Informe CMF (Deudas) y Cartolas Bancarias.
 * Referencia: Informe de Deudas CMF (Deuda Total Vigente, Deuda Indirecta, Número de Instituciones).
 * Cartolas: mapeo a SFA según schema_csv (Información transaccional, Productos vigentes).
 * Motor de extracción: pdfjs-dist/legacy (Node.js/Render, evita DOMMatrix).
 */

// Importamos la versión legacy optimizada para Node.js
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { SfaTransaccionCuenta, SfaProductoVigenteCuenta } from '../../sfa/types.js';
import { parseCLP } from '../../utils/clp.js';

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
    categoria?: string;
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
  // Primary: match Chilean-format monetary string (dots = thousands, optional comma decimal)
  const match = slice.match(/\$?\s*([\d.,]+)\s*(?:UF|CLP|pesos)?/);
  if (match) {
    const val = parseCLP(match[1]);
    return val > 0 ? val : null;
  }
  // Fallback: extract first run of digits only (no dots — avoids thousands-separator misparse)
  const onlyDigits = slice.replace(/[^\d]/g, ' ');
  const num = onlyDigits.trim().split(/\s+/).find(s => s.length > 0);
  return num ? parseInt(num, 10) : null;
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
    ?? (deudaIndirectaMatch ? parseCLP(deudaIndirectaMatch[1]) : null);

  // Si no encontramos deuda total directamente, intentar sumar Directa + Indirecta de las secciones
  if (deudaTotal === null && deudaDirectaMatch && deudaIndirectaMatch) {
    const directa = parseCLP(deudaDirectaMatch[1]);
    const indirecta = parseCLP(deudaIndirectaMatch[1]);
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
 *  1. **Columnar detection (primary)**: Detects column X positions from headers like
 *     "CHEQUES Y CARGOS" (x~321) vs "DEPOSITOS Y ABONOS" (x~406). Amounts are classified
 *     based on which column they fall into by their X coordinate.
 *  2. **Section-based fallback**: "Cheques y Cargos" → egresos, "Depósitos y Abonos" → ingresos.
 *  3. **Keyword inference**: last resort when no column/section info available.
 *  4. Limpieza de descripción: quita doc numbers, sucursal, oficina, montos sueltos.
 *  5. Prueba de integridad: saldo_prev + abono − cargo ≈ saldo_actual; auto-corrige swap.
 */
export function parseCartolaPdf(text: string, pdfLines?: PdfLine[]): CartolaExtraida | null {
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

  // Strategy 1 — Santander header row + values row (4-col or 7-col layout).
  // The header row ends with "Saldo Final"; the values row follows on the next
  // line (or immediately inline). We extract ALL numbers from the values row
  // and treat the FIRST as saldoInicial and the LAST as saldoFinal.
  // This handles both the classic 4-col layout (saldoInicial, cargos, abonos,
  // saldoFinal) and the Sep-2025 7-col layout (saldoInicial, depositos,
  // otrosAbonos, cheques, otrosCargos, impuestos, saldoFinal).
  const saldoHdrMatch = text.match(/Saldo\s+Inicial[^\n]*Saldo\s+Final[^\n]*/i);
  if (saldoHdrMatch && saldoHdrMatch.index !== undefined) {
    const afterHdr = text.slice(saldoHdrMatch.index + saldoHdrMatch[0].length);
    // Capture numbers on the same or immediately following line (no cross-line matching)
    const valRow = afterHdr.match(/^[ \t]*\n?([\d.,]+(?:[ \t]+[\d.,]+)*)/);
    if (valRow) {
      const nums = valRow[1].match(/[\d.,]+/g) ?? [];
      if (nums.length >= 2) {
        saldoInicial = parseChile(nums[0]!);
        saldoFinal   = parseChile(nums[nums.length - 1]!);
      }
    }
  }
  // Strategy 2 — Fallback: old 4-number inline pattern for PDFs where header
  // labels and values appear on the same logical line without a newline break.
  if (saldoInicial === undefined || saldoFinal === undefined) {
    const saldoHeaderMatch = text.match(
      /Saldo\s+Inicial.*?Saldo\s+Final.*?([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)/is
    );
    if (saldoHeaderMatch) {
      if (saldoInicial === undefined) saldoInicial = parseChile(saldoHeaderMatch[1]);
      if (saldoFinal   === undefined) saldoFinal   = parseChile(saldoHeaderMatch[4]);
    }
  }
  // Strategy 3 — BCI/Banco de Chile colon format: "Saldo Anterior: $X" / "Saldo Final: $X"
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

  // Detectores de sección (multi-banco) - más flexibles para variaciones de formato
  const SECTION_CARGO_RE = /CHEQUES?\s+(?:Y|O)\s+CARGOS?|CARGOS?\s+(?:Y|O)\s+CHEQUES?|CHEQUES\s+Y\s+CARGOS\s+DEL\s+PER[IÍ]ODO|CARGOS\s+DEL\s+PER[IÍ]ODO|EGRESOS|MOVIMIENTOS\s+DE\s+(?:D[EÉ]BITO|CARGO)|CHEQUES\s+O\s+CARGOS/i;
  const SECTION_ABONO_RE = /DEP[ÓO]SITOS?\s+(?:Y|O)\s+ABONOS?|ABONOS?\s+(?:Y|O)\s+DEP[ÓO]SITOS?|DEP[ÓO]SITOS\s+Y\s+ABONOS\s+DEL\s+PER[IÍ]ODO|ABONOS\s+DEL\s+PER[IÍ]ODO|INGRESOS|MOVIMIENTOS\s+DE\s+(?:CR[EÉ]DITO|ABONO)|DEP[ÓO]SITOS\s+O\s+ABONOS/i;

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function parseChile(s: string): number {
    return parseCLP(s);
  }

  /**
   * Reconoce un monto CLP:
   *  - Con separador de miles: 1.234 / 12.345 / 1.234.567 / con coma decimal
   *  - Sin separador (< 1.000): bare integer of 1–3 digits preceded by space/start
   *    and at end of line (to avoid matching doc numbers mid-line)
   */
  const CLP_RE = /\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\b\d{1,3}(?=\s*$)/g;

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

  // ── Column detection from PdfLine[] ─────────────────────────────────────────
  // In Santander (and similar), "CHEQUES Y CARGOS" and "DEPOSITOS Y ABONOS" are
  // column headers on the SAME line, not separate sections. The X coordinate of
  // each amount determines if it's a cargo or abono.
  //
  // Typical layout:
  //   x~321 "CHEQUES Y" / x~327 "CARGOS"   → cargo column center ~330
  //   x~406 "DEPOSITOS Y" / x~416 "ABONOS"  → abono column center ~410
  //   x~510 "SALDO"                          → saldo column center ~510

  let cargoColX: number | null = null;
  let abonoColX: number | null = null;
  let saldoColX: number | null = null;

  // Build a Y → PdfLine lookup for column-based amount classification
  const linesByY = new Map<number, PdfLine>();
  if (pdfLines && pdfLines.length > 0) {
    for (const pl of pdfLines) {
      linesByY.set(pl.y, pl);

      // Detect column header positions from items
      for (const item of pl.items) {
        const u = item.str.toUpperCase();
        if (/^CHEQUES\s*Y?$/.test(u) || /^CARGOS$/.test(u)) {
          // cargo column header — take the rightmost position as the column center
          if (cargoColX === null || item.x > cargoColX) cargoColX = item.x;
        }
        if (/^DEP[ÓO]SITOS?\s*Y?$/.test(u) || /^ABONOS$/.test(u)) {
          if (abonoColX === null || item.x > abonoColX) abonoColX = item.x;
        }
        if (/^SALDO$/.test(u) && item.x > 400) {
          // Only match SALDO as column header when it's far right (not "Saldo Inicial")
          if (saldoColX === null || item.x > saldoColX) saldoColX = item.x;
        }
      }
    }
  }

  const hasColumnLayout = cargoColX !== null && abonoColX !== null;

  // Column midpoint: amounts closer to cargo col = cargo, closer to abono col = abono
  // Amounts beyond abono col = saldo
  const cargoAbonoMidX = hasColumnLayout ? (cargoColX! + abonoColX!) / 2 : 0;
  const abonoSaldoMidX = hasColumnLayout && saldoColX !== null ? (abonoColX! + saldoColX) / 2 : (hasColumnLayout ? abonoColX! + 80 : 0);

  /**
   * Given a PdfLine, classify each CLP-formatted amount item by its X coordinate.
   * Returns { cargo, abono, saldo } values.
   *
   * Matches both:
   *  - Standard CLP with thousands separators: "1.234" / "12.345.678"
   *  - Small amounts < 1,000 without separator: "500", "800", "999"
   *    (safe because we gate on column position to avoid matching doc/branch numbers)
   */
  function classifyAmountsByColumn(pdfLine: PdfLine): { cargo: number; abono: number; saldo: number | undefined } {
    let cargo = 0, abono = 0, saldo: number | undefined;

    for (const item of pdfLine.items) {
      // Try CLP format with thousands separator first
      let rawVal: string | null = null;
      const mClp = item.str.match(/^(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?)$/);
      if (mClp) {
        rawVal = mClp[1];
      } else {
        // For items at or near the column area, also accept bare integers as small
        // amounts (e.g. "700" for 700 CLP). The threshold starts just before the
        // cargo column (leftmost amount column) so that cargo amounts < 1,000 are
        // detected, not just abono amounts. Single/double-digit branch codes (e.g.
        // "93") are already excluded by requiring ≥ 3 digits.
        const bareIntMinX = hasColumnLayout ? cargoColX! - 40 : cargoAbonoMidX;
        if (item.x > bareIntMinX) {
          const mInt = item.str.match(/^(\d{3,6})$/);
          if (mInt) rawVal = mInt[1];
        }
      }
      if (!rawVal) continue;

      const val = parseChile(rawVal);
      if (!Number.isFinite(val) || val < 1) continue;

      if (item.x > abonoSaldoMidX) {
        saldo = val;
      } else if (item.x > cargoAbonoMidX) {
        abono = val;
      } else {
        cargo = val;
      }
    }

    return { cargo, abono, saldo };
  }

  // ── Loop principal ──────────────────────────────────────────────────────────
  type SectionCtx = 'cargo' | 'abono' | null;
  let currentSection: SectionCtx = null;
  let currentDate = '';

  // If we have column layout, process using PdfLine[] for accurate column detection
  // Otherwise fall back to text-based parsing
  if (hasColumnLayout && pdfLines && pdfLines.length > 0) {
    // ── Column-based parsing (Santander-style) ──
    for (const pdfLine of pdfLines) {
      const line = pdfLine.text.trim();
      if (!line) continue;

      if (HEADER_RE.test(line) || SALDO_DIA_RE.test(line)) continue;

      // Detect date at start of line
      const dateMatch = line.match(/^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\s+(.*)/);
      if (dateMatch) {
        const [, dayStr, monthStr, yearStr] = dateMatch;
        const day   = Math.min(31, Math.max(1, parseInt(dayStr, 10)));
        const month = Math.min(12, Math.max(1, parseInt(monthStr, 10)));
        let y = year;
        if (yearStr) {
          y = yearStr.length === 2 ? 2000 + parseInt(yearStr, 10) : parseInt(yearStr, 10);
          if (y < 2015 || y > new Date().getFullYear() + 1) y = year;
        }
        currentDate = `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        processLineColumnar(pdfLine, currentDate);
        continue;
      }

      // Continuation line: starts with digits (doc/suc number) OR has a CLP amount with text
      if (currentDate && (/^\d{2,}/.test(line) || (CLP_RE.test(line) && /[A-Za-zÁÉÍÓÚáéíóúñÑ]{3,}/.test(line)))) {
        processLineColumnar(pdfLine, currentDate);
      }
    }
  } else {
    // ── Section/keyword-based parsing (other banks or no PdfLine data) ──
    const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);

    for (const line of lines) {
      // Detect section BEFORE header filter
      if (SECTION_CARGO_RE.test(line)) { currentSection = 'cargo'; continue; }
      if (SECTION_ABONO_RE.test(line)) { currentSection = 'abono'; continue; }

      if (HEADER_RE.test(line) || SALDO_DIA_RE.test(line)) continue;

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
        processLineKeywords(rest, currentDate, currentSection);
        continue;
      }

      if (currentDate && /^\d{4,}/.test(line)) {
        processLineKeywords(line, currentDate, currentSection);
        continue;
      }

      if (currentDate && CLP_RE.test(line) && /[A-Za-zÁÉÍÓÚáéíóúñÑ]{3,}/.test(line)) {
        processLineKeywords(line, currentDate, currentSection);
      }
    }
  }

  // ── processLineColumnar: uses X coordinates from PdfLine to classify amounts ─
  function processLineColumnar(pdfLine: PdfLine, fecha: string) {
    const trimmed = pdfLine.text.trim();
    if (!trimmed || trimmed.length < 3) return;

    const { cargo, abono, saldo } = classifyAmountsByColumn(pdfLine);
    const monto = cargo || abono;
    if (!monto || monto <= 0) return;

    // Build description from non-amount, non-date items
    const descParts: string[] = [];
    for (const item of pdfLine.items) {
      // Skip items that are CLP amounts (already classified)
      if (/^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(item.str)) continue;
      // Skip date at very start
      if (item.x < 60 && /^\d{1,2}[\/\-]\d{1,2}/.test(item.str)) continue;
      descParts.push(item.str);
    }

    const descripcion = cleanDescription(descParts.join(' '));
    if (descripcion.length < 3) return;
    if (/^\d+$/.test(descripcion)) return;

    let tipo: 'cargo' | 'abono' = cargo > 0 ? 'cargo' : 'abono';

    // Safety: "COMPRA" is unambiguously a cargo. Correct column-based misclassification
    // that can occur when small amounts render slightly off the expected column X range.
    if (tipo === 'abono' && /\bCOMPRA\b/i.test(descripcion)) {
      tipo = 'cargo';
    }

    transacciones.push({
      fecha,
      descripcion: descripcion.slice(0, 200),
      cargo: tipo === 'cargo' ? monto : 0,
      abono: tipo === 'abono' ? monto : 0,
      saldo,
    });
  }

  // ── processLineKeywords: text-only fallback using section/keyword inference ──
  function processLineKeywords(line: string, fecha: string, section: SectionCtx) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length < 3) return;

    const { monto, saldo } = extractAmounts(trimmed);
    if (!monto || monto <= 0) return;

    let rawDesc = trimmed;
    const clpMatches = Array.from(trimmed.matchAll(CLP_RE));
    if (clpMatches.length > 0) {
      const lastIdx = clpMatches[clpMatches.length - 1].index!;
      const secondLastIdx = clpMatches.length >= 2 ? clpMatches[clpMatches.length - 2].index! : lastIdx;
      rawDesc = trimmed.slice(0, secondLastIdx).trim();
    }

    const descripcion = cleanDescription(rawDesc);
    if (descripcion.length < 3) return;
    if (/^\d+$/.test(descripcion)) return;

    // Determine type from section or keywords
    let tipo: 'cargo' | 'abono';

    if (section === 'cargo') {
      tipo = 'cargo';
    } else if (section === 'abono') {
      tipo = 'abono';
    } else {
      // Keyword inference
      const d = descripcion.toUpperCase();
      const esRecibida = /TRANSF(?:E?R)?\.?\s+DE\s|TRASPASO\s+DE\s|TEF\s+CR|TRASPASO\s+AUTOM|ABONO/i.test(d);
      const esEnviada  = /TRANSF(?:E?R)?\.?\s+A\s|TRASPASO\s+A\s/i.test(d);
      const esCargo    = /COMPRA|PAGO\s|PAC\s|PAT\s|GIRO\s|COBRO|D[EÉ]BITO|CARGO\s|RETIRO/i.test(d);
      const esAbono    = /DEP[OÓ]SITO|CR[EÉ]DITO|REMUNERACI[OÓ]N|SUELDO|BONO\s|INGRESO/i.test(d);

      if (esRecibida && !esEnviada)      tipo = 'abono';
      else if (esEnviada)                tipo = 'cargo';
      else if (esCargo && !esAbono)      tipo = 'cargo';
      else if (esAbono && !esCargo)      tipo = 'abono';
      else if (esCargo && esAbono)       tipo = 'cargo';
      else return; // no match → skip
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
  const { text, lines } = await extractPdfText(buffer);
  if (!text || text.length < 50) return null;
  const cmf = parseCmfInformeDeudas(text);
  if (cmf) return cmf;
  const cartola = parseCartolaPdf(text, lines);
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
