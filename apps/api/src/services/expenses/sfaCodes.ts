/**
 * SFA Product Codes (NCG 514 - CMF Chile)
 *
 * Codificación oficial del Sistema de Finanzas Abiertas para
 * identificar tipos de producto financiero.
 *
 * Reference: Tablas de Datos SFA.xlsx → Sheet "CÓDIGO DE PRODUCTOS SFA"
 */

export interface SfaProductCode {
  code: string;
  category: string;
  subcategory: string;
  name: string;
}

export const SFA_PRODUCT_CODES: Record<string, SfaProductCode> = {
  // a) Cuentas
  A001: { code: "A001", category: "cuentas", subcategory: "corriente", name: "Cuenta corriente" },
  A002: { code: "A002", category: "cuentas", subcategory: "vista", name: "Cuenta a la vista" },
  A003: { code: "A003", category: "cuentas", subcategory: "vista", name: "Cuenta RUT" },
  A004: {
    code: "A004",
    category: "cuentas",
    subcategory: "provision",
    name: "Cuenta con provisión de fondos",
  },
  A005: {
    code: "A005",
    category: "cuentas",
    subcategory: "ahorro",
    name: "Cuenta de ahorro para la vivienda",
  },
  A006: {
    code: "A006",
    category: "cuentas",
    subcategory: "ahorro",
    name: "Cuenta de ahorro con giro diferido",
  },
  A007: {
    code: "A007",
    category: "cuentas",
    subcategory: "ahorro",
    name: "Cuenta de ahorro con giro incondicional",
  },

  // b) Tarjetas de crédito
  B001: { code: "B001", category: "tarjetas", subcategory: "credito", name: "Tarjeta de crédito" },

  // c) Operaciones de crédito de dinero
  C001: {
    code: "C001",
    category: "creditos",
    subcategory: "consumo",
    name: "Crédito en cuotas (no descuento planilla)",
  },
  C002: {
    code: "C002",
    category: "creditos",
    subcategory: "consumo",
    name: "Crédito en cuotas (descuento planilla)",
  },
  C003: {
    code: "C003",
    category: "creditos",
    subcategory: "linea",
    name: "Línea de crédito en cuenta corriente",
  },
  C004: {
    code: "C004",
    category: "creditos",
    subcategory: "consumo",
    name: "Otros créditos de consumo",
  },
  C005: {
    code: "C005",
    category: "creditos",
    subcategory: "hipotecario",
    name: "Hipotecario - letras de crédito",
  },
  C006: {
    code: "C006",
    category: "creditos",
    subcategory: "hipotecario",
    name: "Hipotecario - mutuo endosable",
  },
  C007: {
    code: "C007",
    category: "creditos",
    subcategory: "hipotecario",
    name: "Hipotecario - ANAP",
  },
  C008: {
    code: "C008",
    category: "creditos",
    subcategory: "hipotecario",
    name: "Hipotecario - mutuo no endosable",
  },
  C009: {
    code: "C009",
    category: "creditos",
    subcategory: "hipotecario",
    name: "Hipotecario - otros",
  },
  C010: {
    code: "C010",
    category: "creditos",
    subcategory: "hipotecario",
    name: "Bonos hipotecarios",
  },
  C011: {
    code: "C011",
    category: "creditos",
    subcategory: "hipotecario",
    name: "Créditos hipotecarios complementarios",
  },
  C012: {
    code: "C012",
    category: "creditos",
    subcategory: "comercial",
    name: "Créditos interbancarios",
  },
  C013: {
    code: "C013",
    category: "creditos",
    subcategory: "comercial",
    name: "Créditos comerciales",
  },
  C014: { code: "C014", category: "creditos", subcategory: "comercial", name: "Factoring" },
  C015: { code: "C015", category: "creditos", subcategory: "comercial", name: "Leasing" },
  C016: {
    code: "C016",
    category: "creditos",
    subcategory: "comercial",
    name: "Crédito hipotecario con fines generales",
  },
  C017: {
    code: "C017",
    category: "creditos",
    subcategory: "estudiantil",
    name: "Crédito estudiantil Ley 20.027",
  },
  C018: {
    code: "C018",
    category: "creditos",
    subcategory: "estudiantil",
    name: "Crédito estudiantil garantía CORFO",
  },
  C019: {
    code: "C019",
    category: "creditos",
    subcategory: "estudiantil",
    name: "Otros créditos estudiantiles",
  },

  // e) Instrumentos de ahorro o inversión
  E001: {
    code: "E001",
    category: "inversion",
    subcategory: "deposito",
    name: "Depósito a plazo fijo",
  },
  E002: {
    code: "E002",
    category: "inversion",
    subcategory: "deposito",
    name: "Depósito a plazo renovable",
  },
  E003: {
    code: "E003",
    category: "inversion",
    subcategory: "deposito",
    name: "Depósito a plazo indefinido",
  },
  E101: {
    code: "E101",
    category: "inversion",
    subcategory: "fondos_mutuos",
    name: "Fondo mutuo deuda ≤90d",
  },
  E102: {
    code: "E102",
    category: "inversion",
    subcategory: "fondos_mutuos",
    name: "Fondo mutuo deuda ≤365d",
  },
  E103: {
    code: "E103",
    category: "inversion",
    subcategory: "fondos_mutuos",
    name: "Fondo mutuo deuda mediano/largo plazo",
  },
  E104: {
    code: "E104",
    category: "inversion",
    subcategory: "fondos_mutuos",
    name: "Fondo mutuo mixto",
  },
  E105: {
    code: "E105",
    category: "inversion",
    subcategory: "fondos_mutuos",
    name: "Fondo mutuo capitalización",
  },
  E106: {
    code: "E106",
    category: "inversion",
    subcategory: "fondos_mutuos",
    name: "Fondo mutuo libre inversión",
  },

  // f) Tarjetas de pago
  F001: {
    code: "F001",
    category: "tarjetas",
    subcategory: "pago",
    name: "Operación de tarjetas de pago",
  },
};

/**
 * SFA Operation Categories per NCG 514
 * Reference: "Información transaccional" sheet - "Categoría de la operación"
 */
export type SfaOperationCategory =
  | "transferencia"
  | "compra_debito"
  | "cajero_automatico"
  | "compra_credito"
  | "pago_cuota"
  | "avance_efectivo"
  | "otra";

/**
 * SFA Operation Type
 * Reference: "Información transaccional" sheet - "Tipo de operación"
 */
export type SfaOperationType = "abono" | "cargo";

/**
 * SFA Transaction structure per NCG 514
 */
export interface SfaTransaction {
  rutCliente: string;
  idTransaccion: string;
  fechaOperacion: string; // año-mes-día-hora
  fechaContable: string; // año-mes-día-hora
  tipoProducto: string; // SFA product code (A001, B001, etc.)
  categoriaComercial?: string;
  categoriaOperacion: SfaOperationCategory;
  tipoOperacion: SfaOperationType;
  montoOperacion: number;
  tipoPersona?: string;
  rutContraparte?: string;
  nombreContraparte?: string;
  moneda: string; // MSI Table 1 (CLP, USD, UF, etc.)
}

/**
 * SFA Payment Initiation structure per NCG 514
 * Reference: "Iniciación de Pagos" sheet
 */
export interface SfaPaymentInitiation {
  tipoOperacion: "orden_pago" | "tef" | "pago_recurrente";
  periodicidad?: string;
  limitePagos?: { min: number; max: number };
  institucionOrigen: string;
  cuentaOrigen: string;
  tipoCuentaOrigen: string; // SFA product code
  rutPagador: string;
  nombrePagador: string;
  institucionDestino: string;
  cuentaDestino: string;
  tipoCuentaDestino: string; // SFA product code
  rutReceptor: string;
  nombreReceptor: string;
  monto: number;
  moneda: string;
  fechaHoraOperacion: string; // DD-MM-AAAA HH:MM:SS
}

/**
 * Maps common expense categories to the most relevant SFA product code
 */
export function mapExpenseCategoryToSfaCode(
  paymentMethod?: string,
  operationCategory?: SfaOperationCategory,
): string {
  if (!paymentMethod) return "A002"; // Default: cuenta vista

  const method = paymentMethod.toLowerCase();
  if (method.includes("credito") || method.includes("credit")) return "B001";
  if (method.includes("debito") || method.includes("debit")) return "A002";
  if (method.includes("corriente")) return "A001";
  if (method.includes("rut") || method.includes("cuentarut")) return "A003";
  if (method.includes("prepago") || method.includes("prepaid")) return "A004";
  if (method.includes("linea") || method.includes("sobregiro")) return "C003";

  return "A002";
}

/**
 * Classify operation category from description
 */
export function classifyOperationCategory(description: string): SfaOperationCategory {
  const desc = description.toLowerCase();

  if (desc.includes("transferencia") || desc.includes("tef") || desc.includes("traspaso")) {
    return "transferencia";
  }
  if (desc.includes("compra") || desc.includes("pos") || desc.includes("venta")) {
    return "compra_debito";
  }
  if (desc.includes("cajero") || desc.includes("atm") || desc.includes("giro")) {
    return "cajero_automatico";
  }
  if (desc.includes("pago") || desc.includes("cuota") || desc.includes("pac")) {
    return "pago_cuota";
  }
  if (desc.includes("avance") || desc.includes("cash advance")) {
    return "avance_efectivo";
  }

  return "otra";
}

/**
 * Validate Chilean RUT format
 */
export function isValidRut(rut: string): boolean {
  const cleaned = rut.replace(/\./g, "").replace(/-/g, "");
  if (cleaned.length < 2) return false;

  const body = cleaned.slice(0, -1);
  const dv = cleaned.slice(-1).toUpperCase();

  let sum = 0;
  let mul = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += parseInt(body[i]) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }

  const expected = 11 - (sum % 11);
  const expectedDv = expected === 11 ? "0" : expected === 10 ? "K" : expected.toString();

  return dv === expectedDv;
}

/**
 * Format RUT to standard display: XX.XXX.XXX-X
 */
export function formatRut(rut: string): string {
  const cleaned = rut.replace(/\./g, "").replace(/-/g, "");
  if (cleaned.length < 2) return rut;

  const body = cleaned.slice(0, -1);
  const dv = cleaned.slice(-1);

  const formatted = body.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${formatted}-${dv}`;
}
