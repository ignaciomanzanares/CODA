import { financialProducts, users, db, eq } from "./db.js";

/**
 * Seed demo user into the database
 */
export async function seedDemoUser() {
  // Check if demo user with ID "demo-user" already exists
  const existingUsers = db.select().from(users).where(eq(users.id, "demo-user")).all();
  
  if (existingUsers.length > 0) {
    console.log("Demo user already exists. Skipping user seed.");
    return;
  }
  
  console.log("Creating demo user...");
  
  try {
    db.insert(users).values({
      id: "demo-user",
      username: "demo",
      email: "demo@example.com",
      passwordHash: "$2b$10$demo-password-hash", // Demo password hash
      firstName: "Demo",
      lastName: "User",
    }).run();
    console.log("Successfully created demo user");
  } catch (error) {
    console.error("Error creating demo user:", error);
  }
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
  
  // Loan products
  const loanProducts = [
    {
      productName: "Personal Loan",
      provider: "SoFi",
      productType: "Personal Loan",
      category: "loans",
      interestRate: 7.49,
      term: 36,
      termUnit: "months",
      monthlyPayment: 325,
      loanAmount: 10000,
      description: "Low-rate personal loans with no fees",
      requirements: { minimumCreditScore: 680, minimumIncome: 45000 },
      features: { preApproval: true, autoPay: true, noFees: true }
    },
    {
      productName: "Personal Loan",
      provider: "LightStream",
      productType: "Personal Loan",
      category: "loans",
      interestRate: 6.99,
      term: 36,
      termUnit: "months",
      monthlyPayment: 309,
      loanAmount: 10000,
      description: "Low-rate loans for excellent credit customers",
      requirements: { minimumCreditScore: 700, minimumIncome: 50000 },
      features: { preApproval: true, autoPay: true, noFees: true }
    },
    {
      productName: "Personal Loan",
      provider: "Marcus",
      productType: "Personal Loan",
      category: "loans",
      interestRate: 8.25,
      term: 36,
      termUnit: "months",
      monthlyPayment: 315,
      loanAmount: 10000,
      description: "No-fee personal loans",
      requirements: { minimumCreditScore: 660, minimumIncome: 40000 },
      features: { preApproval: true, autoPay: true, noFees: true }
    },
    {
      productName: "Personal Loan",
      provider: "Discover",
      productType: "Personal Loan",
      category: "loans",
      interestRate: 8.99,
      term: 36,
      termUnit: "months",
      monthlyPayment: 319,
      loanAmount: 10000,
      description: "Flexible personal loans",
      requirements: { minimumCreditScore: 660, minimumIncome: 40000 },
      features: { preApproval: true, autoPay: true }
    }
  ];
  
  // Credit card products
  const creditCardProducts = [
    {
      productName: "Cash Rewards Card",
      provider: "Chase",
      productType: "Cash Back",
      category: "credit_cards",
      interestRate: 18.24,
      description: "Earn 3% cash back on dining, 2% on gas, 1% on everything else",
      requirements: { minimumCreditScore: 700 },
features: { annualFee: 0, rewardsRate: 3, introductoryAPR: 0 }
    },
    {
      productName: "Travel Rewards Card",
      provider: "Capital One",
      productType: "Travel",
      category: "credit_cards",
      interestRate: 19.99,
      description: "Earn 2X miles on every purchase",
      requirements: { minimumCreditScore: 720 },
      features: { annualFee: 95, rewardsRate: 2, signupBonus: 60000 }
    }
  ];
  
  // Savings products
  const savingsProducts = [
    {
      productName: "High-Yield Savings",
      provider: "Ally Bank",
      productType: "Savings",
      category: "savings",
      interestRate: 4.25,
      description: "Competitive interest rates with no monthly maintenance fees",
      features: { minimumBalance: 0, monthlyFee: 0, fdic: true }
    },
    {
      productName: "CD",
      provider: "Marcus",
      productType: "Certificate of Deposit",
      category: "savings",
      interestRate: 4.75,
      term: 12,
      termUnit: "months",
      description: "High-yield certificates of deposit",
      features: { minimumBalance: 500, fdic: true, penalty: true }
    }
  ];
  
  // Insurance products
  const insuranceProducts = [
    {
      productName: "Auto Insurance",
      provider: "Progressive",
      productType: "Auto",
      category: "insurance",
      description: "Comprehensive auto coverage with accident forgiveness",
      features: { accidentForgiveness: true, roadside: true, bundleDiscount: true }
    },
    {
      productName: "Home Insurance",
      provider: "State Farm",
      productType: "Home",
      category: "insurance",
      description: "Protect your home and belongings",
      features: { replacementCost: true, floodCoverage: false, bundleDiscount: true }
    }
  ];
  
  // Insert all products
  const allProducts = [...loanProducts, ...creditCardProducts, ...savingsProducts, ...insuranceProducts];
  
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