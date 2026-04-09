import { financialProducts, db } from "./db/index.js";

/** Reservado: ya no se crean usuarios de prueba automáticamente. */
export async function seedDemoUser(): Promise<void> {
  return;
}

/**
 * Seed financial products into the database
 */
export async function seedFinancialProducts() {
  // First check if we already have products
  const existingProducts = db.select().from(financialProducts).all();
  
  if (existingProducts.length > 0) {
    console.log(`Database already has ${existingProducts.length} products. Skipping seed.`);
    return;
  }
  
  console.log("Seeding financial products into database...");
  
  // ── Créditos de consumo ──
  const creditoConsumo = [
    {
      productName: "Crédito de Consumo",
      provider: "Banco de Chile",
      productType: "Crédito de Consumo",
      category: "creditos_consumo",
      interestRate: 1.29,
      term: 36,
      termUnit: "months",
      monthlyPayment: 325000,
      loanAmount: 10000000,
      description: "Crédito de consumo con tasa preferencial para clientes con buen historial crediticio.",
      requirements: { minimumCreditScore: 680, minimumIncome: 800000 },
      features: { preApproval: true, autoPay: true, seguroDesgravamen: true }
    },
    {
      productName: "Crédito de Consumo",
      provider: "BancoEstado",
      productType: "Crédito de Consumo",
      category: "creditos_consumo",
      interestRate: 1.49,
      term: 36,
      termUnit: "months",
      monthlyPayment: 340000,
      loanAmount: 10000000,
      description: "Crédito accesible con cuotas fijas en UF o pesos.",
      requirements: { minimumCreditScore: 600, minimumIncome: 500000 },
      features: { preApproval: true, autoPay: true, seguroDesgravamen: true }
    },
  ];

  // ── Líneas de crédito ──
  const lineasCredito = [
    {
      productName: "Línea de Crédito",
      provider: "Banco Santander Chile",
      productType: "Línea de Crédito",
      category: "lineas_credito",
      interestRate: 2.15,
      description: "Línea de crédito rotativa con disponibilidad inmediata.",
      requirements: { minimumCreditScore: 660, minimumIncome: 700000 },
      features: { montoMaximo: 15000000, disponibilidadInmediata: true }
    },
  ];

  // ── Tarjetas de crédito ──
  const tarjetasCredito = [
    {
      productName: "Tarjeta de Crédito Visa Platinum",
      provider: "Banco de Chile",
      productType: "Tarjeta de Crédito",
      category: "tarjetas_credito",
      interestRate: 2.80,
      description: "Tarjeta con programa de puntos y seguros de viaje incluidos.",
      requirements: { minimumCreditScore: 700 },
      features: { costoAnual: 2.5, programaPuntos: true, seguroViaje: true }
    },
    {
      productName: "Tarjeta de Crédito Mastercard",
      provider: "Banco Falabella",
      productType: "Tarjeta de Crédito",
      category: "tarjetas_credito",
      interestRate: 3.20,
      description: "Tarjeta con descuentos en comercios asociados y CMR Puntos.",
      requirements: { minimumCreditScore: 620 },
      features: { costoAnual: 0, descuentosComercios: true, programaPuntos: true }
    },
  ];

  // ── Tarjetas de débito / cuentas vista ──
  const cuentasVista = [
    {
      productName: "Cuenta Vista + Tarjeta de Débito",
      provider: "Banco BICE",
      productType: "Cuenta Vista",
      category: "cuentas_vista",
      interestRate: 0,
      description: "Cuenta sin costo de mantención con tarjeta de débito Visa.",
      features: { costoMantencion: 0, tarjetaDebito: true, transferenciasGratis: true }
    },
  ];

  // ── Cuentas corrientes ──
  const cuentasCorrientes = [
    {
      productName: "Cuenta Corriente Plan Joven",
      provider: "Banco Santander Chile",
      productType: "Cuenta Corriente",
      category: "cuentas_corrientes",
      interestRate: 0,
      description: "Cuenta corriente con línea de crédito y chequera digital.",
      requirements: { minimumCreditScore: 650, minimumIncome: 600000 },
      features: { costoMantencion: 0, lineaCredito: true, chequeraDigital: true }
    },
  ];

  // ── Cuentas de ahorro / depósitos a plazo ──
  const ahorro = [
    {
      productName: "Cuenta de Ahorro",
      provider: "BancoEstado",
      productType: "Cuenta de Ahorro",
      category: "cuentas_ahorro",
      interestRate: 0.30,
      description: "Cuenta de ahorro con tasa de interés y sin monto mínimo.",
      features: { montoMinimo: 0, costoMantencion: 0, retiroLibre: true }
    },
    {
      productName: "Depósito a Plazo en UF",
      provider: "Banco de Chile",
      productType: "Depósito a Plazo",
      category: "depositos_plazo",
      interestRate: 0.28,
      term: 12,
      termUnit: "months",
      description: "Depósito a plazo reajustable en UF con renovación automática.",
      features: { montoMinimo: 500000, renovacionAutomatica: true }
    },
  ];

  // ── Créditos hipotecarios / portabilidad ──
  const hipotecarios = [
    {
      productName: "Crédito Hipotecario",
      provider: "Banco Itaú Chile",
      productType: "Crédito Hipotecario",
      category: "hipotecarios",
      interestRate: 4.50,
      term: 240,
      termUnit: "months",
      description: "Financiamiento de hasta el 80% del valor de la propiedad.",
      requirements: { minimumCreditScore: 700, minimumIncome: 1200000 },
      features: { financiamientoMax: 80, seguroIncendio: true, portabilidad: true }
    },
  ];

  // ── Fondos mutuos ──
  const fondosMutuos = [
    {
      productName: "Fondo Mutuo Renta Nacional",
      provider: "Bci Asset Management",
      productType: "Fondo Mutuo",
      category: "fondos_mutuos",
      interestRate: 3.80,
      description: "Fondo mutuo de renta fija nacional con liquidez diaria.",
      features: { montoMinimo: 50000, liquidezDiaria: true, tipoRenta: "fija" }
    },
  ];

  // ── Seguros ──
  const seguros = [
    {
      productName: "Seguro Automotriz",
      provider: "Seguros Sura Chile",
      productType: "Seguro General",
      category: "seguros_generales",
      description: "Cobertura integral para vehículos con asistencia en ruta.",
      features: { asistenciaRuta: true, coberturaIntegral: true, descuentoBundling: true }
    },
    {
      productName: "Seguro de Vida",
      provider: "MetLife Chile",
      productType: "Seguro de Vida",
      category: "seguros_vida",
      description: "Seguro de vida con cobertura por fallecimiento e invalidez.",
      features: { coberturaFallecimiento: true, coberturaInvalidez: true, ahorro: false }
    },
  ];

  // ── APV ──
  const apv = [
    {
      productName: "APV Régimen B",
      provider: "AFP Habitat",
      productType: "APV",
      category: "apv",
      description: "Ahorro previsional voluntario con bonificación fiscal del 15%.",
      features: { regimen: "B", bonificacionFiscal: 15, liquidez: true }
    },
  ];

  // Insert all products
  const allProducts = [
    ...creditoConsumo, ...lineasCredito, ...tarjetasCredito, ...cuentasVista,
    ...cuentasCorrientes, ...ahorro, ...hipotecarios, ...fondosMutuos,
    ...seguros, ...apv,
  ];
  
  try {
    for (const product of allProducts) {
      const insertObj: any = { ...product };
      if ('requirements' in product) {
        insertObj.requirements = product.requirements ? JSON.stringify(product.requirements) : null;
      }
      if ('features' in product) {
        insertObj.features = product.features ? JSON.stringify(product.features) : null;
      }
      db.insert(financialProducts).values(insertObj).run();
    }
    console.log(`Successfully seeded ${allProducts.length} financial products`);
  } catch (error) {
    console.error("Error seeding financial products:", error);
  }
}