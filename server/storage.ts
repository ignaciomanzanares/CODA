import { 
  users, type User, type InsertUser,
  bankConnections, type BankConnection, type InsertBankConnection,
  creditScores, type CreditScore, type InsertCreditScore,
  insuranceRisks, type InsuranceRisk, type InsertInsuranceRisk,
  financialGoals, type FinancialGoal, type InsertFinancialGoal, 
  financialProducts, type FinancialProduct, type InsertFinancialProduct
} from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";

export interface IStorage {
  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Bank connection operations
  getBankConnections(userId: number): Promise<BankConnection[]>;
  getBankConnection(id: number): Promise<BankConnection | undefined>;
  createBankConnection(connection: InsertBankConnection): Promise<BankConnection>;
  updateBankConnection(id: number, connection: Partial<InsertBankConnection>): Promise<BankConnection | undefined>;
  deleteBankConnection(id: number): Promise<boolean>;
  
  // Credit score operations
  getCreditScore(userId: number): Promise<CreditScore | undefined>;
  createCreditScore(creditScore: InsertCreditScore): Promise<CreditScore>;
  updateCreditScore(userId: number, creditScore: Partial<InsertCreditScore>): Promise<CreditScore | undefined>;
  
  // Insurance risk operations
  getInsuranceRisk(userId: number): Promise<InsuranceRisk | undefined>;
  createInsuranceRisk(insuranceRisk: InsertInsuranceRisk): Promise<InsuranceRisk>;
  updateInsuranceRisk(userId: number, insuranceRisk: Partial<InsertInsuranceRisk>): Promise<InsuranceRisk | undefined>;
  
  // Financial goal operations
  getFinancialGoals(userId: number): Promise<FinancialGoal[]>;
  getFinancialGoal(id: number): Promise<FinancialGoal | undefined>;
  createFinancialGoal(goal: InsertFinancialGoal): Promise<FinancialGoal>;
  updateFinancialGoal(id: number, goal: Partial<InsertFinancialGoal>): Promise<FinancialGoal | undefined>;
  deleteFinancialGoal(id: number): Promise<boolean>;
  
  // Financial product operations
  getFinancialProducts(category?: string): Promise<FinancialProduct[]>;
  getFinancialProduct(id: number): Promise<FinancialProduct | undefined>;
  createFinancialProduct(product: InsertFinancialProduct): Promise<FinancialProduct>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private bankConnections: Map<number, BankConnection>;
  private creditScores: Map<number, CreditScore>;
  private insuranceRisks: Map<number, InsuranceRisk>;
  private financialGoals: Map<number, FinancialGoal>;
  private financialProducts: Map<number, FinancialProduct>;
  
  private currentUserId: number;
  private currentBankConnectionId: number;
  private currentCreditScoreId: number;
  private currentInsuranceRiskId: number;
  private currentFinancialGoalId: number;
  private currentFinancialProductId: number;

  constructor() {
    this.users = new Map();
    this.bankConnections = new Map();
    this.creditScores = new Map();
    this.insuranceRisks = new Map();
    this.financialGoals = new Map();
    this.financialProducts = new Map();
    
    this.currentUserId = 1;
    this.currentBankConnectionId = 1;
    this.currentCreditScoreId = 1;
    this.currentInsuranceRiskId = 1;
    this.currentFinancialGoalId = 1;
    this.currentFinancialProductId = 1;
    
    // Prepopulate with sample financial products
    this.seedFinancialProducts();
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }
  
  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.email === email,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentUserId++;
    const now = new Date();
    const user: User = { 
      ...insertUser, 
      id,
      createdAt: now
    };
    this.users.set(id, user);
    return user;
  }
  
  // Bank connection methods
  async getBankConnections(userId: number): Promise<BankConnection[]> {
    return Array.from(this.bankConnections.values()).filter(
      (connection) => connection.userId === userId,
    );
  }
  
  async getBankConnection(id: number): Promise<BankConnection | undefined> {
    return this.bankConnections.get(id);
  }
  
  async createBankConnection(insertConnection: InsertBankConnection): Promise<BankConnection> {
    const id = this.currentBankConnectionId++;
    const now = new Date();
    const connection: BankConnection = {
      ...insertConnection,
      id,
      lastUpdated: now
    };
    this.bankConnections.set(id, connection);
    return connection;
  }
  
  async updateBankConnection(id: number, connection: Partial<InsertBankConnection>): Promise<BankConnection | undefined> {
    const existingConnection = this.bankConnections.get(id);
    if (!existingConnection) return undefined;
    
    const now = new Date();
    const updatedConnection: BankConnection = {
      ...existingConnection,
      ...connection,
      lastUpdated: now
    };
    
    this.bankConnections.set(id, updatedConnection);
    return updatedConnection;
  }
  
  async deleteBankConnection(id: number): Promise<boolean> {
    return this.bankConnections.delete(id);
  }
  
  // Credit score methods
  async getCreditScore(userId: number): Promise<CreditScore | undefined> {
    return Array.from(this.creditScores.values()).find(
      (score) => score.userId === userId,
    );
  }
  
  async createCreditScore(insertCreditScore: InsertCreditScore): Promise<CreditScore> {
    const id = this.currentCreditScoreId++;
    const now = new Date();
    const creditScore: CreditScore = {
      ...insertCreditScore,
      id,
      lastUpdated: now
    };
    this.creditScores.set(id, creditScore);
    return creditScore;
  }
  
  async updateCreditScore(userId: number, creditScore: Partial<InsertCreditScore>): Promise<CreditScore | undefined> {
    const existingScore = Array.from(this.creditScores.values()).find(
      (score) => score.userId === userId,
    );
    
    if (!existingScore) return undefined;
    
    const now = new Date();
    const updatedScore: CreditScore = {
      ...existingScore,
      ...creditScore,
      lastUpdated: now
    };
    
    this.creditScores.set(existingScore.id, updatedScore);
    return updatedScore;
  }
  
  // Insurance risk methods
  async getInsuranceRisk(userId: number): Promise<InsuranceRisk | undefined> {
    return Array.from(this.insuranceRisks.values()).find(
      (risk) => risk.userId === userId,
    );
  }
  
  async createInsuranceRisk(insertInsuranceRisk: InsertInsuranceRisk): Promise<InsuranceRisk> {
    const id = this.currentInsuranceRiskId++;
    const now = new Date();
    const insuranceRisk: InsuranceRisk = {
      ...insertInsuranceRisk,
      id,
      lastUpdated: now
    };
    this.insuranceRisks.set(id, insuranceRisk);
    return insuranceRisk;
  }
  
  async updateInsuranceRisk(userId: number, insuranceRisk: Partial<InsertInsuranceRisk>): Promise<InsuranceRisk | undefined> {
    const existingRisk = Array.from(this.insuranceRisks.values()).find(
      (risk) => risk.userId === userId,
    );
    
    if (!existingRisk) return undefined;
    
    const now = new Date();
    const updatedRisk: InsuranceRisk = {
      ...existingRisk,
      ...insuranceRisk,
      lastUpdated: now
    };
    
    this.insuranceRisks.set(existingRisk.id, updatedRisk);
    return updatedRisk;
  }
  
  // Financial goal methods
  async getFinancialGoals(userId: number): Promise<FinancialGoal[]> {
    return Array.from(this.financialGoals.values()).filter(
      (goal) => goal.userId === userId,
    );
  }
  
  async getFinancialGoal(id: number): Promise<FinancialGoal | undefined> {
    return this.financialGoals.get(id);
  }
  
  async createFinancialGoal(insertGoal: InsertFinancialGoal): Promise<FinancialGoal> {
    const id = this.currentFinancialGoalId++;
    const now = new Date();
    const goal: FinancialGoal = {
      ...insertGoal,
      id,
      createdAt: now
    };
    this.financialGoals.set(id, goal);
    return goal;
  }
  
  async updateFinancialGoal(id: number, goal: Partial<InsertFinancialGoal>): Promise<FinancialGoal | undefined> {
    const existingGoal = this.financialGoals.get(id);
    if (!existingGoal) return undefined;
    
    const updatedGoal: FinancialGoal = {
      ...existingGoal,
      ...goal,
    };
    
    this.financialGoals.set(id, updatedGoal);
    return updatedGoal;
  }
  
  async deleteFinancialGoal(id: number): Promise<boolean> {
    return this.financialGoals.delete(id);
  }
  
  // Financial product methods
  async getFinancialProducts(category?: string): Promise<FinancialProduct[]> {
    const products = Array.from(this.financialProducts.values());
    if (category) {
      return products.filter(product => product.category === category);
    }
    return products;
  }
  
  async getFinancialProduct(id: number): Promise<FinancialProduct | undefined> {
    return this.financialProducts.get(id);
  }
  
  async createFinancialProduct(insertProduct: InsertFinancialProduct): Promise<FinancialProduct> {
    const id = this.currentFinancialProductId++;
    const product: FinancialProduct = {
      ...insertProduct,
      id,
    };
    this.financialProducts.set(id, product);
    return product;
  }
  
  // Seed financial products for demonstration
  private async seedFinancialProducts() {
    // Loan products
    [
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
    ].forEach(product => {
      this.createFinancialProduct(product);
    });
    
    // Credit card products
    [
      {
        productName: "Cash Rewards Card",
        provider: "Chase",
        productType: "Cash Back",
        category: "credit_cards",
        interestRate: 18.24,
        description: "Earn 3% cash back on dining, 2% on gas, 1% on everything else",
        requirements: { minimumCreditScore: 700 },
        features: { annualFee: 0, rewardsRate: 3, introducotryAPR: 0 }
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
    ].forEach(product => {
      this.createFinancialProduct(product);
    });
    
    // Savings products
    [
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
    ].forEach(product => {
      this.createFinancialProduct(product);
    });
    
    // Insurance products
    [
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
    ].forEach(product => {
      this.createFinancialProduct(product);
    });
  }
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }
  
  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }
  
  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }
  
  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }
  
  // Bank connection operations
  async getBankConnections(userId: number): Promise<BankConnection[]> {
    return await db
      .select()
      .from(bankConnections)
      .where(eq(bankConnections.userId, userId));
  }
  
  async getBankConnection(id: number): Promise<BankConnection | undefined> {
    const [connection] = await db
      .select()
      .from(bankConnections)
      .where(eq(bankConnections.id, id));
    return connection || undefined;
  }
  
  async createBankConnection(insertConnection: InsertBankConnection): Promise<BankConnection> {
    const [connection] = await db
      .insert(bankConnections)
      .values(insertConnection)
      .returning();
    return connection;
  }
  
  async updateBankConnection(id: number, connection: Partial<InsertBankConnection>): Promise<BankConnection | undefined> {
    const [updatedConnection] = await db
      .update(bankConnections)
      .set({
        ...connection,
        lastUpdated: new Date()
      })
      .where(eq(bankConnections.id, id))
      .returning();
    return updatedConnection || undefined;
  }
  
  async deleteBankConnection(id: number): Promise<boolean> {
    const result = await db
      .delete(bankConnections)
      .where(eq(bankConnections.id, id));
    return !!result;
  }
  
  // Credit score operations
  async getCreditScore(userId: number): Promise<CreditScore | undefined> {
    const [creditScore] = await db
      .select()
      .from(creditScores)
      .where(eq(creditScores.userId, userId));
    return creditScore || undefined;
  }
  
  async createCreditScore(insertCreditScore: InsertCreditScore): Promise<CreditScore> {
    const [creditScore] = await db
      .insert(creditScores)
      .values(insertCreditScore)
      .returning();
    return creditScore;
  }
  
  async updateCreditScore(userId: number, creditScore: Partial<InsertCreditScore>): Promise<CreditScore | undefined> {
    const [updatedScore] = await db
      .update(creditScores)
      .set({
        ...creditScore,
        lastUpdated: new Date()
      })
      .where(eq(creditScores.userId, userId))
      .returning();
    return updatedScore || undefined;
  }
  
  // Insurance risk operations
  async getInsuranceRisk(userId: number): Promise<InsuranceRisk | undefined> {
    const [insuranceRisk] = await db
      .select()
      .from(insuranceRisks)
      .where(eq(insuranceRisks.userId, userId));
    return insuranceRisk || undefined;
  }
  
  async createInsuranceRisk(insertInsuranceRisk: InsertInsuranceRisk): Promise<InsuranceRisk> {
    const [insuranceRisk] = await db
      .insert(insuranceRisks)
      .values(insertInsuranceRisk)
      .returning();
    return insuranceRisk;
  }
  
  async updateInsuranceRisk(userId: number, insuranceRisk: Partial<InsertInsuranceRisk>): Promise<InsuranceRisk | undefined> {
    const [updatedRisk] = await db
      .update(insuranceRisks)
      .set({
        ...insuranceRisk,
        lastUpdated: new Date()
      })
      .where(eq(insuranceRisks.userId, userId))
      .returning();
    return updatedRisk || undefined;
  }
  
  // Financial goal operations
  async getFinancialGoals(userId: number): Promise<FinancialGoal[]> {
    return await db
      .select()
      .from(financialGoals)
      .where(eq(financialGoals.userId, userId));
  }
  
  async getFinancialGoal(id: number): Promise<FinancialGoal | undefined> {
    const [goal] = await db
      .select()
      .from(financialGoals)
      .where(eq(financialGoals.id, id));
    return goal || undefined;
  }
  
  async createFinancialGoal(insertGoal: InsertFinancialGoal): Promise<FinancialGoal> {
    const [goal] = await db
      .insert(financialGoals)
      .values(insertGoal)
      .returning();
    return goal;
  }
  
  async updateFinancialGoal(id: number, goal: Partial<InsertFinancialGoal>): Promise<FinancialGoal | undefined> {
    const [updatedGoal] = await db
      .update(financialGoals)
      .set(goal)
      .where(eq(financialGoals.id, id))
      .returning();
    return updatedGoal || undefined;
  }
  
  async deleteFinancialGoal(id: number): Promise<boolean> {
    const result = await db
      .delete(financialGoals)
      .where(eq(financialGoals.id, id));
    return !!result;
  }
  
  // Financial product operations
  async getFinancialProducts(category?: string): Promise<FinancialProduct[]> {
    if (category) {
      return await db
        .select()
        .from(financialProducts)
        .where(eq(financialProducts.category, category));
    } else {
      return await db.select().from(financialProducts);
    }
  }
  
  async getFinancialProduct(id: number): Promise<FinancialProduct | undefined> {
    const [product] = await db
      .select()
      .from(financialProducts)
      .where(eq(financialProducts.id, id));
    return product || undefined;
  }
  
  async createFinancialProduct(insertProduct: InsertFinancialProduct): Promise<FinancialProduct> {
    const [product] = await db
      .insert(financialProducts)
      .values(insertProduct)
      .returning();
    return product;
  }
}

// Change from MemStorage to DatabaseStorage for persistence
export const storage = new MemStorage();
