/**
 * Parsers de Estados de Cuenta de Tarjeta de Crédito Santander.
 *
 *  - Nacional (CLP): "ESTADO DE CUENTA EN MONEDA NACIONAL DE TARJETA DE CRÉDITO"
 *  - Internacional (USD): "ESTADO DE CUENTA INTERNACIONAL DE TARJETA DE CRÉDITO"
 *
 * Reutiliza el parser de montos chilenos endurecido (parseCLP) y la
 * infraestructura de confianza/conciliación de `base.ts`.
 *
 * Operan sobre el TEXTO ya extraído (pdftotext -layout / extractPdfText) en vez
 * del Buffer, para poder testear contra fixtures `.txt` redactadas sin exponer
 * PDFs reales con PII. Ver feedback_no_real_pii_fixtures.
 */

import {
  type TransactionConfidence,
  type ReconciliationResult,
  buildTransactionConfidence,
  RECONCILIATION_WARN_PCT,
} from './base.js';
import { parseCLP } from '../utils/clp.js';

export const BANCO = 'Santander';

export const TC_NACIONAL_DISCRIMINATOR = 'ESTADO DE CUENTA EN MONEDA NACIONAL DE TARJETA DE CRÉDITO';
export const TC_INTERNACIONAL_DISCRIMINATOR = 'ESTADO DE CUENTA INTERNACIONAL DE TARJETA DE CRÉDITO';

/** Movimiento de tarjeta. `kind` distingue gasto real de plomería interna. */
export type TarjetaMovimientoKind = 'purchase' | 'payment';

export interface TarjetaMovimiento {
  fecha: Date;
  lugar: string;
  descripcion: string;
  /** Monto en CLP (compra) — el CARGO DEL MES. Negativo para pagos (MONTO CANCELADO). */
  montoClp: number;
  kind: TarjetaMovimientoKind;
  /** Cuota n de m, cuando la fila es una compra en cuotas. */
  cuota?: { n: number; de: number };
  confidence: TransactionConfidence;
}

export interface TarjetaNacionalResult {
  banco: typeof BANCO;
  tipoDocumento: 'tc_nacional';
  titular: string;
  /** Sólo los últimos 4 dígitos enmascarados de la tarjeta. */
  tarjetaMascara: string;
  periodo: { desde: Date; hasta: Date; dias: number };
  fechaEstado: Date | null;
  /** "MONTO TOTAL FACTURADO A PAGAR" del período. */
  montoTotalFacturado: number;
  /** Sección "1. TOTAL OPERACIONES" (total declarado de compras). */
  totalOperaciones: number;
  movimientos: TarjetaMovimiento[];
  /** Suma de las compras (line items positivos). */
  totalCompras: number;
  /** Suma del valor absoluto de los pagos (MONTO CANCELADO). */
  totalPagos: number;
  reconciliation: ReconciliationResult;
  parse_confidence: number;
  warnings: string[];
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers compartidos
// ──────────────────────────────────────────────────────────────────────────────

/** Filas de sección/subtotal que NUNCA son line items (se excluyen de la suma). */
const SECTION_MARKERS = [
  'TOTAL OPERACIONES',
  'MOVIMIENTOS TARJETA',
  'PRODUCTOS O SERVICIOS',
  'CARGOS, COMISIONES',
  'INFORMACION COMPRAS',
  'INFORMACIÓN COMPRAS',
  'TOTAL DE COMPRAS Y CARGOS',
  'MONTO TOTAL FACTURADO',
];

function isSectionRow(line: string): boolean {
  const u = line.toUpperCase();
  return SECTION_MARKERS.some((m) => u.includes(m));
}

/** dd/mm/yy (año de 2 dígitos) → Date a mediodía local. No confundir con dd/mm/yyyy. */
function parseShortDate(dd: string, mm: string, yy: string): Date {
  return new Date(2000 + parseInt(yy, 10), parseInt(mm, 10) - 1, parseInt(dd, 10), 12, 0, 0, 0);
}

/** dd/mm/yyyy → Date a mediodía local. */
function parseFullDate(dd: string, mm: string, yyyy: string): Date {
  return new Date(parseInt(yyyy, 10), parseInt(mm, 10) - 1, parseInt(dd, 10), 12, 0, 0, 0);
}

function diasEntre(desde: Date, hasta: Date): number {
  return Math.max(1, Math.round((hasta.getTime() - desde.getTime()) / 86_400_000) + 1);
}

/** Construye un ReconciliationResult comparando un total esperado vs el sumado. */
function reconcileTotals(expected: number, actual: number): ReconciliationResult {
  if (expected === 0 && actual === 0) {
    return { passed: true, expected_final: 0, actual_final: 0, delta_pct: 0, skipped: true };
  }
  const delta = Math.abs(expected - actual);
  const delta_pct = Math.round((delta / Math.max(Math.abs(expected), 1)) * 1000) / 10;
  return {
    passed: delta_pct <= RECONCILIATION_WARN_PCT,
    expected_final: Math.round(expected),
    actual_final: Math.round(actual),
    delta_pct,
    skipped: false,
  };
}

function averageConfidence(movs: TarjetaMovimiento[]): number {
  if (movs.length === 0) return 0;
  const sum = movs.reduce((a, m) => a + m.confidence.overall, 0);
  return Math.round((sum / movs.length) * 1000) / 1000;
}

const MOV_DATE_RE = /(\d{2})\/(\d{2})\/(\d{2})(?!\d)/; // dd/mm/yy (no un 3er par → excluye dd/mm/yyyy)
const CLP_AMOUNT_RE = /\$\s*(-?[\d.]+)/g;

/** Última cantidad `$…` de la línea (el CARGO DEL MES está más a la derecha). */
function lastClpAmount(line: string): number | null {
  const matches = [...line.matchAll(CLP_AMOUNT_RE)];
  if (matches.length === 0) return null;
  return parseCLP(matches[matches.length - 1]![1]!);
}

// ──────────────────────────────────────────────────────────────────────────────
// Parser: TC Nacional (CLP)
// ──────────────────────────────────────────────────────────────────────────────

/** Detecta si el texto corresponde a un estado de TC en moneda nacional. */
export function isTarjetaNacional(text: string): boolean {
  return text.toUpperCase().includes(TC_NACIONAL_DISCRIMINATOR.toUpperCase());
}

export function parseTarjetaNacional(text: string): TarjetaNacionalResult {
  const warnings: string[] = [];
  const lines = text.split(/\r?\n/);

  // ── Cabecera ──────────────────────────────────────────────────────────────
  const titular = matchAfterLabel(text, /NOMBRE DEL TITULAR\s+(.+)/i) ?? '';
  const tarjetaMascara = (text.match(/N[º°]\s*DE TARJETA DE CR[ÉE]DITO\s+[\dX\s]*?(\d{4})\b/i)?.[1])
    ?? (text.match(/MOVIMIENTOS TARJETA\s+[X\d-]*?(\d{4})\b/i)?.[1])
    ?? '';

  const fechaEstadoM = text.match(/FECHA ESTADO DE CUENTA\s+(\d{2})\/(\d{2})\/(\d{4})/i);
  const fechaEstado = fechaEstadoM ? parseFullDate(fechaEstadoM[1]!, fechaEstadoM[2]!, fechaEstadoM[3]!) : null;

  const periodoM = text.match(/PER[ÍI]ODO FACTURADO\s+(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2})\/(\d{2})\/(\d{4})/i);
  const desde = periodoM
    ? parseFullDate(periodoM[1]!, periodoM[2]!, periodoM[3]!)
    : (fechaEstado ?? new Date());
  const hasta = periodoM
    ? parseFullDate(periodoM[4]!, periodoM[5]!, periodoM[6]!)
    : (fechaEstado ?? new Date());

  // Anclar al MISMO renglón (con `$`): el `\s` cruza saltos de línea y, en el
  // comprobante de pago, el label queda sobre una línea y el monto en la siguiente
  // (capturaba "10" de "10/11/2025"). [^\n]*? exige label y monto en la misma fila.
  const montoTotalFacturado = parseCLP(
    text.match(/MONTO TOTAL FACTURADO A PAGAR[^\n]*?\$\s*(-?[\d.]+)/i)?.[1] ?? '0',
  );
  const totalOperaciones = parseCLP(
    text.match(/1\.\s*TOTAL OPERACIONES[^\n]*?\$\s*(-?[\d.]+)/i)?.[1] ?? '0',
  );

  // ── Line items ──────────────────────────────────────────────────────────────
  const movimientos: TarjetaMovimiento[] = [];
  for (const raw of lines) {
    const line = raw.replace(/\s+$/g, '');
    if (!line.trim()) continue;
    if (isSectionRow(line)) continue;

    const dateM = line.match(MOV_DATE_RE);
    if (!dateM || dateM.index === undefined) continue;
    const monto = lastClpAmount(line);
    if (monto === null || monto === 0) continue;

    const lugar = line.slice(0, dateM.index).trim();
    const afterDate = line.slice(dateM.index + dateM[0].length);
    const descripcion = afterDate.replace(CLP_AMOUNT_RE, '').replace(/\s+/g, ' ').trim();
    const fecha = parseShortDate(dateM[1]!, dateM[2]!, dateM[3]!);

    const esPago = /MONTO CANCELADO/i.test(descripcion) || monto < 0;
    const kind: TarjetaMovimientoKind = esPago ? 'payment' : 'purchase';
    // Compra en cuotas: el layout muestra "n de m" o "n/m" en la zona NºCUOTA.
    const cuotaM = descripcion.match(/CUOTA\s*(\d{1,2})\s*(?:DE|\/)\s*(\d{1,2})/i);
    const cuota = cuotaM ? { n: parseInt(cuotaM[1]!, 10), de: parseInt(cuotaM[2]!, 10) } : undefined;

    movimientos.push({
      fecha,
      lugar,
      descripcion,
      montoClp: kind === 'payment' ? -Math.abs(monto) : Math.abs(monto),
      kind,
      cuota,
      confidence: buildTransactionConfidence({
        dateIsInferred: false,
        amountFromColumn: true,
        monto: Math.abs(monto),
        typeFromColumn: true,
        typeFromSection: false,
        descripcion,
      }),
    });
  }

  const totalCompras = movimientos
    .filter((m) => m.kind === 'purchase')
    .reduce((a, m) => a + m.montoClp, 0);
  const totalPagos = movimientos
    .filter((m) => m.kind === 'payment')
    .reduce((a, m) => a + Math.abs(m.montoClp), 0);

  // Conciliación: las compras deben sumar el "1. TOTAL OPERACIONES" declarado
  // (o, si no se pudo leer, el MONTO TOTAL FACTURADO del período).
  const expected = totalOperaciones || montoTotalFacturado;
  const reconciliation = reconcileTotals(expected, totalCompras);
  if (!reconciliation.passed && !reconciliation.skipped) {
    warnings.push(
      `Compras suman ${totalCompras} vs total declarado ${expected} (delta ${reconciliation.delta_pct}%).`,
    );
  }
  if (movimientos.length === 0) warnings.push('No se detectaron movimientos.');

  return {
    banco: BANCO,
    tipoDocumento: 'tc_nacional',
    titular,
    tarjetaMascara,
    periodo: { desde, hasta, dias: diasEntre(desde, hasta) },
    fechaEstado,
    montoTotalFacturado,
    totalOperaciones,
    movimientos,
    totalCompras,
    totalPagos,
    reconciliation,
    parse_confidence: averageConfidence(movimientos),
    warnings,
  };
}

function matchAfterLabel(text: string, re: RegExp): string | null {
  const m = text.match(re);
  return m ? m[1]!.trim().replace(/\s{2,}.*$/, '').trim() : null;
}
