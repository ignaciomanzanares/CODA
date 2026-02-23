/**
 * Normalización de moneda a CLP (Pesos Chilenos) según Manual de Sistema de Información (MSI).
 * Los montos SFA pueden venir en distintas monedas (tabla 1 MSI); todos los cálculos
 * del Score Transaccional se realizan en CLP para consistencia y cumplimiento CMF.
 *
 * Principio de minimización: este módulo solo trabaja con códigos de moneda y montos,
 * sin datos personales.
 */

/** Códigos de moneda según tabla 1 MSI (ejemplos). En producción pueden venir más códigos. */
export type MsiCurrencyCode = 'CLP' | 'USD' | 'EUR' | 'UF' | string;

/** Tasas de cambio a CLP (1 unidad de moneda = X CLP). Base para desarrollo; en producción inyectar tasas actualizadas. */
export interface ExchangeRatesToClp {
  CLP?: number;
  USD?: number;
  EUR?: number;
  UF?: number;
  [code: string]: number | undefined;
}

/** Tasas base típicas (solo para desarrollo/testing). Reemplazar por fuente oficial en producción. */
export const DEFAULT_EXCHANGE_RATES_CLP: ExchangeRatesToClp = {
  CLP: 1,
  USD: 950,
  EUR: 1020,
  UF: 37500,
};

/**
 * Convierte un monto a CLP usando las tasas proporcionadas.
 * Si la moneda no está en el mapa, se asume CLP (evita romper por códigos desconocidos).
 */
export function toClp(
  amount: number,
  currency: MsiCurrencyCode | null | undefined,
  rates: ExchangeRatesToClp = DEFAULT_EXCHANGE_RATES_CLP
): number {
  if (amount == null || Number.isNaN(amount)) return 0;
  const code = (currency ?? 'CLP').toString().toUpperCase().trim();
  const rate = rates[code] ?? rates.CLP ?? 1;
  return amount * rate;
}
