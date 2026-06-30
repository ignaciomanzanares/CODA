/**
 * Tipos del Sistema de Finanzas Abiertas (SFA) — CMF Chile, NCG 514/569, Anexo Técnico N°3.
 * Modelados sobre el data dictionary oficial (espacio OFAC, "API Cuentas v1.0.0", endpoint
 * GET /accounts/v1/accounts/{accountID}/transactions). Esquemas bajo ISO 20022, OAS 3.1, FAPI 2.0.
 *
 * Reglas de formato confirmadas contra el ejemplo oficial de respuesta:
 *  - `amount`: NÚMERO positivo (sin signo). El signo lo determina `transactionType`.
 *  - `transactionType`: enum en español con tilde — "Débito" (salida) | "Crédito" (entrada).
 *  - `currency`: código ISO 4217 en campo aparte ("CLP"). Decimales según la moneda
 *    (CLP=0 → enteros; USD=2; CLF/UF=4).
 *  - `bookingDateTime`: ISO 8601 en UTC ("2025-02-10T10:00:00Z").
 *  - `balanceAfter`: saldo corrido tras el movimiento (opcional; el banco lo provee, una
 *    cartola PDF puede no traerlo por transacción).
 */

export type SfaTransactionType = 'Débito' | 'Crédito';

export interface SfaTransaction {
  transactionID: string;
  bookingDateTime: string; // ISO 8601 UTC
  transactionType: SfaTransactionType;
  amount: number; // positivo; decimales según ISO 4217 de `currency`
  currency: string; // ISO 4217
  description: string;
  balanceAfter?: number;
}

export interface SfaTransactionsResponse {
  data: { transactions: SfaTransaction[] };
  links: { self: string; next?: string; prev?: string };
  meta: { totalRecords: number; totalPages: number };
}

/** Decimales por moneda (ISO 4217 minor unit). Default 2 para monedas no listadas. */
export const ISO4217_MINOR_UNITS: Record<string, number> = {
  CLP: 0, // peso chileno: entero
  JPY: 0,
  CLF: 4, // UF
  USD: 2,
  EUR: 2,
};

export function minorUnits(currency: string): number {
  return ISO4217_MINOR_UNITS[currency?.toUpperCase?.()] ?? 2;
}
