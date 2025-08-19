import { 
  users, type User, type InsertUser,
  bankConnections, type BankConnection, type InsertBankConnection,
  creditScores, type CreditScore, type InsertCreditScore,
  insuranceRisks, type InsuranceRisk, type InsertInsuranceRisk,
  financialGoals, type FinancialGoal, type InsertFinancialGoal, 
  financialProducts, type FinancialProduct, type InsertFinancialProduct,
  expenses, type Expense, type InsertExpense,
  billSplits, type BillSplit, type InsertBillSplit,
  billSplitParticipants, type BillSplitParticipant, type InsertBillSplitParticipant,
  notifications, type Notification, type InsertNotification
} from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";

export interface IStorage {
  // User operations
  getUser(id: string | number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Bank connection operations
  getBankConnections(userId: string): Promise<BankConnection[]>;
  getBankConnection(id: number): Promise<BankConnection | undefined>;
  createBankConnection(connection: InsertBankConnection): Promise<BankConnection>;
  updateBankConnection(id: number, connection: Partial<InsertBankConnection>): Promise<BankConnection | undefined>;
  deleteBankConnection(id: number): Promise<boolean>;
  
  // Credit score operations
  getCreditScore(userId: string): Promise<CreditScore | undefined>;
  createCreditScore(creditScore: InsertCreditScore): Promise<CreditScore>;
  updateCreditScore(userId: string, creditScore: Partial<InsertCreditScore>): Promise<CreditScore | undefined>;
  
  // Insurance risk operations
  getInsuranceRisk(userId: string): Promise<InsuranceRisk | undefined>;
  createInsuranceRisk(insuranceRisk: InsertInsuranceRisk): Promise<InsuranceRisk>;
  updateInsuranceRisk(userId: string, insuranceRisk: Partial<InsuranceRisk>): Promise<InsuranceRisk | undefined>;
  
  // Financial goal operations
  getFinancialGoals(userId: string): Promise<FinancialGoal[]>;
  getFinancialGoal(id: number): Promise<FinancialGoal | undefined>;
  createFinancialGoal(goal: InsertFinancialGoal): Promise<FinancialGoal>;
  updateFinancialGoal(id: number, goal: Partial<InsertFinancialGoal>): Promise<FinancialGoal | undefined>;
  deleteFinancialGoal(id: number): Promise<boolean>;
  
  // Financial product operations
  getFinancialProducts(category?: string): Promise<FinancialProduct[]>;
  getFinancialProduct(id: number): Promise<FinancialProduct | undefined>;
  createFinancialProduct(product: InsertFinancialProduct): Promise<FinancialProduct>;
  
  // Expense operations
  getExpenses(userId: string): Promise<Expense[]>;
  getExpense(id: number): Promise<Expense | undefined>;
  createExpense(expense: InsertExpense): Promise<Expense>;
  updateExpense(id: number, expense: Partial<InsertExpense>): Promise<Expense | undefined>;
  deleteExpense(id: number): Promise<boolean>;
  
  // Bill split operations
  getBillSplits(userId: string): Promise<BillSplit[]>;
  getBillSplit(id: number): Promise<BillSplit | undefined>;
  createBillSplit(billSplit: InsertBillSplit): Promise<BillSplit>;
  updateBillSplit(id: number, billSplit: Partial<InsertBillSplit>): Promise<BillSplit | undefined>;
  deleteBillSplit(id: number): Promise<boolean>;
  
  // Bill split participant operations
  getBillSplitParticipants(billSplitId: number): Promise<BillSplitParticipant[]>;
  createBillSplitParticipant(participant: InsertBillSplitParticipant): Promise<BillSplitParticipant>;
  updateBillSplitParticipant(id: number, participant: Partial<InsertBillSplitParticipant>): Promise<BillSplitParticipant | undefined>;
  
  // Notification operations
  getNotifications(userId: string, options?: { limit?: number; offset?: number; category?: string; unreadOnly?: boolean }): Promise<Notification[]>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  markNotificationAsRead(notificationId: number, userId: string): Promise<boolean>;
  markAllNotificationsAsRead(userId: string): Promise<boolean>;
  deleteNotification(notificationId: number, userId: string): Promise<boolean>;
  getUnreadNotificationCount(userId: string): Promise<number>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private bankConnections: Map<number, BankConnection>;
  private creditScores: Map<number, CreditScore>;
  private insuranceRisks: Map<number, InsuranceRisk>;
  private financialGoals: Map<number, FinancialGoal>;
  private financialProducts: Map<number, FinancialProduct>;
  private expenses: Map<number, Expense>;
  private billSplits: Map<number, BillSplit>;
  private billSplitParticipants: Map<number, BillSplitParticipant>;
  
  private currentUserId: number;
  private currentBankConnectionId: number;
  private currentCreditScoreId: number;
  private currentInsuranceRiskId: number;
  private currentFinancialGoalId: number;
  private currentFinancialProductId: number;
  private currentExpenseId: number;
  private currentBillSplitId: number;
  private currentBillSplitParticipantId: number;

  constructor() {
    this.users = new Map();
    this.bankConnections = new Map();
    this.creditScores = new Map();
    this.insuranceRisks = new Map();
    this.financialGoals = new Map();
    this.financialProducts = new Map();
    this.expenses = new Map();
    this.billSplits = new Map();
    this.billSplitParticipants = new Map();
    
    this.currentUserId = 1;
    this.currentBankConnectionId = 1;
    this.currentCreditScoreId = 1;
    this.currentInsuranceRiskId = 1;
    this.currentFinancialGoalId = 1;
    this.currentFinancialProductId = 1;
    this.currentExpenseId = 1;
    this.currentBillSplitId = 1;
    this.currentBillSplitParticipantId = 1;
    
    // Prepopulate with sample financial products
    this.seedFinancialProducts();
    this.seedSampleExpenses();
  }

  // Expense operations
  async getExpenses(userId: number): Promise<Expense[]> {
    return Array.from(this.expenses.values()).filter(expense => expense.userId === userId);
  }

  async getExpense(id: number): Promise<Expense | undefined> {
    return this.expenses.get(id);
  }

  async createExpense(insertExpense: InsertExpense): Promise<Expense> {
    const expense: Expense = {
      id: this.currentExpenseId++,
      ...insertExpense,
      createdAt: new Date(),
    };
    this.expenses.set(expense.id, expense);
    return expense;
  }

  async updateExpense(id: number, updateData: Partial<InsertExpense>): Promise<Expense | undefined> {
    const existing = this.expenses.get(id);
    if (!existing) return undefined;

    const updated: Expense = { ...existing, ...updateData };
    this.expenses.set(id, updated);
    return updated;
  }

  async deleteExpense(id: number): Promise<boolean> {
    return this.expenses.delete(id);
  }

  // Bill split operations
  async getBillSplits(userId: number): Promise<BillSplit[]> {
    return Array.from(this.billSplits.values()).filter(split => split.createdBy === userId);
  }

  async getBillSplit(id: number): Promise<BillSplit | undefined> {
    return this.billSplits.get(id);
  }

  async createBillSplit(insertBillSplit: InsertBillSplit): Promise<BillSplit> {
    const billSplit: BillSplit = {
      id: this.currentBillSplitId++,
      ...insertBillSplit,
      createdAt: new Date(),
    };
    this.billSplits.set(billSplit.id, billSplit);
    return billSplit;
  }

  async updateBillSplit(id: number, updateData: Partial<InsertBillSplit>): Promise<BillSplit | undefined> {
    const existing = this.billSplits.get(id);
    if (!existing) return undefined;

    const updated: BillSplit = { ...existing, ...updateData };
    this.billSplits.set(id, updated);
    return updated;
  }

  async deleteBillSplit(id: number): Promise<boolean> {
    return this.billSplits.delete(id);
  }

  // Bill split participant operations
  async getBillSplitParticipants(billSplitId: number): Promise<BillSplitParticipant[]> {
    return Array.from(this.billSplitParticipants.values()).filter(p => p.billSplitId === billSplitId);
  }

  async createBillSplitParticipant(insertParticipant: InsertBillSplitParticipant): Promise<BillSplitParticipant> {
    const participant: BillSplitParticipant = {
      id: this.currentBillSplitParticipantId++,
      ...insertParticipant,
      createdAt: new Date(),
    };
    this.billSplitParticipants.set(participant.id, participant);
    return participant;
  }

  async updateBillSplitParticipant(id: number, updateData: Partial<InsertBillSplitParticipant>): Promise<BillSplitParticipant | undefined> {
    const existing = this.billSplitParticipants.get(id);
    if (!existing) return undefined;

    const updated: BillSplitParticipant = { ...existing, ...updateData };
    this.billSplitParticipants.set(id, updated);
    return updated;
  }

  private async seedSampleExpenses() {
    const sampleExpenses = [
      {
        userId: 1,
        amount: "85.50",
        description: "Grocery shopping at Whole Foods",
        category: "Groceries",
        subcategory: "Food & Beverages",
        merchantName: "Whole Foods Market",
        date: new Date("2024-01-15"),
        paymentMethod: "Credit Card",
        isRecurring: false,
        tags: ["food", "groceries"],
        notes: "Weekly grocery run",
        isAutoClassified: true,
        confidence: "0.95"
      },
      {
        userId: 1,
        amount: "1200.00",
        description: "Monthly rent payment",
        category: "Housing",
        subcategory: "Rent",
        merchantName: "Property Management Co",
        date: new Date("2024-01-01"),
        paymentMethod: "Bank Transfer",
        isRecurring: true,
        tags: ["rent", "housing"],
        notes: "Monthly rent",
        isAutoClassified: true,
        confidence: "0.99"
      },
      {
        userId: 1,
        amount: "45.00",
        description: "Gas station fill-up",
        category: "Transportation",
        subcategory: "Fuel",
        merchantName: "Shell",
        date: new Date("2024-01-10"),
        paymentMethod: "Debit Card",
        isRecurring: false,
        tags: ["gas", "car"],
        notes: "Tank fill-up",
        isAutoClassified: true,
        confidence: "0.92"
      }
    ];

    for (const expense of sampleExpenses) {
      await this.createExpense(expense);
    }
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
  async getUser(id: string | number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id as string));
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
  
  // Expense operations
  async getExpenses(userId: string): Promise<Expense[]> {
    return await db
      .select()
      .from(expenses)
      .where(eq(expenses.userId, userId));
  }
  
  async getExpense(id: number): Promise<Expense | undefined> {
    const [expense] = await db
      .select()
      .from(expenses)
      .where(eq(expenses.id, id));
    return expense || undefined;
  }
  
  async createExpense(insertExpense: InsertExpense): Promise<Expense> {
    const [expense] = await db
      .insert(expenses)
      .values(insertExpense)
      .returning();
    return expense;
  }
  
  async updateExpense(id: number, expense: Partial<InsertExpense>): Promise<Expense | undefined> {
    const [updatedExpense] = await db
      .update(expenses)
      .set(expense)
      .where(eq(expenses.id, id))
      .returning();
    return updatedExpense || undefined;
  }
  
  async deleteExpense(id: number): Promise<boolean> {
    const result = await db
      .delete(expenses)
      .where(eq(expenses.id, id));
    return !!result;
  }
  
  // Bill split operations
  async getBillSplits(userId: string): Promise<BillSplit[]> {
    return await db
      .select()
      .from(billSplits)
      .where(eq(billSplits.createdBy, userId));
  }
  
  async getBillSplit(id: number): Promise<BillSplit | undefined> {
    const [billSplit] = await db
      .select()
      .from(billSplits)
      .where(eq(billSplits.id, id));
    return billSplit || undefined;
  }
  
  async createBillSplit(insertBillSplit: InsertBillSplit): Promise<BillSplit> {
    const [billSplit] = await db
      .insert(billSplits)
      .values(insertBillSplit)
      .returning();
    return billSplit;
  }
  
  async updateBillSplit(id: number, billSplit: Partial<InsertBillSplit>): Promise<BillSplit | undefined> {
    const [updatedBillSplit] = await db
      .update(billSplits)
      .set(billSplit)
      .where(eq(billSplits.id, id))
      .returning();
    return updatedBillSplit || undefined;
  }
  
  async deleteBillSplit(id: number): Promise<boolean> {
    const result = await db
      .delete(billSplits)
      .where(eq(billSplits.id, id));
    return !!result;
  }
  
  // Bill split participant operations
  async getBillSplitParticipants(billSplitId: number): Promise<BillSplitParticipant[]> {
    return await db
      .select()
      .from(billSplitParticipants)
      .where(eq(billSplitParticipants.billSplitId, billSplitId));
  }
  
  async createBillSplitParticipant(insertParticipant: InsertBillSplitParticipant): Promise<BillSplitParticipant> {
    const [participant] = await db
      .insert(billSplitParticipants)
      .values(insertParticipant)
      .returning();
    return participant;
  }
  
  async updateBillSplitParticipant(id: number, participant: Partial<InsertBillSplitParticipant>): Promise<BillSplitParticipant | undefined> {
    const [updatedParticipant] = await db
      .update(billSplitParticipants)
      .set(participant)
      .where(eq(billSplitParticipants.id, id))
      .returning();
    return updatedParticipant || undefined;
  }
  
  // Notification operations
  async getNotifications(userId: string, options?: { limit?: number; offset?: number; category?: string; unreadOnly?: boolean }): Promise<Notification[]> {
    let query = db.select().from(notifications).where(eq(notifications.userId, userId));
    
    if (options?.category) {
      query = query.where(eq(notifications.category, options.category));
    }
    
    if (options?.unreadOnly) {
      query = query.where(eq(notifications.isRead, false));
    }
    
    if (options?.limit) {
      query = query.limit(options.limit);
    }
    
    if (options?.offset) {
      query = query.offset(options.offset);
    }
    
    return await query;
  }
  
  async createNotification(insertNotification: InsertNotification): Promise<Notification> {
    const [notification] = await db
      .insert(notifications)
      .values(insertNotification)
      .returning();
    return notification;
  }
  
  async markNotificationAsRead(notificationId: number, userId: string): Promise<boolean> {
    const result = await db
      .update(notifications)
      .set({ isRead: true, readAt: new Date() })
      .where(eq(notifications.id, notificationId))
      .where(eq(notifications.userId, userId));
    return !!result;
  }
  
  async markAllNotificationsAsRead(userId: string): Promise<boolean> {
    const result = await db
      .update(notifications)
      .set({ isRead: true, readAt: new Date() })
      .where(eq(notifications.userId, userId));
    return !!result;
  }
  
  async deleteNotification(notificationId: number, userId: string): Promise<boolean> {
    const result = await db
      .delete(notifications)
      .where(eq(notifications.id, notificationId))
      .where(eq(notifications.userId, userId));
    return !!result;
  }
  
  async getUnreadNotificationCount(userId: string): Promise<number> {
    const result = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .where(eq(notifications.isRead, false));
    return result.length;
  }
}

import { db } from "./db";

// Automatically choose storage based on database availability
function createStorage(): IStorage {
  if (db) {
    console.log("🗄️  Using PostgreSQL database storage");
    return new DatabaseStorage();
  } else {
    console.log("💾 Using in-memory storage (development mode)");
    return new MemStorage();
  }
}

export const storage = createStorage();
