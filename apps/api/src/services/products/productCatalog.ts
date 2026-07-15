/**
 * Product Catalog for Chilean Financial Institutions
 * Real products from major banks with pricing from TAM analysis
 *
 * Pricing Model (from TAM/Pricing sheet):
 * - Créditos Consumo: Lead fee CLP 10,000 + 60 bps success fee
 * - Créditos Hipotecarios: Lead fee CLP 10,000 + 30 bps success fee
 * - Tarjetas de Crédito: CLP 60,000 approval + CLP 30,000 activation bonus
 * - Cuentas Corrientes: CLP 15,000 apertura + CLP 30,000 bonus primer abono
 * - Seguros: 12% auto, 15% hogar, 20% vida (sobre prima anual)
 */

export interface ProductCatalogItem {
  /** Id del producto en la BD (`financial_products`). El catálogo estático no lo trae; los
   *  productos cargados de BD sí. Se usa para mapear pesos de conversión por producto (#35). */
  id?: number;
  productName: string;
  provider: string;
  productType: string;
  category: "loans" | "credit_cards" | "savings" | "insurance";
  interestRate?: number; // Annual percentage rate
  term?: number;
  termUnit?: string;
  monthlyPayment?: number;
  loanAmount?: number;
  description: string;
  requirements: string; // JSON string
  features: string; // JSON string
  minCreditScore?: number;
  maxCreditScore?: number;
  minIncome?: number;
  maxDebtToIncome?: number;
  leadFee?: number; // CLP
  successFeeBps?: number; // Basis points
  successFeeFlat?: number; // CLP flat fee
  activationBonus?: number; // CLP
  approvalRate?: number; // 0.0-1.0
  avgProcessingDays?: number;
  matchingWeights?: string; // JSON
  isActive: number;
  priority: number;
  externalUrl?: string;
  logoUrl?: string;
}

export const productCatalog: ProductCatalogItem[] = [
  // =============================================================================
  // CRÉDITOS DE CONSUMO
  // =============================================================================
  {
    productName: "Crédito de Consumo Express",
    provider: "Banco de Chile",
    productType: "Crédito de Consumo",
    category: "loans",
    interestRate: 1.89, // 1.89% mensual ≈ 25% anual
    term: 48,
    termUnit: "meses",
    loanAmount: 5000000, // CLP 5 millones
    description:
      "Crédito rápido y flexible para cualquier necesidad. Aprobación en 24 horas con tasa preferente.",
    requirements: JSON.stringify([
      "Edad entre 18 y 70 años",
      "Renta líquida mínima CLP 600.000",
      "Antigüedad laboral 6 meses",
      "Score crediticio mínimo 550",
    ]),
    features: JSON.stringify([
      "Aprobación en 24 horas",
      "Prepago sin costo",
      "Hasta 48 cuotas",
      "Tasa desde 1.89% mensual",
      "Desembolso inmediato",
    ]),
    minCreditScore: 550,
    maxCreditScore: 850,
    minIncome: 600000,
    maxDebtToIncome: 0.45,
    leadFee: 10000,
    successFeeBps: 60, // 0.6% del monto
    approvalRate: 0.68,
    avgProcessingDays: 1,
    matchingWeights: JSON.stringify({
      creditScore: 0.35,
      income: 0.25,
      debtToIncome: 0.2,
      transactionalScore: 0.15,
      profileComplete: 0.05,
    }),
    isActive: 1,
    priority: 85,
    externalUrl: "https://portales.bancochile.cl/personas/productos/creditos/consumo",
    logoUrl: "/logos/banco-chile.png",
  },
  {
    productName: "SuperCrédito Digital",
    provider: "Banco Santander",
    productType: "Crédito de Consumo",
    category: "loans",
    interestRate: 1.65, // 1.65% mensual ≈ 21.6% anual
    term: 60,
    termUnit: "meses",
    loanAmount: 8000000,
    description:
      "100% digital, sin papeleos. Ideal para proyectos personales y consolidación de deudas.",
    requirements: JSON.stringify([
      "Edad entre 21 y 65 años",
      "Renta mínima CLP 700.000",
      "Antigüedad laboral 12 meses",
      "Score crediticio mínimo 600",
    ]),
    features: JSON.stringify([
      "Proceso 100% online",
      "Hasta CLP 15 millones",
      "Consolidación de deudas",
      "Seguro de desgravamen incluido",
      "Tasa competitiva desde 1.65%",
    ]),
    minCreditScore: 600,
    maxCreditScore: 850,
    minIncome: 700000,
    maxDebtToIncome: 0.4,
    leadFee: 10000,
    successFeeBps: 60,
    approvalRate: 0.72,
    avgProcessingDays: 2,
    matchingWeights: JSON.stringify({
      creditScore: 0.4,
      income: 0.3,
      debtToIncome: 0.15,
      transactionalScore: 0.1,
      profileComplete: 0.05,
    }),
    isActive: 1,
    priority: 90,
    externalUrl: "https://banco.santander.cl/credito-consumo",
    logoUrl: "/logos/santander.png",
  },
  {
    productName: "Crédito Personal BCI",
    provider: "BCI",
    productType: "Crédito de Consumo",
    category: "loans",
    interestRate: 2.1,
    term: 36,
    termUnit: "meses",
    loanAmount: 3000000,
    description:
      "Crédito personal con cuotas fijas y sin sorpresas. Perfecto para gastos imprevistos.",
    requirements: JSON.stringify([
      "Edad entre 18 y 75 años",
      "Renta mínima CLP 500.000",
      "Antigüedad laboral 3 meses",
      "Score crediticio mínimo 520",
    ]),
    features: JSON.stringify([
      "Cuotas fijas",
      "Sin costos ocultos",
      "Hasta CLP 10 millones",
      "Aprobación rápida",
      "Prepago parcial sin penalización",
    ]),
    minCreditScore: 520,
    maxCreditScore: 850,
    minIncome: 500000,
    maxDebtToIncome: 0.5,
    leadFee: 10000,
    successFeeBps: 60,
    approvalRate: 0.65,
    avgProcessingDays: 2,
    matchingWeights: JSON.stringify({
      creditScore: 0.3,
      income: 0.25,
      debtToIncome: 0.25,
      transactionalScore: 0.15,
      profileComplete: 0.05,
    }),
    isActive: 1,
    priority: 75,
    externalUrl: "https://www.bci.cl/personas/creditos/credito-consumo",
    logoUrl: "/logos/bci.png",
  },

  // =============================================================================
  // CRÉDITOS HIPOTECARIOS
  // =============================================================================
  {
    productName: "Crédito Hipotecario BancoEstado",
    provider: "BancoEstado",
    productType: "Crédito Hipotecario",
    category: "loans",
    interestRate: 3.5, // 3.5% anual UF
    term: 300,
    termUnit: "meses",
    loanAmount: 50000000, // CLP 50 millones ≈ 1,257 UF
    description: "Hipotecario con subsidio DS19. Financiamiento hasta 90% con tasa preferencial.",
    requirements: JSON.stringify([
      "Edad entre 18 y 70 años",
      "Renta mínima CLP 1.200.000",
      "Ahorro previo 10%",
      "Score crediticio mínimo 650",
      "Antigüedad laboral 24 meses",
    ]),
    features: JSON.stringify([
      "Financiamiento hasta 90%",
      "Compatible con DS19",
      "Prepago sin costo",
      "Plazo hasta 25 años",
      "Evaluación sin costo",
    ]),
    minCreditScore: 650,
    maxCreditScore: 850,
    minIncome: 1200000,
    maxDebtToIncome: 0.35,
    leadFee: 10000,
    successFeeBps: 30, // 0.3% del monto (estándar hipotecario)
    approvalRate: 0.58,
    avgProcessingDays: 15,
    matchingWeights: JSON.stringify({
      creditScore: 0.45,
      income: 0.35,
      debtToIncome: 0.15,
      transactionalScore: 0.05,
    }),
    isActive: 1,
    priority: 70,
    externalUrl: "https://www.bancoestado.cl/credito-hipotecario",
    logoUrl: "/logos/bancoestado.png",
  },
  {
    productName: "Hipotecario Digital",
    provider: "Santander",
    productType: "Crédito Hipotecario",
    category: "loans",
    interestRate: 3.25,
    term: 240,
    termUnit: "meses",
    loanAmount: 80000000,
    description: "Tu casa propia con proceso 100% digital. Tasación online y aprobación express.",
    requirements: JSON.stringify([
      "Edad entre 21 y 65 años",
      "Renta líquida mínima CLP 1.500.000",
      "Ahorro previo 15%",
      "Score crediticio mínimo 680",
      "Contrato indefinido",
    ]),
    features: JSON.stringify([
      "Proceso 100% digital",
      "Tasación online",
      "Hasta 80% financiamiento",
      "Portabilidad sin costo",
      "Asesor dedicado",
    ]),
    minCreditScore: 680,
    maxCreditScore: 850,
    minIncome: 1500000,
    maxDebtToIncome: 0.3,
    leadFee: 10000,
    successFeeBps: 30,
    approvalRate: 0.62,
    avgProcessingDays: 12,
    matchingWeights: JSON.stringify({
      creditScore: 0.5,
      income: 0.35,
      debtToIncome: 0.1,
      transactionalScore: 0.05,
    }),
    isActive: 1,
    priority: 80,
    externalUrl: "https://banco.santander.cl/credito-hipotecario",
    logoUrl: "/logos/santander.png",
  },

  // =============================================================================
  // TARJETAS DE CRÉDITO
  // =============================================================================
  {
    productName: "Tarjeta Mastercard Platinum",
    provider: "BCI",
    productType: "Tarjeta de Crédito",
    category: "credit_cards",
    interestRate: 2.8, // 2.8% mensual ≈ 39% anual
    loanAmount: 2000000, // Línea de crédito
    description:
      "Cashback 3% en supermercados y 2% en todo. Sin costo de mantención el primer año.",
    requirements: JSON.stringify([
      "Edad entre 18 y 70 años",
      "Renta mínima CLP 600.000",
      "Score crediticio mínimo 600",
    ]),
    features: JSON.stringify([
      "3% cashback supermercados",
      "2% cashback general",
      "Sin costo año 1",
      "Cuotas sin interés en comercios adheridos",
      "Seguros incluidos (compras, fraude)",
    ]),
    minCreditScore: 600,
    maxCreditScore: 850,
    minIncome: 600000,
    maxDebtToIncome: 0.4,
    successFeeFlat: 60000, // CLP 60k por aprobación
    activationBonus: 30000, // CLP 30k por activación (gasto mínimo)
    approvalRate: 0.7,
    avgProcessingDays: 3,
    matchingWeights: JSON.stringify({
      creditScore: 0.45,
      income: 0.3,
      transactionalScore: 0.2,
      profileComplete: 0.05,
    }),
    isActive: 1,
    priority: 88,
    externalUrl: "https://www.bci.cl/personas/tarjetas/mastercard-platinum",
    logoUrl: "/logos/bci.png",
  },
  {
    productName: "Tarjeta Visa Signature",
    provider: "Banco de Chile",
    productType: "Tarjeta de Crédito",
    category: "credit_cards",
    interestRate: 2.65,
    loanAmount: 3000000,
    description: "Premium rewards y acceso a salas VIP. Ideal para viajeros frecuentes.",
    requirements: JSON.stringify([
      "Edad entre 21 y 65 años",
      "Renta mínima CLP 1.000.000",
      "Score crediticio mínimo 680",
    ]),
    features: JSON.stringify([
      "Puntos Travelclub",
      "Acceso salas VIP aeropuertos",
      "4% en gasolina",
      "Seguro de viaje incluido",
      "Concierge 24/7",
    ]),
    minCreditScore: 680,
    maxCreditScore: 850,
    minIncome: 1000000,
    maxDebtToIncome: 0.35,
    successFeeFlat: 80000,
    activationBonus: 40000,
    approvalRate: 0.65,
    avgProcessingDays: 4,
    matchingWeights: JSON.stringify({
      creditScore: 0.5,
      income: 0.35,
      transactionalScore: 0.1,
      profileComplete: 0.05,
    }),
    isActive: 1,
    priority: 82,
    externalUrl: "https://portales.bancochile.cl/personas/productos/tarjetas/visa-signature",
    logoUrl: "/logos/banco-chile.png",
  },
  {
    productName: "Tarjeta Life",
    provider: "Scotiabank",
    productType: "Tarjeta de Crédito",
    category: "credit_cards",
    interestRate: 2.99,
    loanAmount: 1500000,
    description: "Tarjeta sin costo de mantención ni de emisión. Perfecta para el día a día.",
    requirements: JSON.stringify([
      "Edad entre 18 y 70 años",
      "Renta mínima CLP 450.000",
      "Score crediticio mínimo 550",
    ]),
    features: JSON.stringify([
      "Sin costo de mantención",
      "Sin costo de emisión",
      "Cuotas precio contado en comercios",
      "App móvil ScotiaMóvil",
      "Avances en efectivo",
    ]),
    minCreditScore: 550,
    maxCreditScore: 850,
    minIncome: 450000,
    maxDebtToIncome: 0.45,
    successFeeFlat: 50000,
    activationBonus: 25000,
    approvalRate: 0.73,
    avgProcessingDays: 2,
    matchingWeights: JSON.stringify({
      creditScore: 0.35,
      income: 0.3,
      transactionalScore: 0.25,
      profileComplete: 0.1,
    }),
    isActive: 1,
    priority: 78,
    externalUrl: "https://www.scotiabank.cl/personas/tarjetas/life",
    logoUrl: "/logos/scotiabank.png",
  },

  // =============================================================================
  // CUENTAS CORRIENTES
  // =============================================================================
  {
    productName: "Cuenta Corriente Digital",
    provider: "BCI",
    productType: "Cuenta Corriente",
    category: "savings",
    monthlyPayment: 3990, // Mantención mensual
    description: "Sin papeleo, apertura 100% online. Incluye tarjeta de débito sin costo.",
    requirements: JSON.stringify([
      "Edad entre 18 y 75 años",
      "Renta mínima CLP 400.000",
      "Documento de identidad vigente",
    ]),
    features: JSON.stringify([
      "Apertura 100% online",
      "Tarjeta de débito gratis",
      "App BCI móvil",
      "Transferencias ilimitadas",
      "Chequera opcional",
    ]),
    minCreditScore: 500,
    minIncome: 400000,
    successFeeFlat: 15000, // Apertura
    activationBonus: 30000, // Bonus por primer abono de sueldo
    approvalRate: 0.85,
    avgProcessingDays: 1,
    matchingWeights: JSON.stringify({
      income: 0.4,
      transactionalScore: 0.3,
      creditScore: 0.2,
      profileComplete: 0.1,
    }),
    isActive: 1,
    priority: 65,
    externalUrl: "https://www.bci.cl/personas/cuentas/cuenta-corriente",
    logoUrl: "/logos/bci.png",
  },
  {
    productName: "Cuenta Corriente CuentaRUT",
    provider: "BancoEstado",
    productType: "Cuenta Corriente",
    category: "savings",
    monthlyPayment: 0, // Sin costo mantención
    description: "La cuenta para todos. Sin requisitos de renta, ideal para recibir tu sueldo.",
    requirements: JSON.stringify([
      "Cédula de identidad vigente",
      "Mayor de 14 años",
      "Sin requisito de renta",
    ]),
    features: JSON.stringify([
      "Sin costo de mantención",
      "Sin requisito de renta mínima",
      "Tarjeta débito incluida",
      "Giros sin costo en Redbanc",
      "CajaVecina gratis",
    ]),
    minCreditScore: 300, // Sin requisito real
    minIncome: 0, // Sin requisito
    successFeeFlat: 15000,
    activationBonus: 30000,
    approvalRate: 0.95,
    avgProcessingDays: 1,
    matchingWeights: JSON.stringify({
      profileComplete: 0.4,
      transactionalScore: 0.3,
      income: 0.2,
      creditScore: 0.1,
    }),
    isActive: 1,
    priority: 60,
    externalUrl: "https://www.bancoestado.cl/cuentarut",
    logoUrl: "/logos/bancoestado.png",
  },

  // =============================================================================
  // DEPÓSITOS A PLAZO / INVERSIONES
  // =============================================================================
  {
    productName: "Depósito a Plazo Renovable",
    provider: "Banco de Chile",
    productType: "Depósito a Plazo",
    category: "savings",
    interestRate: 5.8, // 5.8% anual
    term: 180,
    termUnit: "días",
    loanAmount: 1000000, // Monto mínimo
    description:
      "Rentabiliza tus ahorros con tasa garantizada. Desde 90 días, renovación automática.",
    requirements: JSON.stringify([
      "Monto mínimo CLP 1.000.000",
      "Cuenta corriente o vista en Banco de Chile",
      "Plazo desde 90 días",
    ]),
    features: JSON.stringify([
      "Tasa hasta 5.8% anual",
      "Renovación automática",
      "Desde CLP 1 millón",
      "Plazos flexibles: 90, 180, 360 días",
      "Sin costos ni comisiones",
    ]),
    minIncome: 800000,
    successFeeFlat: 5000, // Fee bajo por apertura
    approvalRate: 0.9,
    avgProcessingDays: 1,
    matchingWeights: JSON.stringify({
      transactionalScore: 0.4,
      income: 0.3,
      creditScore: 0.2,
      profileComplete: 0.1,
    }),
    isActive: 1,
    priority: 55,
    externalUrl: "https://portales.bancochile.cl/personas/productos/inversiones/depositos-plazo",
    logoUrl: "/logos/banco-chile.png",
  },

  // =============================================================================
  // SEGUROS
  // =============================================================================
  {
    productName: "Seguro Automotriz Full",
    provider: "HDI Seguros",
    productType: "Seguro Automotriz",
    category: "insurance",
    monthlyPayment: 45000, // Prima mensual promedio
    description: "Cobertura total para tu vehículo. Asistencia 24/7 y reembolso de daños.",
    requirements: JSON.stringify([
      "Vehículo con antigüedad máxima 10 años",
      "Inspección vehicular al día",
      "Licencia de conducir clase B vigente",
    ]),
    features: JSON.stringify([
      "Cobertura total",
      "Asistencia en ruta 24/7",
      "Auto de reemplazo",
      "Cobertura robo y choque",
      "Cristales sin deducible",
    ]),
    minCreditScore: 550,
    successFeeBps: 1200, // 12% de prima anual (12% = 1,200 bps)
    approvalRate: 0.8,
    avgProcessingDays: 2,
    matchingWeights: JSON.stringify({
      creditScore: 0.25,
      income: 0.25,
      transactionalScore: 0.3,
      profileComplete: 0.2,
    }),
    isActive: 1,
    priority: 68,
    externalUrl: "https://www.hdi.cl/seguros/automotriz",
    logoUrl: "/logos/hdi.png",
  },
  {
    productName: "Seguro de Vida Protección Familiar",
    provider: "Metlife",
    productType: "Seguro de Vida",
    category: "insurance",
    monthlyPayment: 25000,
    description: "Protege a tu familia con cobertura hasta UF 5.000. Incluye invalidez total.",
    requirements: JSON.stringify([
      "Edad entre 18 y 65 años",
      "Declaración de salud",
      "Residencia en Chile",
    ]),
    features: JSON.stringify([
      "Cobertura hasta UF 5.000",
      "Invalidez total y permanente",
      "Enfermedades graves",
      "Sin examen médico (según edad)",
      "Pago de prima flexible",
    ]),
    minCreditScore: 520,
    minIncome: 500000,
    successFeeBps: 2000, // 20% de prima anual
    approvalRate: 0.75,
    avgProcessingDays: 5,
    matchingWeights: JSON.stringify({
      income: 0.35,
      creditScore: 0.25,
      transactionalScore: 0.25,
      profileComplete: 0.15,
    }),
    isActive: 1,
    priority: 62,
    externalUrl: "https://www.metlife.cl/personas/vida/",
    logoUrl: "/logos/metlife.png",
  },
  {
    productName: "Seguro Hogar Multiriesgo",
    provider: "Zurich Seguros",
    productType: "Seguro Hogar",
    category: "insurance",
    monthlyPayment: 18000,
    description:
      "Protege tu hogar contra incendio, robo y responsabilidad civil. Cobertura de contenidos.",
    requirements: JSON.stringify([
      "Propiedad o arriendo",
      "Tasación del inmueble",
      "Fotografías del inmueble",
    ]),
    features: JSON.stringify([
      "Cobertura incendio",
      "Robo y hurto",
      "Responsabilidad civil",
      "Contenidos hasta UF 1.000",
      "Asistencia del hogar 24/7",
    ]),
    minCreditScore: 530,
    successFeeBps: 1500, // 15% de prima anual
    approvalRate: 0.82,
    avgProcessingDays: 3,
    matchingWeights: JSON.stringify({
      income: 0.3,
      creditScore: 0.25,
      transactionalScore: 0.3,
      profileComplete: 0.15,
    }),
    isActive: 1,
    priority: 58,
    externalUrl: "https://www.zurich.cl/seguros/hogar",
    logoUrl: "/logos/zurich.png",
  },

  // =============================================================================
  // TARJETA DE DÉBITO / CUENTA VISTA
  // =============================================================================
  {
    productName: "Cuenta Vista + Débito",
    provider: "Santander",
    productType: "Cuenta Vista",
    category: "savings",
    monthlyPayment: 0,
    description:
      "Cuenta vista sin mantención con tarjeta de débito Mastercard. Giros gratis en red propia.",
    requirements: JSON.stringify([
      "Mayor de 18 años",
      "Cédula de identidad",
      "Sin requisito de renta",
    ]),
    features: JSON.stringify([
      "Sin costo de mantención",
      "Tarjeta débito Mastercard",
      "Giros gratis en Santander",
      "App Life móvil",
      "Transferencias ilimitadas",
    ]),
    minCreditScore: 350,
    minIncome: 0,
    successFeeFlat: 10000, // Fee bajo por apertura simple
    approvalRate: 0.92,
    avgProcessingDays: 1,
    matchingWeights: JSON.stringify({
      profileComplete: 0.5,
      transactionalScore: 0.3,
      income: 0.2,
    }),
    isActive: 1,
    priority: 50,
    externalUrl: "https://banco.santander.cl/cuenta-vista",
    logoUrl: "/logos/santander.png",
  },

  // =============================================================================
  // CRÉDITOS PYME (para futuro uso en CODA Empresas)
  // =============================================================================
  {
    productName: "Crédito Pyme Capital de Trabajo",
    provider: "BCI",
    productType: "Crédito Comercial",
    category: "loans",
    interestRate: 1.2, // 1.2% mensual UF
    term: 36,
    termUnit: "meses",
    loanAmount: 20000000,
    description: "Financia tu capital de trabajo con cuotas flexibles. Hasta UF 10.000.",
    requirements: JSON.stringify([
      "Empresa con 2+ años de operación",
      "Ventas anuales desde UF 1.000",
      "Sin protestos vigentes",
      "Score crediticio empresa >600",
    ]),
    features: JSON.stringify([
      "Hasta UF 10.000",
      "Cuotas flexibles",
      "Plazo hasta 3 años",
      "Sin garantía hipotecaria (hasta cierto monto)",
      "Aprobación en 5 días",
    ]),
    minCreditScore: 600,
    minIncome: 3000000, // Ventas mensuales
    maxDebtToIncome: 0.5,
    leadFee: 10000,
    successFeeBps: 50, // 0.5% (pyme: 30-70 bps según TAM)
    approvalRate: 0.55,
    avgProcessingDays: 5,
    matchingWeights: JSON.stringify({
      creditScore: 0.4,
      income: 0.35,
      debtToIncome: 0.2,
      profileComplete: 0.05,
    }),
    isActive: 1,
    priority: 72,
    externalUrl: "https://www.bci.cl/empresas/creditos/capital-trabajo",
    logoUrl: "/logos/bci.png",
  },
];

/**
 * Get products by category
 */
export function getProductsByCategory(category: string): ProductCatalogItem[] {
  return productCatalog.filter((p) => p.category === category);
}

/**
 * Get all active products
 */
export function getActiveProducts(): ProductCatalogItem[] {
  return productCatalog.filter((p) => p.isActive === 1);
}

/**
 * Calculate estimated revenue for a product application
 */
export function calculateProductRevenue(
  product: ProductCatalogItem,
  loanAmount?: number,
  eventType: "lead" | "approval" | "activation" = "approval",
): number {
  if (eventType === "lead" && product.leadFee) {
    return product.leadFee;
  }

  if (eventType === "approval") {
    // For loans: calculate bps on amount
    if (product.successFeeBps && loanAmount) {
      return Math.round((loanAmount * product.successFeeBps) / 10000);
    }
    // For cards/accounts: flat fee
    if (product.successFeeFlat) {
      return product.successFeeFlat;
    }
  }

  if (eventType === "activation" && product.activationBonus) {
    return product.activationBonus;
  }

  return 0;
}
