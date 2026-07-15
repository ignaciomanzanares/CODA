/**
 * Adaptador: estados de cuenta de Tarjeta de Crédito Santander → ParseResult.
 *
 * Permite que las cartolas de tarjeta viajen por el MISMO pipeline de Movimientos
 * que la cuenta corriente (processDocumentUpload → documentUploads). NO reescribe
 * los parsers (santanderTarjeta.ts): sólo los detecta, ejecuta y mapea su salida
 * al contrato ParseResult que el resto de la ingesta ya consume.
 *
 * - Compras → tipo 'cargo' (gasto / salida).
 * - Pagos (MONTO CANCELADO) y transferencias (TRASPASO/DIVISAS) → tipo 'abono'
 *   marcado es_transferencia=true, para que isInternalTransfer (Task 4) los netee
 *   en la agregación y la importación de gastos los excluya.
 * - TC USD: el monto canónico es el CLP convertido vía indicators.getUsd a la
 *   fecha del estado de cuenta; si la conversión no está disponible, se ingresa
 *   con fx pendiente (monto 0 + glosa con el USD) sin bloquear la ingesta.
 */

import type { ParseResult, ParsedTransaction, TransactionCategory } from "./base.js";
import { computeReconciliation } from "./base.js";
import {
  isTarjetaNacional,
  parseTarjetaNacional,
  isTarjetaInternacional,
  parseTarjetaInternacional,
  applyUsdConversion,
  type TarjetaMovimiento,
  type TarjetaIntlMovimiento,
} from "./santanderTarjeta.js";

export const BANCO_TC_NACIONAL = "Santander Tarjeta Nacional";
export const BANCO_TC_INTERNACIONAL = "Santander Tarjeta Internacional";

type GetUsdFn = (date: Date) => Promise<number | null>;

function diasEntre(desde: Date, hasta: Date): number {
  return Math.max(1, Math.round((hasta.getTime() - desde.getTime()) / 86_400_000) + 1);
}

function purchaseCategoria(): TransactionCategory {
  return "comercio";
}

/** Mapea un movimiento de TC nacional (CLP) a ParsedTransaction. */
function nacionalToParsed(m: TarjetaMovimiento): ParsedTransaction {
  const esPago = m.kind === "payment";
  return {
    fecha: m.fecha,
    descripcion: m.descripcion,
    tipo: esPago ? "abono" : "cargo",
    monto: Math.abs(m.montoClp),
    saldo_despues: 0,
    categoria: esPago ? "transferencia_recibida" : purchaseCategoria(),
    es_transferencia: esPago,
    es_compra: !esPago,
    es_pago_recurrente: /COOPEUCH|DIVIDENDO|ARRIENDO/i.test(m.descripcion),
    confidence: m.confidence,
  };
}

/** Mapea un movimiento de TC internacional (USD→CLP) a ParsedTransaction. */
function internacionalToParsed(m: TarjetaIntlMovimiento, warnings: string[]): ParsedTransaction {
  const esInterno = m.kind !== "purchase";
  let monto: number;
  let descripcion = m.descripcion;
  if (m.montoClp != null) {
    monto = Math.abs(m.montoClp);
  } else {
    // FX pendiente: no bloquear; preservar el USD en la glosa, monto CLP = 0.
    monto = 0;
    descripcion = `${m.descripcion} (USD ${m.montoUsd}, FX pendiente)`;
  }
  // Metadata USD nativa (para no mezclar USD/CLP sin contexto al normalizar).
  const montoUsd = m.montoUsd != null ? Math.abs(m.montoUsd) : undefined;
  const fxRate =
    m.montoUsd != null && m.montoClp != null && m.montoUsd !== 0
      ? Math.abs(m.montoClp / m.montoUsd)
      : undefined;
  return {
    fecha: m.fecha,
    descripcion,
    tipo: esInterno ? "abono" : "cargo",
    monto,
    saldo_despues: 0,
    categoria: esInterno ? "transferencia_recibida" : purchaseCategoria(),
    es_transferencia: esInterno,
    es_compra: !esInterno,
    es_pago_recurrente: false,
    confidence: m.confidence,
    montoUsd,
    fxRate,
  };
}

function buildResult(opts: {
  banco: string;
  titular: string;
  cuenta: string;
  desde: Date;
  hasta: Date;
  transacciones: ParsedTransaction[];
  parse_confidence: number;
  warnings: string[];
}): ParseResult {
  const total_cargos = opts.transacciones
    .filter((t) => t.tipo === "cargo")
    .reduce((a, t) => a + t.monto, 0);
  const total_abonos = opts.transacciones
    .filter((t) => t.tipo === "abono")
    .reduce((a, t) => a + t.monto, 0);
  return {
    banco: opts.banco,
    banco_confidence: 0.98, // discriminador exacto en el encabezado → alta confianza
    detection_tier: "HIGH",
    titular: opts.titular,
    cuenta: opts.cuenta,
    periodo: { desde: opts.desde, hasta: opts.hasta, dias: diasEntre(opts.desde, opts.hasta) },
    saldo_inicial: 0,
    saldo_final: 0,
    total_cargos: Math.round(total_cargos),
    total_abonos: Math.round(total_abonos),
    transacciones: opts.transacciones,
    saldos_diarios: [],
    reconciliation: computeReconciliation(0, 0, total_cargos, total_abonos), // skipped (saldos 0/0)
    parse_confidence: opts.parse_confidence,
    warnings: opts.warnings,
  };
}

/**
 * Si el texto es un estado de TC Santander (nacional o internacional), lo parsea
 * y devuelve un ParseResult listo para la ingesta. Si no, devuelve null para que
 * el dispatcher siga con la detección de banco normal.
 *
 * @param getUsd  Conversor USD→CLP (inyectable para tests). Por defecto indicators.getUsd.
 */
export async function parseCardStatementText(
  text: string,
  getUsd?: GetUsdFn,
): Promise<ParseResult | null> {
  if (isTarjetaNacional(text)) {
    const r = parseTarjetaNacional(text);
    return buildResult({
      banco: BANCO_TC_NACIONAL,
      titular: r.titular,
      cuenta: r.tarjetaMascara,
      desde: r.periodo.desde,
      hasta: r.periodo.hasta,
      transacciones: r.movimientos.map(nacionalToParsed),
      parse_confidence: r.parse_confidence,
      warnings: r.warnings,
    });
  }

  if (isTarjetaInternacional(text)) {
    const base = parseTarjetaInternacional(text);
    const fx = getUsd ?? (await import("../services/indicators.js")).getUsd;
    const rate = await fx(base.statementDate);
    const converted = applyUsdConversion(base, rate);
    const warnings = [...converted.warnings];
    if (converted.fxPending) {
      warnings.push(
        `Tipo de cambio USD no disponible para ${base.statementDate.toISOString().slice(0, 10)}; ` +
          "movimientos ingresados con FX pendiente.",
      );
    }
    return buildResult({
      banco: BANCO_TC_INTERNACIONAL,
      titular: converted.titular,
      cuenta: converted.tarjetaMascara,
      desde: converted.periodo.desde,
      hasta: converted.periodo.hasta,
      transacciones: converted.movimientos.map((m) => internacionalToParsed(m, warnings)),
      parse_confidence: converted.parse_confidence,
      warnings,
    });
  }

  return null;
}
