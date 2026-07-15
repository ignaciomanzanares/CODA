/**
 * SFA (Sistema de Finanzas Abiertas) - Modelos de datos
 *
 * Basado en:
 * - NCG 514 y Anexo 3 CMF (actualización enero 2026)
 * - Tablas de Datos SFA: DATOS SFA.csv, CÓDIGO DE PRODUCTOS SFA.csv,
 *   Información transaccional.csv, Productos vigentes.csv
 *
 * CODA actúa como PSBI (Prestador de Servicios que Accede a Información Bancaria).
 */

// =============================================================================
// RUT - Formato Chile
// =============================================================================

/**
 * RUT chileno según SFA: formato 11.111.111-1 (puntos como separador de miles, guión antes del dígito verificador).
 * Aplicable a personas naturales y jurídicas.
 * Validación estricta debe realizarse en runtime (regex/álgebra del dígito verificador).
 */
export type Rut = string;

/** Regex para validar formato RUT SFA (11.111.111-1). No valida dígito verificador. */
export const RUT_FORMAT_REGEX = /^\d{1,2}\.\d{3}\.\d{3}-[\dkK]$/;

// =============================================================================
// FRECUENCIAS DE ACTUALIZACIÓN SFA (DATOS SFA.csv)
// Para lógica de caché: TTL y ventanas de sincronización.
// =============================================================================

/**
 * Términos y condiciones.
 * Actualización: Semanal.
 * Tiempo para disponer en SFA: Hasta 5 minutos.
 * Historia del dato: No aplica.
 * Proveen: IPI. Acceden: PSBI.
 */
export const SFA_UPDATE_TERMS_AND_CONDITIONS = "weekly" as const;
export const SFA_UPDATE_TERMS_AND_CONDITIONS_TTL_MINUTES = 5;

/**
 * Canales de atención (locales, sitios web, ATM).
 * Actualización: Semanal.
 * Tiempo para disponer en SFA: Hasta 5 minutos.
 * Proveen: IPI. Acceden: PSBI.
 */
export const SFA_UPDATE_CHANNELS = "weekly" as const;
export const SFA_UPDATE_CHANNELS_TTL_MINUTES = 5;

/**
 * Enrolamiento (datos que provee el cliente al enrolarse).
 * Actualización: Diaria.
 * Tiempo para disponer en SFA: Hasta 5 minutos.
 * Alcance: Personas jurídicas y naturales.
 * Proveen: IPI. Acceden: PSBI.
 */
export const SFA_UPDATE_ENROLLMENT = "daily" as const;
export const SFA_UPDATE_ENROLLMENT_TTL_MINUTES = 5;

/**
 * Posiciones financieras históricas (productos del cliente en el tiempo, activos y pasivos).
 * Actualización: Mensual (saldo a fin de mes).
 * Periodo histórico: 12 meses.
 * Tiempo para disponer en SFA: Hasta 5 minutos.
 * Proveen: IPI (según Anexo N°1). Acceden: PSBI.
 */
export const SFA_UPDATE_HISTORICAL_POSITIONS = "monthly" as const;
export const SFA_UPDATE_HISTORICAL_POSITIONS_MONTHS = 12;
export const SFA_UPDATE_HISTORICAL_POSITIONS_TTL_MINUTES = 5;

/**
 * Historia de uso y transacciones.
 * Actualización: Diaria.
 * Unidad de tiempo: Por fecha de uso o contratación.
 * Periodo histórico: 12 meses.
 * Tiempo para disponer en SFA: Hasta 5 minutos.
 * Proveen: IPI (según Anexo N°1). Acceden: PSBI y PSIP.
 */
export const SFA_UPDATE_TRANSACTIONS = "daily" as const;
export const SFA_UPDATE_TRANSACTIONS_MONTHS = 12;
export const SFA_UPDATE_TRANSACTIONS_TTL_MINUTES = 5;

/**
 * Productos vigentes (información en línea vigente a fecha de consulta).
 * Tiempo para disponer en SFA: Hasta 5 minutos.
 * Sin profundidad histórica.
 * Proveen: IPI (según Anexo N°1). Acceden: PSBI.
 */
export const SFA_UPDATE_PRODUCTS_VIGENTES = "realtime" as const;
export const SFA_UPDATE_PRODUCTS_VIGENTES_TTL_MINUTES = 5;

/**
 * Iniciación de pagos.
 * Actualización: Tiempo real.
 * Participantes: IPC y PSIP.
 */
export const SFA_UPDATE_PAYMENT_INITIATION = "realtime" as const;

/** Resumen de frecuencias para documentación y caché */
export const SFA_UPDATE_FREQUENCIES = {
  terms_and_conditions: {
    frequency: SFA_UPDATE_TERMS_AND_CONDITIONS,
    ttlMinutes: SFA_UPDATE_TERMS_AND_CONDITIONS_TTL_MINUTES,
  },
  channels: { frequency: SFA_UPDATE_CHANNELS, ttlMinutes: SFA_UPDATE_CHANNELS_TTL_MINUTES },
  enrollment: { frequency: SFA_UPDATE_ENROLLMENT, ttlMinutes: SFA_UPDATE_ENROLLMENT_TTL_MINUTES },
  historical_positions: {
    frequency: SFA_UPDATE_HISTORICAL_POSITIONS,
    months: SFA_UPDATE_HISTORICAL_POSITIONS_MONTHS,
    ttlMinutes: SFA_UPDATE_HISTORICAL_POSITIONS_TTL_MINUTES,
  },
  transactions: {
    frequency: SFA_UPDATE_TRANSACTIONS,
    months: SFA_UPDATE_TRANSACTIONS_MONTHS,
    ttlMinutes: SFA_UPDATE_TRANSACTIONS_TTL_MINUTES,
  },
  products_vigentes: {
    frequency: SFA_UPDATE_PRODUCTS_VIGENTES,
    ttlMinutes: SFA_UPDATE_PRODUCTS_VIGENTES_TTL_MINUTES,
  },
  payment_initiation: { frequency: SFA_UPDATE_PAYMENT_INITIATION },
} as const;

// =============================================================================
// CÓDIGOS DE PRODUCTO SFA (CÓDIGO DE PRODUCTOS SFA.csv)
// =============================================================================

/** Códigos de producto SFA - Cuentas (categoría a) */
export const SFA_PRODUCT_CODES_ACCOUNTS = [
  "A001", // Cuenta corriente
  "A002", // Cuenta vista
  "A003", // Cuenta RUT
  "A004", // Cuenta con provisión de fondos
  "A005", // Cuentas de ahorro para la vivienda
  "A006", // Cuentas de ahorro con giro diferido
  "A007", // Cuentas de ahorro con giro incondicional
] as const;

/** Códigos de producto SFA - Tarjetas de crédito (categoría b) */
export const SFA_PRODUCT_CODES_CREDIT_CARDS = ["B001"] as const;

/** Códigos de producto SFA - Créditos de dinero (categoría c) */
export const SFA_PRODUCT_CODES_LOANS = [
  "C001",
  "C002",
  "C003",
  "C004", // Consumo
  "C005",
  "C006",
  "C007",
  "C008",
  "C009",
  "C010",
  "C011", // Hipotecario
  "C012",
  "C013",
  "C014",
  "C015",
  "C016", // Comercial
  "C017",
  "C018",
  "C019", // Estudiantiles
] as const;

/** Códigos de producto SFA - Seguros (categoría d) - subconjunto representativo */
export const SFA_PRODUCT_CODES_INSURANCE = [
  "D001",
  "D002",
  "D003",
  "D004",
  "D005",
  "D006",
  "D007",
  "D008",
  "D009",
  "D010",
  "D011",
  "D012",
  "D013",
  "D014",
  "D015",
  "D016",
  "D017",
  "D018",
  "D020",
  "D021",
  "D022",
  "D023",
  "D024",
  "D025",
  "D026",
  "D027",
  "D028",
  "D029",
  "D030",
  "D031",
  "D032",
  "D033",
  "D034",
  "D035",
  "D036",
  "D050",
  "D101",
  "D102",
  "D103",
  "D104",
  "D105",
  "D106",
  "D107",
  "D108",
  "D109",
  "D110",
  "D111",
  "D112",
  "D113",
  "D114",
  "D150",
  "D201",
  "D202",
  "D203",
  "D204",
  "D205",
  "D206",
  "D207",
  "D208",
  "D209",
  "D210",
  "D211",
  "D212",
  "D213",
  "D214",
  "D250",
  "D301",
  "D302",
  "D303",
  "D304",
  "D305",
  "D306",
  "D307",
  "D350",
  "D421",
  "D421-1",
  "D421-2",
  "D422",
  "D422-1",
  "D422-2",
  "D423",
  "D424",
  "D425",
] as const;

/** Códigos de producto SFA - Instrumentos de ahorro/inversión (categoría e) */
export const SFA_PRODUCT_CODES_INVESTMENT = [
  "E001",
  "E002",
  "E003", // Depósitos a plazo
  "E101",
  "E102",
  "E103",
  "E104",
  "E105",
  "E106",
  "E107",
  "E108", // Fondos mutuos
  "E201",
  "E202", // Fondos de inversión
] as const;

/** Códigos de producto SFA - Operación de tarjetas de pago (categoría f) */
export const SFA_PRODUCT_CODES_PAYMENT_CARDS = ["F001"] as const;

/** Códigos de producto SFA - Prestadoras de servicios financieros (categoría g) */
export const SFA_PRODUCT_CODES_PSF = ["G001", "G002", "G003", "G004", "G005"] as const;

/** Unión de todos los códigos de producto SFA (tabla oficial CMF) */
export type SfaProductCode =
  | (typeof SFA_PRODUCT_CODES_ACCOUNTS)[number]
  | (typeof SFA_PRODUCT_CODES_CREDIT_CARDS)[number]
  | (typeof SFA_PRODUCT_CODES_LOANS)[number]
  | (typeof SFA_PRODUCT_CODES_INSURANCE)[number]
  | (typeof SFA_PRODUCT_CODES_INVESTMENT)[number]
  | (typeof SFA_PRODUCT_CODES_PAYMENT_CARDS)[number]
  | (typeof SFA_PRODUCT_CODES_PSF)[number];

/** Moneda según tabla 1 del Manual de Sistema de Información (MSI) */
export type SfaCurrencyCode = string; // e.g. 'CLP', 'USD'

// =============================================================================
// INFORMACIÓN TRANSACCIONAL (Información transaccional.csv)
// =============================================================================

/** Categoría de la operación - Cuentas (transferencias, débito, ATM, otra) */
export type SfaTransactionCategoryOperation =
  "transferencia" | "compra_con_debito" | "operacion_cajero_automatico" | "otra";

/** Tipo de operación: abono o cargo */
export type SfaTipoOperacion = "abono" | "cargo";

/** Tipo de operación tarjeta: cuotas, avance en efectivo, rotativo */
export type SfaTipoOperacionTarjeta = "cuotas" | "avance_efectivo" | "rotativo";

/** Tipo de operación depósitos/fondos/APV: contratación, aporte, rescate */
export type SfaTipoOperacionInversion = "contratacion" | "aporte" | "rescate";

/**
 * Transacción SFA - Cuentas (a): corrientes, vista, provisión de fondos, ahorro.
 * Actualización diaria; periodo histórico 12 meses.
 */
export interface SfaTransaccionCuenta {
  /** RUT con formato 11.111.111-1 */
  rutCliente: Rut;
  /** ID único que permite trazabilidad de la operación */
  idInternoTransaccion: string;
  /** Fecha de la operación (año-mes-día-hora) */
  fechaOperacion: string;
  /** Fecha contable de la operación (año-mes-día-hora) */
  fechaContableOperacion: string;
  /** Código tabla productos SFA (ej. A001) */
  tipoProductoFinanciero: SfaProductCode;
  /** Categoría comercial asociada al producto (texto) */
  categoriaComercial?: string | null;
  /** Transferencias, compra con débito, operación en cajero automático, otra */
  categoriaOperacion?: SfaTransactionCategoryOperation | null;
  /** Abono o cargo */
  tipoOperacion: SfaTipoOperacion;
  /** Monto original de la operación */
  montoOperacion: number;
  /** En cargos: indica si el cargo es contra comercio o no */
  tipoPersona?: string | null;
  /** RUT contraparte (formato 11.111.111-1) */
  rutContraparte?: Rut | null;
  /** Nombre contraparte */
  nombreContraparte?: string | null;
  /** Moneda según tabla 1 MSI */
  monedaOperacion: SfaCurrencyCode;
}

/**
 * Transacción SFA - Tarjetas de crédito (b).
 * Incluye información del comercio (Decreto 44/2012 MINECON) cuando aplica.
 */
export interface SfaTransaccionTarjetaCredito {
  rutCliente: Rut;
  /** ID del producto. Único que permite la trazabilidad */
  idInternoProducto: string;
  tipoProductoFinanciero: SfaProductCode;
  categoriaComercial?: string | null;
  fechaOperacion: string;
  fechaContableOperacion: string;
  /** Cuotas, avance en efectivo, rotativo */
  tipoOperacion: SfaTipoOperacionTarjeta;
  montoOperacion: number;
  monedaOperacion: SfaCurrencyCode;
  tipoPersona?: string | null;
  /** Información del comercio conforme Decreto 44/2012 MINECON */
  informacionComercio?: string | null;
}

/**
 * Transacción SFA - Operaciones de crédito de dinero (c).
 * Fechas en año-mes-día.
 */
export interface SfaTransaccionCredito {
  rutCliente: Rut;
  idInternoProducto: string;
  fechaOperacion: string;
  fechaContableOperacion: string;
  tipoProductoFinanciero: SfaProductCode;
  categoriaComercial?: string | null;
  montoOperacion: number;
  monedaCredito: SfaCurrencyCode;
  tasaInteresAnual?: number | null;
  /** Plazo en meses */
  plazoCreditoMeses?: number | null;
  /** Tabla 62 manual sistema de información bancario */
  vinculacionInstrumentoFomento?: string | null;
  montoGarantia?: number | null;
}

/**
 * Transacción SFA - Depósitos a plazo (e).
 */
export interface SfaTransaccionDepositoPlazo {
  rutCliente: Rut;
  idInternoProducto: string;
  tipoProductoFinanciero: SfaProductCode;
  categoriaComercial?: string | null;
  /** Depósito a plazo fijo, renovable o indefinido */
  tipoPlazo?: string | null;
  tipoOperacion: SfaTipoOperacionInversion;
  fechaOperacion: string;
  montoOperacion: number;
  moneda: SfaCurrencyCode;
  /** Plazo original del depósito en días */
  plazoDepositoDias?: number | null;
  tasaInteresEfectivaAnualizada?: number | null;
}

/**
 * Transacción SFA - Fondos mutuos y fondos de inversión (e).
 */
export interface SfaTransaccionFondo {
  rutCliente: Rut;
  idInternoProducto: string;
  tipoProductoFinanciero: SfaProductCode;
  serie?: string | null;
  categoriaComercial?: string | null;
  nemotecnico?: string | null;
  fechaOperacion: string;
  tipoOperacion: SfaTipoOperacionInversion;
  montoOperacion: number;
}

/**
 * Transacción SFA - APV (e).
 */
export interface SfaTransaccionAPV {
  rutCliente: Rut;
  idInternoProducto: string;
  tipoProductoFinanciero: SfaProductCode;
  categoriaComercial?: string | null;
  fechaContratacion: string;
  tipoOperacion: SfaTipoOperacionInversion;
  aporteRescate: number;
  moneda: SfaCurrencyCode;
}

/** Unión de todos los tipos de transacción SFA */
export type SfaTransaccion =
  | SfaTransaccionCuenta
  | SfaTransaccionTarjetaCredito
  | SfaTransaccionCredito
  | SfaTransaccionDepositoPlazo
  | SfaTransaccionFondo
  | SfaTransaccionAPV;

// =============================================================================
// PRODUCTOS VIGENTES (Productos vigentes.csv)
// Información en línea vigente a fecha de consulta. TTL caché: hasta 5 min.
// =============================================================================

/**
 * Producto vigente - Cuentas (a): saldo y líneas de crédito/sobregiro.
 */
export interface SfaProductoVigenteCuenta {
  rutCliente: Rut;
  idInternoProducto: string;
  /** Fecha de contratación (año-mes-día) */
  fechaContratacionProducto: string;
  tipoProductoFinanciero: SfaProductCode;
  categoriaComercial?: string | null;
  /** Saldo vigente */
  saldo: number;
  moneda: SfaCurrencyCode;
  /** Monto total de la línea */
  lineaCreditoSobregiroTotal?: number | null;
  /** Monto de la línea utilizada */
  lineaCreditoSobregiroUtilizada?: number | null;
  /** Monto de la línea disponible */
  lineaCreditoSobregiroDisponible?: number | null;
}

/** Tipo de deuda tarjeta: cuotas, avance en efectivo, rotativo */
export type SfaTipoDeudaTarjeta = "cuotas" | "avance_efectivo" | "rotativo";

/**
 * Producto vigente - Tarjetas de crédito (b).
 */
export interface SfaProductoVigenteTarjeta {
  rutCliente: Rut;
  idInternoProducto: string;
  fechaContratacionProducto: string;
  tipoProductoFinanciero: SfaProductCode;
  categoriaComercial?: string | null;
  tipoDeuda?: SfaTipoDeudaTarjeta | null;
  saldo: number;
  moneda: SfaCurrencyCode;
  lineaTotalAprobada?: number | null;
  lineaNoUtilizada?: number | null;
}

/**
 * Producto vigente - Operaciones de crédito de dinero (c).
 */
export interface SfaProductoVigenteCredito {
  rutCliente: Rut;
  idInternoProducto: string;
  tipoProductoFinanciero: SfaProductCode;
  categoriaComercial?: string | null;
  saldo: number;
  moneda: SfaCurrencyCode;
  /** Nivel de mora del crédito */
  nivelMora?: string | null;
  vinculacionInstrumentoFomento?: string | null;
  montoGarantia?: number | null;
}

/**
 * Producto vigente - Pólizas de seguro (d).
 */
export interface SfaProductoVigenteSeguro {
  rutCliente: Rut;
  idInternoProducto: string;
  numeroPoliza?: string | null;
  numeroClausulaAdicionalCad?: string | null;
  fechaContratacionProducto: string;
  fechaVigenciaInicio?: string | null;
  fechaVigenciaFin?: string | null;
  tipoProductoFinanciero: SfaProductCode;
  categoriaComercial?: string | null;
  primaVigente?: number | null;
  periodicidadPrima?: "mensual" | "anual" | "unica" | null;
  frecuenciaPagoPrima?: "mensual" | "anual" | "unica" | null;
  tipoVenta?: "directa" | "intermediada" | null;
  rutCorredor?: Rut | null;
  nombreCorredor?: string | null;
  montoAsegurado?: number | null;
  monedaMontoAsegurado?: SfaCurrencyCode | null;
}

/** Tipo de plazo depósito: fijo, renovable, indefinido */
export type SfaTipoPlazoDeposito = "plazo_fijo" | "plazo_renovable" | "plazo_indefinido";

/**
 * Producto vigente - Depósitos a plazo (e).
 */
export interface SfaProductoVigenteDepositoPlazo {
  rutCliente: Rut;
  idInternoProducto: string;
  tipoInstrumento: SfaProductCode;
  categoriaComercial?: string | null;
  tipoPlazo?: SfaTipoPlazoDeposito | null;
  fechaContratacionProducto: string;
  saldo: number;
  monedaInversion: SfaCurrencyCode;
  plazoDepositoDias?: number | null;
  plazoRemanenteDias?: number | null;
  tasaInteresEfectivaAnualizada?: number | null;
}

/**
 * Producto vigente - Fondos mutuos y fondos de inversión (e).
 */
export interface SfaProductoVigenteFondo {
  rutCliente: Rut;
  idInternoProducto: string;
  tipoProductoFinanciero: SfaProductCode;
  serie?: string | null;
  categoriaComercial?: string | null;
  nemotecnico?: string | null;
  fechaContratacionProducto: string;
  saldo: number;
  monedaActivo: SfaCurrencyCode;
}

/**
 * Producto vigente - APV (e).
 */
export interface SfaProductoVigenteAPV {
  rutCliente: Rut;
  idInternoProducto: string;
  tipoProductoFinanciero: SfaProductCode;
  categoriaComercial?: string | null;
  fechaContratacionProducto: string;
  saldo: number;
  monedaInversion: SfaCurrencyCode;
}

/**
 * Producto vigente - Servicios de operación de tarjetas de pago (f).
 */
export interface SfaProductoVigenteTarjetaPago {
  rutCliente: Rut;
  tipoProductoFinanciero: SfaProductCode;
  categoriaComercial?: string | null;
  /** Indica si tiene contrato de afiliación vigente */
  vigenciaContratoAfiliacion?: boolean | null;
}

/** Unión de todos los tipos de producto vigente SFA */
export type SfaProductoVigente =
  | SfaProductoVigenteCuenta
  | SfaProductoVigenteTarjeta
  | SfaProductoVigenteCredito
  | SfaProductoVigenteSeguro
  | SfaProductoVigenteDepositoPlazo
  | SfaProductoVigenteFondo
  | SfaProductoVigenteAPV
  | SfaProductoVigenteTarjetaPago;
