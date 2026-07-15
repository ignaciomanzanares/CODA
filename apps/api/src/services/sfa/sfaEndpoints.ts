/**
 * Catálogo de endpoints del SFA (CMF Chile) — confirmados desde el data dictionary oficial
 * (espacio OFAC, specs v1.0.0: API Cuentas, Tarjetas de Crédito, Operaciones de Crédito).
 *
 * Es el mapa que usará el conector SFA real (`SfaProvider implements OBProvider`) cuando CODA
 * consuma las APIs como PSBI. NO inventa esquemas de payload: solo registra rutas + el contrato
 * de transporte/seguridad confirmado. Los modelos de respuesta de movimientos están en
 * sfaTypes.ts (confirmados); los de saldo/cupo/datos-generales quedan pendientes de ejemplo
 * oficial (ver README.md de este directorio).
 */

/** Contrato de transporte/seguridad común a todas las APIs (FAPI 2.0). */
export const SFA_CONTRACT = {
  headers: {
    authorization: "Authorization", // Bearer JWT emitido por el AS registrado ante la CMF
    interactionId: "x-fapi-interaction-id", // UUID de correlación generado por el PSBI/PSIP
    jwsSignature: "x-jws-signature", // firma JWS del cuerpo (compact serialization)
  },
  accept: "application/json",
  pagination: {
    pageParam: "page",
    pageSizeParam: "pageSize",
    defaultPageSize: 25,
    maxPageSize: 1000,
  },
  dateRangeParams: { from: "fromDate", to: "toDate" }, // YYYY-MM-DD
} as const;

/**
 * Rutas relativas por familia de producto, tal como aparecen en el data dictionary.
 * El prefijo de versión confirmado para Cuentas es `/accounts/v1` (de la petición de ejemplo
 * oficial: GET /accounts/v1/accounts/{accountID}/transactions). Los prefijos de Tarjetas y
 * Créditos no están confirmados aún → se marcan TBD.
 */
export const SFA_ENDPOINTS = {
  accounts: {
    base: "/accounts/v1", // confirmado
    list: "/accounts",
    detail: "/accounts/{accountID}",
    balance: "/accounts/{accountID}/balance",
    overdraftLimit: "/accounts/{accountID}/current-overdraft-limit",
    overdraft: "/accounts/{accountID}/overdraft",
    transactions: "/accounts/{accountID}/transactions", // schema confirmado (sfaTypes.ts)
  },
  creditCards: {
    base: "/credit-card-accounts/v1", // confirmado (self link de los ejemplos)
    list: "/accounts",
    detail: "/accounts/{creditCardAccountID}",
    balance: "/accounts/{creditCardAccountID}/balance", // schema confirmado (SfaCreditCardBalance)
    currentBalance: "/accounts/{creditCardAccountID}/current-balance",
    limit: "/accounts/{creditCardAccountID}/limit", // schema confirmado (SfaCreditCardLimit)
    transactions: "/accounts/{creditCardAccountID}/transactions", // mismo schema de movimientos
  },
  investments: {
    base: "/investments/v1", // confirmado
    detail: "/investments/{investmentID}", // schema confirmado (SfaInvestment)
    balance: "/investments/{investmentID}/balance", // schema confirmado (SfaInvestmentBalance)
  },
  loans: {
    base: "/loans/v1", // confirmado (self link de los ejemplos oficiales)
    list: "/loans",
    detail: "/loans/{loanID}", // schema confirmado (sfaTypes.SfaLoan)
    balance: "/loans/{loanID}/balance", // schema confirmado (sfaTypes.SfaLoanBalance)
    currentTransactions: "/loans/{loanID}/current-transactions", // mismo schema de movimientos
  },
} as const;
