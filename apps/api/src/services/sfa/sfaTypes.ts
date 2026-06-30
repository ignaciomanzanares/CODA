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

/**
 * Datos generales de una operación de crédito — GET /loans/v1/loans/{loanID}.
 * Confirmado contra ejemplo oficial. Enums tipados con los valores observados (string abierto
 * para tolerar valores no vistos aún). Montos enteros CLP; fechas ISO 8601 date-only.
 */
export interface SfaLoan {
  loanID: string;
  productName: string;
  loanType: 'CONSUMO' | 'HIPOTECARIO' | 'COMERCIAL' | (string & {});
  status: 'VIGENTE' | 'MOROSO' | 'PAGADO' | 'CASTIGADO' | (string & {});
  approvedAmount: number;
  currency: string; // ISO 4217
  disbursementDate: string; // ISO 8601 date
  maturityDate: string; // ISO 8601 date
  interestRate: number;
  rateType: 'FIJA' | 'VARIABLE' | (string & {});
  installmentFrequency: 'MENSUAL' | 'TRIMESTRAL' | 'ANUAL' | (string & {});
  totalInstallments: number;
  gracePeriod: number;
  collateralDetails: unknown | null;
}

export interface SfaLoanResponse {
  data: { loan: SfaLoan };
  links: { self: string };
  meta: { requestDateTime: string };
}

/**
 * Saldo de una operación de crédito — GET /loans/v1/loans/{loanID}/balance.
 * Confirmado contra ejemplo oficial. Montos enteros en CLP (ISO 4217); fechas de cuota/pago
 * son ISO 8601 date-only (YYYY-MM-DD); `accruedLateInterest > 0` = señal de mora.
 */
export interface SfaLoanBalance {
  outstandingPrincipal: number; // capital vigente
  accruedInterest: number; // interés devengado
  accruedLateInterest: number; // interés por mora (atraso)
  nextInstallmentAmount: number;
  nextInstallmentDueDate: string; // ISO 8601 date
  currency: string; // ISO 4217
  lastPaymentAmount: number;
  lastPaymentDate: string; // ISO 8601 date
}

export interface SfaLoanBalanceResponse {
  data: { balance: SfaLoanBalance };
  links: { self: string };
  meta: { requestDateTime: string }; // ISO 8601 UTC
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
