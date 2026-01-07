import { 
  users, type User, type InsertUser,
  bankConnections, type BankConnection, type InsertBankConnection,
  accounts, type Account, type InsertAccount,
  balances, type Balance, type InsertBalance,
  transactions, type Transaction, type InsertTransaction,
  creditScores, type CreditScore, type InsertCreditScore,
  insuranceRisks, type InsuranceRisk, type InsertInsuranceRisk,
  financialGoals, type FinancialGoal, type InsertFinancialGoal, 
  financialProducts, type FinancialProduct, type InsertFinancialProduct,
  expenses, type Expense, type InsertExpense,
  billSplits, type BillSplit, type InsertBillSplit,
  billSplitParticipants, type BillSplitParticipant, type InsertBillSplitParticipant,
  notifications, type Notification, type InsertNotification
} from "../../../packages/db/src/schema.js";
import { db } from "./db.js";
import { eq, and, inArray, isNull, desc } from "drizzle-orm";

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, user: Partial<InsertUser>): Promise<User | undefined>;
  
  // Bank connection operations
  getBankConnections(userId: string): Promise<BankConnection[]>;
  getBankConnection(id: number): Promise<BankConnection | undefined>;
  createBankConnection(connection: InsertBankConnection): Promise<BankConnection>;
  updateBankConnection(id: number, connection: Partial<InsertBankConnection>): Promise<BankConnection | undefined>;
  deleteBankConnection(id: number): Promise<boolean>;
  
  // Accounts & transactions (Open Banking) operations
  getAccounts(userId: string): Promise<Account[]>;
  getAccount(id: number): Promise<Account | undefined>;
  createAccount(account: InsertAccount): Promise<Account>;
  updateAccount(id: number, account: Partial<InsertAccount>): Promise<Account | undefined>;

  upsertBalance(balance: InsertBalance): Promise<Balance>;
  getBalances(accountId: number): Promise<Balance[]>;

  createTransactionsBulk(transactions: InsertTransaction[]): Promise<Transaction[]>;
  getTransactions(accountId: number, options?: { from?: Date; to?: Date; limit?: number; offset?: number }): Promise<Transaction[]>;
  
  // Credit score operations
  getCreditScore(userId: string): Promise<CreditScore | undefined>;
  createCreditScore(creditScore: InsertCreditScore): Promise<CreditScore>;
  updateCreditScore(userId: string, creditScore: Partial<InsertCreditScore>): Promise<CreditScore | undefined>;
  
  // Insurance risk operations
  getInsuranceRisk(userId: string): Promise<InsuranceRisk | undefined>;
  createInsuranceRisk(insuranceRisk: InsertInsuranceRisk): Promise<InsuranceRisk>;
  updateInsuranceRisk(userId: string, insuranceRisk: Partial<InsertInsuranceRisk>): Promise<InsuranceRisk | undefined>;
  
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
  getBillSplitsAsParticipant(userId: string): Promise<BillSplit[]>;
  getBillSplit(id: number): Promise<BillSplit | undefined>;
  createBillSplit(billSplit: InsertBillSplit): Promise<BillSplit>;
  updateBillSplit(id: number, billSplit: Partial<InsertBillSplit>): Promise<BillSplit | undefined>;
  deleteBillSplit(id: number): Promise<boolean>;
  
  // Bill split participant operations
  getBillSplitParticipants(billSplitId: number): Promise<BillSplitParticipant[]>;
  createBillSplitParticipant(participant: InsertBillSplitParticipant): Promise<BillSplitParticipant>;
  updateBillSplitParticipant(id: number, participant: Partial<InsertBillSplitParticipant>): Promise<BillSplitParticipant | undefined>;
  getUnlinkedParticipantsByEmail(email: string): Promise<BillSplitParticipant[]>;
  
  // Notification operations
  getNotifications(userId: string, options?: { limit?: number; offset?: number; category?: string; unreadOnly?: boolean }): Promise<Notification[]>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  markNotificationAsRead(notificationId: number, userId: string): Promise<boolean>;
  markAllNotificationsAsRead(userId: string): Promise<boolean>;
  deleteNotification(notificationId: number, userId: string): Promise<boolean>;
  getUnreadNotificationCount(userId: string): Promise<number>;
  
  // User data cleanup
  deleteUserData(userId: string): Promise<boolean>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private bankConnections: Map<number, BankConnection>;
  private accounts: Map<number, Account>;
  private balances: Map<number, Balance>;
  private transactions: Map<number, Transaction>;
  private creditScores: Map<number, CreditScore>;
  private insuranceRisks: Map<number, InsuranceRisk>;
  private financialGoals: Map<number, FinancialGoal>;
  private financialProducts: Map<number, FinancialProduct>;
  private expenses: Map<number, Expense>;
  private billSplits: Map<number, BillSplit>;
  private billSplitParticipants: Map<number, BillSplitParticipant>;
  private notifications: Map<number, Notification>;
  
  private currentUserId: number;
  private currentBankConnectionId: number;
  private currentAccountId: number;
  private currentBalanceId: number;
  private currentTransactionId: number;
  private currentCreditScoreId: number;
  private currentInsuranceRiskId: number;
  private currentFinancialGoalId: number;
  private currentFinancialProductId: number;
  private currentExpenseId: number;
  private currentBillSplitId: number;
  private currentBillSplitParticipantId: number;
  private currentNotificationId: number;

  constructor() {
    this.users = new Map();
    this.bankConnections = new Map();
    this.accounts = new Map();
    this.balances = new Map();
    this.transactions = new Map();
    this.creditScores = new Map();
    this.insuranceRisks = new Map();
    this.financialGoals = new Map();
    this.financialProducts = new Map();
    this.expenses = new Map();
    this.billSplits = new Map();
    this.billSplitParticipants = new Map();
    this.notifications = new Map();
    
    this.currentUserId = 1;
    this.currentBankConnectionId = 1;
    this.currentAccountId = 1;
    this.currentBalanceId = 1;
    this.currentTransactionId = 1;
    this.currentCreditScoreId = 1;
    this.currentInsuranceRiskId = 1;
    this.currentFinancialGoalId = 1;
    this.currentFinancialProductId = 1;
    this.currentExpenseId = 1;
    this.currentBillSplitId = 1;
    this.currentBillSplitParticipantId = 1;
    this.currentNotificationId = 1;
    
    // Prepopulate with sample financial products
    this.seedFinancialProducts();
    this.seedSampleExpenses();
  }

  // Expense operations
  async getExpenses(userId: string): Promise<Expense[]> {
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
      // Ensure undefined values become null for nullable fields
      subcategory: insertExpense.subcategory ?? null,
      merchantName: insertExpense.merchantName ?? null,
      paymentMethod: insertExpense.paymentMethod ?? null,
      notes: insertExpense.notes ?? null,
      confidence: insertExpense.confidence ?? null,
      // Fix array and boolean fields - ensure they are not undefined
      tags: insertExpense.tags ?? null,
      isRecurring: insertExpense.isRecurring ?? false,
      isAutoClassified: insertExpense.isAutoClassified ?? true,
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
  async getBillSplits(userId: string): Promise<BillSplit[]> {
    return Array.from(this.billSplits.values()).filter(split => split.createdBy === userId);
  }

  async getBillSplitsAsParticipant(userId: string): Promise<BillSplit[]> {
    // Find bill split IDs where user is a participant
    const participantEntries = Array.from(this.billSplitParticipants.values())
      .filter(participant => participant.userId === userId);
    const participantBillSplitIds = new Set(participantEntries.map(p => p.billSplitId));
    
    // Return bill splits where user is a participant
    return Array.from(this.billSplits.values())
      .filter(split => participantBillSplitIds.has(split.id as number));
  }

  async getBillSplit(id: number): Promise<BillSplit | undefined> {
    return this.billSplits.get(id);
  }

  async createBillSplit(insertBillSplit: InsertBillSplit): Promise<BillSplit> {
    const billSplit: BillSplit = {
      id: this.currentBillSplitId++,
      ...insertBillSplit,
      createdAt: new Date(),
      // Ensure undefined values become null for nullable fields
      description: insertBillSplit.description ?? null,
      status: insertBillSplit.status ?? null,
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
      // Ensure undefined values become null for nullable fields
      email: insertParticipant.email ?? null,
      userId: insertParticipant.userId ?? null,
      amountPaid: insertParticipant.amountPaid ?? null,
      isPaid: insertParticipant.isPaid ?? null,
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

  // Get participant records that have an email but no userId (for linking new users)
  async getUnlinkedParticipantsByEmail(email: string): Promise<BillSplitParticipant[]> {
    return Array.from(this.billSplitParticipants.values())
      .filter(participant => participant.email === email && participant.userId === null);
  }

  private async seedSampleExpenses() {
    const sampleExpenses = [
      {
        userId: "1",
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
        userId: "1",
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
        userId: "1",
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
  async getUser(id: string): Promise<User | undefined> {
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
    const id = String(this.currentUserId++);
    const now = new Date();
    const user: User = { 
      ...insertUser, 
      id,
      createdAt: now,
      updatedAt: now,
      // Ensure undefined becomes null for nullable fields
      firstName: insertUser.firstName ?? null,
      lastName: insertUser.lastName ?? null,
      displayName: insertUser.displayName ?? null,
      timezone: insertUser.timezone ?? "UTC",
      language: insertUser.language ?? "English",
      profilePicture: insertUser.profilePicture ?? null,
      userMetadata: insertUser.userMetadata ?? null,
    };
    this.users.set(id, user);
    return user;
  }

  async updateUser(id: string, updateData: Partial<InsertUser>): Promise<User | undefined> {
    const existingUser = this.users.get(id);
    if (!existingUser) return undefined;

    const now = new Date();
    const updatedUser: User = {
      ...existingUser,
      ...updateData,
      updatedAt: now,
      // Handle nullable fields properly
      firstName: updateData.firstName !== undefined ? updateData.firstName : existingUser.firstName,
      lastName: updateData.lastName !== undefined ? updateData.lastName : existingUser.lastName,
      displayName: updateData.displayName !== undefined ? updateData.displayName : existingUser.displayName,
      timezone: updateData.timezone !== undefined ? updateData.timezone : existingUser.timezone,
      language: updateData.language !== undefined ? updateData.language : existingUser.language,
      profilePicture: updateData.profilePicture !== undefined ? updateData.profilePicture : existingUser.profilePicture,
      userMetadata: updateData.userMetadata !== undefined ? updateData.userMetadata : existingUser.userMetadata,
    };

    this.users.set(id, updatedUser);
    return updatedUser;
  }
  
  // Bank connection methods
  async getBankConnections(userId: string): Promise<BankConnection[]> {
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
      lastUpdated: now,
      // Ensure proper field defaults
      status: insertConnection.status ?? "connected",
      connectionData: insertConnection.connectionData ?? null,
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
  
  // Accounts & transactions (Open Banking) methods
  async getAccounts(userId: string): Promise<Account[]> {
    return Array.from(this.accounts.values()).filter(a => a.userId === userId);
  }

  async getAccount(id: number): Promise<Account | undefined> {
    return this.accounts.get(id);
  }

  async createAccount(insertAccount: InsertAccount): Promise<Account> {
    const account: Account = {
      id: this.currentAccountId++,
      ...insertAccount,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Account;
    this.accounts.set(account.id as number, account);
    return account;
  }

  async updateAccount(id: number, account: Partial<InsertAccount>): Promise<Account | undefined> {
    const existing = this.accounts.get(id);
    if (!existing) return undefined;
    const updated: Account = { ...existing, ...account, updatedAt: new Date() } as Account;
    this.accounts.set(id, updated);
    return updated;
  }

  async upsertBalance(balanceIn: InsertBalance): Promise<Balance> {
    const balance: Balance = { id: this.currentBalanceId++, ...balanceIn } as Balance;
    this.balances.set(balance.id as number, balance);
    return balance;
  }

  async getBalances(accountId: number): Promise<Balance[]> {
    return Array.from(this.balances.values()).filter(b => b.accountId === accountId);
  }

  async createTransactionsBulk(items: InsertTransaction[]): Promise<Transaction[]> {
    const created: Transaction[] = [];
    for (const t of items) {
      const tx: Transaction = { id: this.currentTransactionId++, ...t, createdAt: new Date() } as Transaction;
      this.transactions.set(tx.id as number, tx);
      created.push(tx);
    }
    return created;
  }

  async getTransactions(accountId: number, options?: { from?: Date; to?: Date; limit?: number; offset?: number }): Promise<Transaction[]> {
    let list = Array.from(this.transactions.values()).filter(tx => tx.accountId === accountId);
    if (options?.from) list = list.filter(tx => tx.postedAt >= options.from!);
    if (options?.to) list = list.filter(tx => tx.postedAt <= options.to!);
    list.sort((a, b) => a.postedAt.getTime() - b.postedAt.getTime());
    if (options?.offset) list = list.slice(options.offset);
    if (options?.limit) list = list.slice(0, options.limit);
    return list;
  }

  // Credit score methods
  async getCreditScore(userId: string): Promise<CreditScore | undefined> {
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
      lastUpdated: now,
      // Ensure maxScore has default value
      maxScore: insertCreditScore.maxScore ?? 850,
    };
    this.creditScores.set(id, creditScore);
    return creditScore;
  }
  
  async updateCreditScore(userId: string, creditScore: Partial<InsertCreditScore>): Promise<CreditScore | undefined> {
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
  async getInsuranceRisk(userId: string): Promise<InsuranceRisk | undefined> {
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
  
  async updateInsuranceRisk(userId: string, insuranceRisk: Partial<InsertInsuranceRisk>): Promise<InsuranceRisk | undefined> {
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
  async getFinancialGoals(userId: string): Promise<FinancialGoal[]> {
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
      createdAt: now,
      // Ensure currentAmount has default value
      currentAmount: insertGoal.currentAmount ?? 0,
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
      // Ensure nullable JSONB fields are handled properly
      requirements: insertProduct.requirements ?? null,
      features: insertProduct.features ?? null,
      // Ensure nullable numeric fields are handled properly
      interestRate: insertProduct.interestRate ?? null,
      term: insertProduct.term ?? null,
      monthlyPayment: insertProduct.monthlyPayment ?? null,
      loanAmount: insertProduct.loanAmount ?? null,
      termUnit: insertProduct.termUnit ?? null,
      description: insertProduct.description ?? null,
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

  // Notification operations
  async getNotifications(userId: string, options?: { limit?: number; offset?: number; category?: string; unreadOnly?: boolean }): Promise<Notification[]> {
    let notifications = Array.from(this.notifications.values()).filter(notification => notification.userId === userId);
    
    if (options?.category) {
      notifications = notifications.filter(notification => notification.category === options.category);
    }
    
    if (options?.unreadOnly) {
      notifications = notifications.filter(notification => !notification.isRead);
    }
    
    // Sort by creation date (most recent first)
    notifications.sort((a, b) => b.createdAt!.getTime() - a.createdAt!.getTime());
    
    if (options?.offset) {
      notifications = notifications.slice(options.offset);
    }
    
    if (options?.limit) {
      notifications = notifications.slice(0, options.limit);
    }
    
    return notifications;
  }
  
  async createNotification(insertNotification: InsertNotification): Promise<Notification> {
    const notification: Notification = {
      id: this.currentNotificationId++,
      ...insertNotification,
      createdAt: new Date(),
      readAt: null,
      // Ensure nullable metadata field is handled properly
      metadata: insertNotification.metadata ?? null,
      // Ensure isRead has default value
      isRead: insertNotification.isRead ?? false,
      // Ensure actionUrl is handled properly
      actionUrl: insertNotification.actionUrl ?? null,
    };
    this.notifications.set(notification.id, notification);
    return notification;
  }
  
  async markNotificationAsRead(notificationId: number, userId: string): Promise<boolean> {
    const notification = this.notifications.get(notificationId);
    if (!notification || notification.userId !== userId) {
      return false;
    }
    
    notification.isRead = true;
    notification.readAt = new Date();
    this.notifications.set(notificationId, notification);
    return true;
  }
  
  async markAllNotificationsAsRead(userId: string): Promise<boolean> {
    const userNotifications = Array.from(this.notifications.values()).filter(
      notification => notification.userId === userId && !notification.isRead
    );
    
    const now = new Date();
    userNotifications.forEach(notification => {
      notification.isRead = true;
      notification.readAt = now;
      this.notifications.set(notification.id, notification);
    });
    
    return userNotifications.length > 0;
  }
  
  async deleteNotification(notificationId: number, userId: string): Promise<boolean> {
    const notification = this.notifications.get(notificationId);
    if (!notification || notification.userId !== userId) {
      return false;
    }
    
    return this.notifications.delete(notificationId);
  }
  
  async getUnreadNotificationCount(userId: string): Promise<number> {
    return Array.from(this.notifications.values())
      .filter(notification => notification.userId === userId && !notification.isRead)
      .length;
  }
  
  // User data cleanup
  async deleteUserData(userId: string): Promise<boolean> {
    try {
      // Delete all user-related data from memory maps
      
      // Delete bank connections
      const userConnections = Array.from(this.bankConnections.entries())
        .filter(([_, connection]) => connection.userId === userId);
      userConnections.forEach(([id, _]) => this.bankConnections.delete(id));
      
      // Delete credit scores
      const userCreditScores = Array.from(this.creditScores.entries())
        .filter(([_, score]) => score.userId === userId);
      userCreditScores.forEach(([id, _]) => this.creditScores.delete(id));
      
      // Delete insurance risks
      const userInsuranceRisks = Array.from(this.insuranceRisks.entries())
        .filter(([_, risk]) => risk.userId === userId);
      userInsuranceRisks.forEach(([id, _]) => this.insuranceRisks.delete(id));
      
      // Delete financial goals
      const userGoals = Array.from(this.financialGoals.entries())
        .filter(([_, goal]) => goal.userId === userId);
      userGoals.forEach(([id, _]) => this.financialGoals.delete(id));
      
      // Delete expenses
      const userExpenses = Array.from(this.expenses.entries())
        .filter(([_, expense]) => expense.userId === userId);
      userExpenses.forEach(([id, _]) => this.expenses.delete(id));
      
      // Delete bill splits created by user
      const userBillSplits = Array.from(this.billSplits.entries())
        .filter(([_, billSplit]) => billSplit.createdBy === userId);
      userBillSplits.forEach(([id, _]) => {
        // Also delete participants for these bill splits
        const participants = Array.from(this.billSplitParticipants.entries())
          .filter(([_, participant]) => participant.billSplitId === id);
        participants.forEach(([participantId, _]) => this.billSplitParticipants.delete(participantId));
        
        this.billSplits.delete(id);
      });
      
      // Delete notifications
      const userNotifications = Array.from(this.notifications.entries())
        .filter(([_, notification]) => notification.userId === userId);
      userNotifications.forEach(([id, _]) => this.notifications.delete(id));
      
      // Finally delete the user
      this.users.delete(userId);
      
      return true;
    } catch (error) {
      console.error('Error deleting user data:', error);
      return false;
    }
  }
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    if (!db) return undefined;
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }
  
  async getUserByUsername(username: string): Promise<User | undefined> {
    if (!db) return undefined;
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }
  
  async getUserByEmail(email: string): Promise<User | undefined> {
    if (!db) return undefined;
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }
  
  async createUser(insertUser: InsertUser & { id?: string }): Promise<User> {
    if (!db) throw new Error("Database not available");
    // Use provided ID or generate a unique ID for the user if not provided
    const userWithId = {
      ...insertUser,
      id: insertUser.id || Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9)
    };
    const [user] = await db
      .insert(users)
      .values(userWithId)
      .returning();
    return user;
  }

  async updateUser(id: string, updateData: Partial<InsertUser>): Promise<User | undefined> {
    if (!db) {
      return undefined;
    }
    
    const [updatedUser] = await db
      .update(users)
      .set({
        ...updateData,
        updatedAt: new Date()
      })
      .where(eq(users.id, id))
      .returning();
      
    return updatedUser || undefined;
  }
  
  // Bank connection operations
  async getBankConnections(userId: string): Promise<BankConnection[]> {
    if (!db) return [];
    return await db
      .select()
      .from(bankConnections)
      .where(eq(bankConnections.userId, userId));
  }
  
  async getBankConnection(id: number): Promise<BankConnection | undefined> {
    if (!db) return undefined;
    const [connection] = await db
      .select()
      .from(bankConnections)
      .where(eq(bankConnections.id, id));
    return connection || undefined;
  }
  
  async createBankConnection(insertConnection: InsertBankConnection): Promise<BankConnection> {
    if (!db) throw new Error("Database not available");
    const [connection] = await db
      .insert(bankConnections)
      .values(insertConnection)
      .returning();
    return connection;
  }
  
  async updateBankConnection(id: number, connection: Partial<InsertBankConnection>): Promise<BankConnection | undefined> {
    if (!db) return undefined;
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
    if (!db) return false;
    const result = await db
      .delete(bankConnections)
      .where(eq(bankConnections.id, id));
    return !!result;
  }
  
  // Accounts & transactions (Open Banking) operations
  async getAccounts(userId: string): Promise<Account[]> {
    if (!db) return [];
    return await db.select().from(accounts).where(eq(accounts.userId, userId));
  }

  async getAccount(id: number): Promise<Account | undefined> {
    if (!db) return undefined;
    const [acc] = await db.select().from(accounts).where(eq(accounts.id, id));
    return acc || undefined;
  }

  async createAccount(insertAccount: InsertAccount): Promise<Account> {
    if (!db) throw new Error("Database not available");
    const [acc] = await db.insert(accounts).values(insertAccount).returning();
    return acc;
  }

  async updateAccount(id: number, account: Partial<InsertAccount>): Promise<Account | undefined> {
    if (!db) return undefined;
    const [acc] = await db.update(accounts).set({ ...account, updatedAt: new Date() }).where(eq(accounts.id, id)).returning();
    return acc || undefined;
  }

  async upsertBalance(balanceIn: InsertBalance): Promise<Balance> {
    if (!db) throw new Error("Database not available");
    // For simplicity, just insert a new balance row (can be replaced with ON CONFLICT if needed)
    const [bal] = await db.insert(balances).values(balanceIn).returning();
    return bal;
  }

  async getBalances(accountId: number): Promise<Balance[]> {
    if (!db) return [];
    return await db.select().from(balances).where(eq(balances.accountId, accountId));
  }

  async createTransactionsBulk(items: InsertTransaction[]): Promise<Transaction[]> {
    if (!db) throw new Error("Database not available");
    if (items.length === 0) return [];
    const inserted = await db.insert(transactions).values(items).returning();
    return inserted;
  }

  async getTransactions(accountId: number, options?: { from?: Date; to?: Date; limit?: number; offset?: number }): Promise<Transaction[]> {
    if (!db) return [];
    // Build a basic filtered select. For brevity, compose conditions inline.
    let result = await db.select().from(transactions).where(eq(transactions.accountId, accountId));

    if (options?.from) {
      result = result.filter(tx => tx.postedAt >= options.from!);
    }
    if (options?.to) {
      result = result.filter(tx => tx.postedAt <= options.to!);
    }
    // Sort ascending by postedAt
    result.sort((a, b) => a.postedAt.getTime() - b.postedAt.getTime());
    if (options?.offset) result = result.slice(options.offset);
    if (options?.limit) result = result.slice(0, options.limit);
    return result;
  }

  // Credit score operations
  async getCreditScore(userId: string): Promise<CreditScore | undefined> {
    if (!db) return undefined;
    const [creditScore] = await db
      .select()
      .from(creditScores)
      .where(eq(creditScores.userId, userId));
    return creditScore || undefined;
  }
  
  async createCreditScore(insertCreditScore: InsertCreditScore): Promise<CreditScore> {
    if (!db) throw new Error("Database not available");
    const [creditScore] = await db
      .insert(creditScores)
      .values(insertCreditScore)
      .returning();
    return creditScore;
  }
  
  async updateCreditScore(userId: string, creditScore: Partial<InsertCreditScore>): Promise<CreditScore | undefined> {
    if (!db) return undefined;
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
  async getInsuranceRisk(userId: string): Promise<InsuranceRisk | undefined> {
    if (!db) return undefined;
    const [insuranceRisk] = await db
      .select()
      .from(insuranceRisks)
      .where(eq(insuranceRisks.userId, userId));
    return insuranceRisk || undefined;
  }
  
  async createInsuranceRisk(insertInsuranceRisk: InsertInsuranceRisk): Promise<InsuranceRisk> {
    if (!db) throw new Error("Database not available");
    const [insuranceRisk] = await db
      .insert(insuranceRisks)
      .values(insertInsuranceRisk)
      .returning();
    return insuranceRisk;
  }
  
  async updateInsuranceRisk(userId: string, insuranceRisk: Partial<InsertInsuranceRisk>): Promise<InsuranceRisk | undefined> {
    if (!db) return undefined;
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
  async getFinancialGoals(userId: string): Promise<FinancialGoal[]> {
    if (!db) return [];
    return await db
      .select()
      .from(financialGoals)
      .where(eq(financialGoals.userId, userId));
  }
  
  async getFinancialGoal(id: number): Promise<FinancialGoal | undefined> {
    if (!db) return undefined;
    const [goal] = await db
      .select()
      .from(financialGoals)
      .where(eq(financialGoals.id, id));
    return goal || undefined;
  }
  
  async createFinancialGoal(insertGoal: InsertFinancialGoal): Promise<FinancialGoal> {
    if (!db) throw new Error("Database not available");
    
    // Ensure targetDate is a proper Date object
    const goalData = {
      ...insertGoal,
      targetDate: insertGoal.targetDate instanceof Date ? insertGoal.targetDate : new Date(insertGoal.targetDate)
    };
    
    const [goal] = await db
      .insert(financialGoals)
      .values(goalData)
      .returning();
    return goal;
  }
  
  async updateFinancialGoal(id: number, goal: Partial<InsertFinancialGoal>): Promise<FinancialGoal | undefined> {
    if (!db) return undefined;
    
    // Ensure targetDate is a proper Date object if provided
    const goalData = goal.targetDate ? {
      ...goal,
      targetDate: goal.targetDate instanceof Date ? goal.targetDate : new Date(goal.targetDate)
    } : goal;
    
    const [updatedGoal] = await db
      .update(financialGoals)
      .set(goalData)
      .where(eq(financialGoals.id, id))
      .returning();
    return updatedGoal || undefined;
  }
  
  async deleteFinancialGoal(id: number): Promise<boolean> {
    if (!db) return false;
    const result = await db
      .delete(financialGoals)
      .where(eq(financialGoals.id, id));
    return !!result;
  }
  
  // Financial product operations
  async getFinancialProducts(category?: string): Promise<FinancialProduct[]> {
    if (!db) return [];
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
    if (!db) return undefined;
    const [product] = await db
      .select()
      .from(financialProducts)
      .where(eq(financialProducts.id, id));
    return product || undefined;
  }
  
  async createFinancialProduct(insertProduct: InsertFinancialProduct): Promise<FinancialProduct> {
    if (!db) throw new Error("Database not available");
    const [product] = await db
      .insert(financialProducts)
      .values(insertProduct)
      .returning();
    return product;
  }
  
  // Expense operations
  async getExpenses(userId: string): Promise<Expense[]> {
    if (!db) return [];
    return await db
      .select()
      .from(expenses)
      .where(eq(expenses.userId, userId));
  }
  
  async getExpense(id: number): Promise<Expense | undefined> {
    if (!db) return undefined;
    const [expense] = await db
      .select()
      .from(expenses)
      .where(eq(expenses.id, id));
    return expense || undefined;
  }
  
  async createExpense(insertExpense: InsertExpense): Promise<Expense> {
    if (!db) throw new Error("Database not available");
    
    // Ensure date is a proper Date object
    const expenseData = {
      ...insertExpense,
      date: insertExpense.date instanceof Date ? insertExpense.date : new Date(insertExpense.date)
    };
    
    const [expense] = await db
      .insert(expenses)
      .values(expenseData)
      .returning();
    return expense;
  }
  
  async updateExpense(id: number, expense: Partial<InsertExpense>): Promise<Expense | undefined> {
    if (!db) return undefined;
    
    // Ensure date is a proper Date object if provided
    const expenseData = expense.date ? {
      ...expense,
      date: expense.date instanceof Date ? expense.date : new Date(expense.date)
    } : expense;
    
    const [updatedExpense] = await db
      .update(expenses)
      .set(expenseData)
      .where(eq(expenses.id, id))
      .returning();
    return updatedExpense || undefined;
  }
  
  async deleteExpense(id: number): Promise<boolean> {
    if (!db) return false;
    const result = await db
      .delete(expenses)
      .where(eq(expenses.id, id));
    return !!result;
  }
  
  // Bill split operations
  async getBillSplits(userId: string): Promise<BillSplit[]> {
    if (!db) return [];
    return await db
      .select()
      .from(billSplits)
      .where(eq(billSplits.createdBy, userId));
  }

  async getBillSplitsAsParticipant(userId: string): Promise<BillSplit[]> {
    if (!db) return [];
    
    // Get bill split IDs where user is a participant
    const participantBillSplitIds = await db
      .select({ billSplitId: billSplitParticipants.billSplitId })
      .from(billSplitParticipants)
      .where(eq(billSplitParticipants.userId, userId));
    
    if (participantBillSplitIds.length === 0) {
      return [];
    }
    
    // Get the bill splits for these IDs
    const billSplitIds = participantBillSplitIds.map(p => p.billSplitId);
    
    if (billSplitIds.length === 1) {
      const result = await db
        .select()
        .from(billSplits)
        .where(eq(billSplits.id, billSplitIds[0]));
      return result;
    } else {
      const result = await db
        .select()
        .from(billSplits)
        .where(inArray(billSplits.id, billSplitIds));
      return result;
    }
  }
  
  async getBillSplit(id: number): Promise<BillSplit | undefined> {
    if (!db) return undefined;
    const [billSplit] = await db
      .select()
      .from(billSplits)
      .where(eq(billSplits.id, id));
    return billSplit || undefined;
  }
  
  async createBillSplit(insertBillSplit: InsertBillSplit): Promise<BillSplit> {
    if (!db) throw new Error("Database not available");
    const [billSplit] = await db
      .insert(billSplits)
      .values(insertBillSplit)
      .returning();
    return billSplit;
  }
  
  async updateBillSplit(id: number, billSplit: Partial<InsertBillSplit>): Promise<BillSplit | undefined> {
    if (!db) return undefined;
    const [updatedBillSplit] = await db
      .update(billSplits)
      .set(billSplit)
      .where(eq(billSplits.id, id))
      .returning();
    return updatedBillSplit || undefined;
  }
  
  async deleteBillSplit(id: number): Promise<boolean> {
    if (!db) return false;
    const result = await db
      .delete(billSplits)
      .where(eq(billSplits.id, id));
    return !!result;
  }
  
  // Bill split participant operations
  async getBillSplitParticipants(billSplitId: number): Promise<BillSplitParticipant[]> {
    if (!db) return [];
    return await db
      .select()
      .from(billSplitParticipants)
      .where(eq(billSplitParticipants.billSplitId, billSplitId));
  }
  
  async createBillSplitParticipant(insertParticipant: InsertBillSplitParticipant): Promise<BillSplitParticipant> {
    if (!db) throw new Error("Database not available");
    const [participant] = await db
      .insert(billSplitParticipants)
      .values(insertParticipant)
      .returning();
    return participant;
  }
  
  async updateBillSplitParticipant(id: number, participant: Partial<InsertBillSplitParticipant>): Promise<BillSplitParticipant | undefined> {
    if (!db) return undefined;
    const [updatedParticipant] = await db
      .update(billSplitParticipants)
      .set(participant)
      .where(eq(billSplitParticipants.id, id))
      .returning();
    return updatedParticipant || undefined;
  }
  
  // Get participant records that have an email but no userId (for linking new users)
  async getUnlinkedParticipantsByEmail(email: string): Promise<BillSplitParticipant[]> {
    if (!db) return [];
    return await db
      .select()
      .from(billSplitParticipants)
      .where(
        and(
          eq(billSplitParticipants.email, email),
          isNull(billSplitParticipants.userId)
        )
      );
  }
  
  // Notification operations
  async getNotifications(userId: string, options?: { limit?: number; offset?: number; category?: string; unreadOnly?: boolean }): Promise<Notification[]> {
    if (!db) return [];
    
    // Build where conditions array
    const whereConditions = [eq(notifications.userId, userId)];
    
    if (options?.category) {
      whereConditions.push(eq(notifications.category, options.category));
    }
    
    if (options?.unreadOnly) {
      whereConditions.push(eq(notifications.isRead, false));
    }
    
    // Build the base query with all conditions and ordering
    const baseQuery = db.select().from(notifications)
      .where(whereConditions.length === 1 ? whereConditions[0] : and(...whereConditions))
      .orderBy(desc(notifications.createdAt)); // Order by most recent first
    
    // Apply limit and offset - build query step by step to satisfy TypeScript
    if (options?.limit && options?.offset) {
      return await baseQuery.limit(options.limit).offset(options.offset);
    } else if (options?.limit) {
      return await baseQuery.limit(options.limit);
    } else if (options?.offset) {
      // Offset without limit doesn't make much sense, but we'll apply a sensible limit
      return await baseQuery.limit(100).offset(options.offset);
    } else {
      return await baseQuery;
    }
  }
  
  async createNotification(insertNotification: InsertNotification): Promise<Notification> {
    if (!db) throw new Error("Database not available");
    const [notification] = await db
      .insert(notifications)
      .values(insertNotification)
      .returning();
    return notification;
  }
  
  async markNotificationAsRead(notificationId: number, userId: string): Promise<boolean> {
    if (!db) return false;
    try {
      const result = await db
        .update(notifications)
        .set({ isRead: true, readAt: new Date() })
        .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)))
        .returning();
      return result.length > 0;
    } catch (error) {
      console.error('Error marking notification as read:', error);
      return false;
    }
  }
  
  async markAllNotificationsAsRead(userId: string): Promise<boolean> {
    if (!db) return false;
    try {
      const result = await db
        .update(notifications)
        .set({ isRead: true, readAt: new Date() })
        .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)))
        .returning();
      return result.length > 0;
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      return false;
    }
  }
  
  async deleteNotification(notificationId: number, userId: string): Promise<boolean> {
    if (!db) return false;
    try {
      const result = await db
        .delete(notifications)
        .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)))
        .returning();
      return result.length > 0;
    } catch (error) {
      console.error('Error deleting notification:', error);
      return false;
    }
  }
  
  async getUnreadNotificationCount(userId: string): Promise<number> {
    if (!db) return 0;
    const result = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
    return result.length;
  }
  
  // User data cleanup
  async deleteUserData(userId: string): Promise<boolean> {
    if (!db) return false;
    
    try {
      // Delete all user-related data in the correct order (respecting foreign key constraints)
      
      // Delete bill split participants for user's bill splits first
      const userBillSplitIds = await db
        .select({ id: billSplits.id })
        .from(billSplits)
        .where(eq(billSplits.createdBy, userId));
      
      for (const billSplit of userBillSplitIds) {
        await db
          .delete(billSplitParticipants)
          .where(eq(billSplitParticipants.billSplitId, billSplit.id));
      }
      
      // Delete user's bill splits
      await db
        .delete(billSplits)
        .where(eq(billSplits.createdBy, userId));
      
      // Delete user's notifications
      await db
        .delete(notifications)
        .where(eq(notifications.userId, userId));
      
      // Delete user's expenses
      await db
        .delete(expenses)
        .where(eq(expenses.userId, userId));
      
      // Delete user's financial goals
      await db
        .delete(financialGoals)
        .where(eq(financialGoals.userId, userId));
      
      // Delete user's insurance risks
      await db
        .delete(insuranceRisks)
        .where(eq(insuranceRisks.userId, userId));
      
      // Delete user's credit scores
      await db
        .delete(creditScores)
        .where(eq(creditScores.userId, userId));
      
      // Delete user's bank connections
      await db
        .delete(bankConnections)
        .where(eq(bankConnections.userId, userId));
      
      // Finally delete the user record
      await db
        .delete(users)
        .where(eq(users.id, userId));
      
      return true;
    } catch (error) {
      console.error('Error deleting user data from database:', error);
      return false;
    }
  }
}

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
