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

function averageConfidence(movs: Array<{ confidence: TransactionConfidence }>): number {
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
  const { titular, tarjetaMascara, fechaEstado, desde, hasta } = parseCardHeader(text);

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

interface CardHeader {
  titular: string;
  tarjetaMascara: string;
  fechaEstado: Date | null;
  desde: Date;
  hasta: Date;
}

/**
 * Cabecera común a ambos estados de TC. Robusta a los dos extractores de texto:
 *  - pdfjs (producción): "NOMBRE DEL TITULAR X", "FECHA ESTADO DE CUENTA dd/mm/yyyy",
 *    "PERÍODO FACTURADO DESDE/HASTA dd/mm/yyyy" (valor en la misma línea).
 *  - pdf-parse (fallback): la fecha queda PEGADA antes del label
 *    ("dd/mm/yyyyFECHA ESTADO DE CUENTA") y el nombre/períodos quedan dispersos.
 */
function parseCardHeader(text: string): CardHeader {
  // Titular SÓLO en la misma línea del label ([ \t], no \s que cruza saltos) —
  // así no captura el disclaimer "Consideramos aprobado…" de la línea siguiente.
  const tM = text.match(/NOMBRE DEL TITULAR[ \t]+([^\n]+)/i);
  const titular = tM ? tM[1]!.replace(/\s{2,}.*$/, '').trim().slice(0, 120) : '';

  const tarjetaMascara =
    (text.match(/N[º°]\s*DE TARJETA DE CR[ÉE]DITO[ \t]*[\dX\s]*?(\d{4})\b/i)?.[1]) ??
    (text.match(/MOVIMIENTOS TARJETA\s*[X\d-]*?(\d{4})\b/i)?.[1]) ??
    '';

  // FECHA ESTADO DE CUENTA: fecha DESPUÉS (pdfjs) o ANTES pegada (pdf-parse).
  const feM =
    text.match(/FECHA ESTADO DE CUENTA[ \t]*(\d{2})\/(\d{2})\/(\d{4})/i) ??
    text.match(/(\d{2})\/(\d{2})\/(\d{4})\s*FECHA ESTADO DE CUENTA/i);
  const fechaEstado = feM ? parseFullDate(feM[1]!, feM[2]!, feM[3]!) : null;

  // Período: DESDE/HASTA explícitos (USD pdfjs) o dos fechas en una línea (CLP pdfjs).
  const dM = text.match(/PER[ÍI]ODO FACTURADO DESDE[ \t]*(\d{2})\/(\d{2})\/(\d{4})/i);
  const hM = text.match(/PER[ÍI]ODO FACTURADO HASTA[ \t]*(\d{2})\/(\d{2})\/(\d{4})/i);
  const bothM = text.match(
    /PER[ÍI]ODO FACTURADO[ \t]+(\d{2})\/(\d{2})\/(\d{4})[ \t]+(\d{2})\/(\d{2})\/(\d{4})/i,
  );

  let desde: Date | null = dM
    ? parseFullDate(dM[1]!, dM[2]!, dM[3]!)
    : bothM ? parseFullDate(bothM[1]!, bothM[2]!, bothM[3]!) : null;
  let hasta: Date | null = hM
    ? parseFullDate(hM[1]!, hM[2]!, hM[3]!)
    : bothM ? parseFullDate(bothM[4]!, bothM[5]!, bothM[6]!) : null;

  // Fallbacks deterministas (alimentan dedup por período): FECHA ESTADO como cierre,
  // inicio un mes antes cuando el layout esconde las fechas del período.
  if (!hasta) hasta = fechaEstado ?? new Date();
  if (!desde) {
    desde = new Date(hasta);
    desde.setMonth(desde.getMonth() - 1);
  }

  return { titular, tarjetaMascara, fechaEstado, desde, hasta };
}

// ──────────────────────────────────────────────────────────────────────────────
// Parser: TC Internacional (USD)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Parsea un monto con formato chileno PRESERVANDO decimales (a diferencia de
 * parseCLP que redondea a entero). "2.276,25" → 2276.25, "88,57" → 88.57,
 * "-1.804,21" → -1804.21. Punto = miles, coma = decimal.
 */
export function parseDecimalCl(input: string | number | null | undefined): number {
  if (input === null || input === undefined) return 0;
  if (typeof input === 'number') return Number.isFinite(input) ? input : 0;
  const s = String(input).replace(/US\$|\$/g, '').replace(/\s/g, '').trim();
  if (!s) return 0;
  const normalized = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(normalized);
  return Number.isFinite(n) ? n : 0;
}

/** Redondeo a centavos para comparaciones de punto flotante. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type TarjetaIntlKind = 'purchase' | 'payment' | 'transfer';

export interface TarjetaIntlMovimiento {
  fecha: Date;
  descripcion: string;
  ciudad: string;
  pais: string;
  /** MONTO MONEDA ORIGEN — metadata ruidosa/multi-moneda; NO autoritativa. */
  montoOrigen: number | null;
  /** MONTO US$ — autoritativa. Negativa para pagos (MONTO CANCELADO). */
  montoUsd: number;
  /** Convertido a CLP vía getUsd(fecha estado); null si FX no disponible. */
  montoClp: number | null;
  kind: TarjetaIntlKind;
  confidence: TransactionConfidence;
}

export interface TarjetaInternacionalResult {
  banco: typeof BANCO;
  tipoDocumento: 'tc_internacional';
  titular: string;
  tarjetaMascara: string;
  periodo: { desde: Date; hasta: Date; dias: number };
  fechaEstado: Date | null;
  /** Fecha usada para la conversión USD→CLP (cierre del período). */
  statementDate: Date;
  saldoAnteriorUsd: number;
  abonoRealizadoUsd: number;
  totalComprasYCargosUsd: number;
  traspasoDeudaNacionalUsd: number;
  deudaTotalUsd: number;
  totalOperacionesUsd: number;
  movimientos: TarjetaIntlMovimiento[];
  /** Suma de compras reales (montoUsd > 0, kind=purchase). */
  totalComprasUsd: number;
  /** Suma del valor absoluto de pagos/transferencias internas. */
  totalPagosUsd: number;
  /** Tipo de cambio USD→CLP aplicado (CLP por 1 USD), o null si no disponible. */
  fxRate: number | null;
  /** true si no se pudo convertir (el caller guarda nativo y reintenta luego). */
  fxPending: boolean;
  /** totalComprasUsd convertido a CLP, o null si fxPending. */
  totalComprasClp: number | null;
  reconciliation: ReconciliationResult;
  parse_confidence: number;
  warnings: string[];
}

const US_NUM_RE = /-?\d{1,3}(?:\.\d{3})*,\d{2}/g; // número con coma decimal (miles con punto)
const MOV_DATE_AT_START = /^(\d{2})\/(\d{2})\/(\d{2})/; // dd/mm/yy al inicio (permite año pegado al monto)

/** Detecta si el texto corresponde a un estado de TC internacional. */
export function isTarjetaInternacional(text: string): boolean {
  return text.toUpperCase().includes(TC_INTERNACIONAL_DISCRIMINATOR.toUpperCase());
}

function usdLabel(text: string, label: RegExp): number {
  const m = text.match(label);
  return m ? parseDecimalCl(m[1]!) : 0;
}

export function parseTarjetaInternacional(text: string): TarjetaInternacionalResult {
  const warnings: string[] = [];
  const lines = text.split(/\r?\n/);

  const { titular, tarjetaMascara, fechaEstado, desde, hasta } = parseCardHeader(text);
  const statementDate = hasta ?? fechaEstado ?? new Date();

  const saldoAnteriorUsd = usdLabel(text, /SALDO ANTERIOR FACTURADO[^\n]*?US\$\s*(-?[\d.,]+)/i);
  const abonoRealizadoUsd = usdLabel(text, /ABONO REALIZADO[^\n]*?US\$\s*(-?[\d.,]+)/i);
  const totalComprasYCargosUsd = usdLabel(text, /TOTAL DE COMPRAS Y CARGOS[^\n]*?US\$\s*(-?[\d.,]+)/i);
  const traspasoDeudaNacionalUsd = usdLabel(text, /TRASPASO DEUDA NACIONAL[^\n]*?US\$\s*(-?[\d.,]+)/i);
  const deudaTotalUsd = usdLabel(text, /DEUDA TOTAL[^\n]*?US\$\s*(-?[\d.,]+)/i);
  const totalOperacionesUsd = parseDecimalCl(
    text.match(/1\.\s*TOTAL OPERACIONES[^\n]*?(-?\d[\d.,]*,\d{2})/i)?.[1] ?? '0',
  );

  const movimientos: TarjetaIntlMovimiento[] = [];
  for (const raw of lines) {
    const line = raw.replace(/\s+$/g, '');
    if (!line.trim()) continue;
    if (isSectionRow(line)) continue;

    // Las filas de movimiento NO llevan el prefijo "US$" (sólo los montos del
    // encabezado/comprobante lo llevan) y usan año de 2 dígitos. Esto descarta
    // líneas de período/comprobante (dd/mm/yyyy + US$) en ambos extractores.
    if (/US\$/i.test(line)) continue;
    const dateM = line.match(MOV_DATE_AT_START);
    if (!dateM) continue; // la fecha abre la fila
    const rest = line.slice(dateM[0].length);
    const numeric = [...rest.matchAll(US_NUM_RE)].map((m) => m[0]);
    if (numeric.length === 0) continue;

    // El texto del PDF llega en DOS órdenes de columnas según el extractor:
    //  - pdfjs (producción):  DATE DESC CIUDAD PAÍS ORIGEN US$  → US$ es el ÚLTIMO número.
    //  - pdf-parse (fallback): DATE US$ CIUDAD ORIGEN DESC PAÍS → US$ es el PRIMER número,
    //    pegado a la fecha. Detectamos el layout pegado y elegimos la posición correcta.
    const glued = /^-?\d/.test(rest);
    const usdStr = glued ? numeric[0]! : numeric[numeric.length - 1]!;
    const origenStr = glued
      ? (numeric[1] ?? null)
      : (numeric.length >= 2 ? numeric[numeric.length - 2]! : null);
    const montoUsd = parseDecimalCl(usdStr);
    const montoOrigen = origenStr != null ? parseDecimalCl(origenStr) : null;

    // Glosa = resto sin los números (sirve para clasificar pago/transfer); el país
    // son 2 letras al final (pegadas en pdf-parse, token suelto en pdfjs).
    let descPart = rest;
    for (const n of numeric) descPart = descPart.replace(n, ' ');
    const paisM = descPart.match(/([A-Z]{2})\s*$/);
    const pais = paisM ? paisM[1]! : '';
    const descripcion = descPart.replace(/[A-Z]{2}\s*$/, '').replace(/\s+/g, ' ').trim();

    let kind: TarjetaIntlKind;
    if (/MONTO\s*CANCELADO|ABONO\s*DE\s*DIVISAS/i.test(descripcion)) kind = 'payment';
    else if (/TRASPASO|EGRESO\s*DE\s*DIVISAS|COMPRA\s*DE\s*DIVISAS/i.test(descripcion)) kind = 'transfer';
    else if (montoUsd < 0) kind = 'payment';
    else kind = 'purchase';

    const fecha = parseShortDate(dateM[1]!, dateM[2]!, dateM[3]!);
    movimientos.push({
      fecha,
      descripcion,
      ciudad: '',
      pais,
      montoOrigen,
      montoUsd,
      montoClp: null,
      kind,
      confidence: buildTransactionConfidence({
        dateIsInferred: false,
        amountFromColumn: true,
        monto: Math.abs(montoUsd),
        typeFromColumn: true,
        typeFromSection: false,
        descripcion,
      }),
    });
  }

  const totalComprasUsd = round2(
    movimientos.filter((m) => m.kind === 'purchase').reduce((a, m) => a + m.montoUsd, 0),
  );
  const totalPagosUsd = round2(
    movimientos.filter((m) => m.kind !== 'purchase').reduce((a, m) => a + Math.abs(m.montoUsd), 0),
  );

  const expected = round2(totalComprasYCargosUsd || totalOperacionesUsd);
  const reconciliation = reconcileTotals(expected, totalComprasUsd);
  if (!reconciliation.passed && !reconciliation.skipped) {
    warnings.push(
      `Compras USD suman ${totalComprasUsd} vs TOTAL DE COMPRAS Y CARGOS ${expected} (delta ${reconciliation.delta_pct}%).`,
    );
  }
  if (movimientos.length === 0) warnings.push('No se detectaron movimientos.');

  return {
    banco: BANCO,
    tipoDocumento: 'tc_internacional',
    titular,
    tarjetaMascara,
    periodo: { desde, hasta, dias: diasEntre(desde, hasta) },
    fechaEstado,
    statementDate,
    saldoAnteriorUsd,
    abonoRealizadoUsd,
    totalComprasYCargosUsd,
    traspasoDeudaNacionalUsd,
    deudaTotalUsd,
    totalOperacionesUsd,
    movimientos,
    totalComprasUsd,
    totalPagosUsd,
    fxRate: null,
    fxPending: true,
    totalComprasClp: null,
    reconciliation,
    parse_confidence: averageConfidence(movimientos),
    warnings,
  };
}

/**
 * Aplica la conversión USD→CLP a un resultado internacional usando una tasa
 * (CLP por 1 USD). Con `rate=null` deja `fxPending=true` y los CLP en null para
 * que la ingesta guarde el monto nativo y reintente — nunca bloquea.
 */
export function applyUsdConversion(
  result: TarjetaInternacionalResult,
  rate: number | null,
): TarjetaInternacionalResult {
  if (rate == null || !Number.isFinite(rate) || rate <= 0) {
    return { ...result, fxRate: null, fxPending: true, totalComprasClp: null };
  }
  const movimientos = result.movimientos.map((m) => ({
    ...m,
    montoClp: Math.round(m.montoUsd * rate),
  }));
  return {
    ...result,
    movimientos,
    fxRate: rate,
    fxPending: false,
    totalComprasClp: Math.round(result.totalComprasUsd * rate),
  };
}
