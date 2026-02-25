import { db, users, bankConnections, accounts, balances, transactions, creditScores, transactionalScores, insuranceRisks, financialGoals, financialProducts, expenses, billSplits, billSplitParticipants, notifications, eq, and, inArray, isNull, desc } from "./db/index.js";
import { logger } from "./logger.js";
import type {
  User,
  InsertUser,
  BankConnection,
  InsertBankConnection,
  Account,
  InsertAccount,
  Balance,
  InsertBalance,
  Transaction,
  InsertTransaction,
  CreditScore,
  InsertCreditScore,
  InsuranceRisk,
  InsertInsuranceRisk,
  FinancialGoal,
  InsertFinancialGoal,
  FinancialProduct,
  InsertFinancialProduct,
  Notification,
  InsertNotification
} from "./schema";

export interface IStorage {
  // User operations
  getUser(id: string): Promise<any>;
  getUserByUsername(username: string): Promise<any>;
  getUserByEmail(email: string): Promise<any>;
  createUser(user: any): Promise<any>;
  updateUser(id: string, user: any): Promise<any>;
  // Bank connection operations
  getBankConnections(userId: string): Promise<any[]>;
  getBankConnection(id: number): Promise<any>;
  createBankConnection(connection: any): Promise<any>;
  updateBankConnection(id: number, connection: any): Promise<any>;
  deleteBankConnection(id: number): Promise<boolean>;
  // Accounts & transactions (Open Banking) operations
  getAccounts(userId: string): Promise<any[]>;
  getAccount(id: number): Promise<any>;
  createAccount(account: any): Promise<any>;
  updateAccount(id: number, account: any): Promise<any>;
  upsertBalance(balance: any): Promise<any>;
  getBalances(accountId: number): Promise<any[]>;
  createTransactionsBulk(transactions: any[]): Promise<any[]>;
  getTransactions(accountId: number, options?: { from?: Date; to?: Date; limit?: number; offset?: number }): Promise<any[]>;
  // Credit score operations
  getCreditScore(userId: string): Promise<any>;
  createCreditScore(creditScore: any): Promise<any>;
  updateCreditScore(userId: string, creditScore: any): Promise<any>;
  // Transactional score (cartolas)
  getTransactionalScore(userId: string): Promise<any>;
  upsertTransactionalScore(userId: string, data: { transactionalScore: number; metrics?: object; mainInsights?: string[]; recommendedProducts?: string[] }): Promise<any>;
  // Insurance risk operations
  getInsuranceRisk(userId: string): Promise<any>;
  createInsuranceRisk(insuranceRisk: any): Promise<any>;
  updateInsuranceRisk(userId: string, insuranceRisk: any): Promise<any>;
  // Financial goal operations
  getFinancialGoals(userId: string): Promise<any[]>;
  getFinancialGoal(id: number): Promise<any>;
  createFinancialGoal(goal: any): Promise<any>;
  updateFinancialGoal(id: number, goal: any): Promise<any>;
  deleteFinancialGoal(id: number): Promise<boolean>;
  // Financial product operations
  getFinancialProducts(category?: string): Promise<any[]>;
  getFinancialProduct(id: number): Promise<any>;
  createFinancialProduct(product: any): Promise<any>;
  // Expense operations
  getExpenses(userId: string): Promise<any[]>;
  createExpense(expense: any): Promise<any>;
  getExpense(id: number): Promise<any>;
  updateExpense(id: number, updateData: any): Promise<any>;
  deleteExpense(id: number): Promise<boolean>;

  // Bill split operations
  getBillSplitByShareCode(code: string): Promise<any | undefined>;
  getBillSplitParticipants(billSplitId: number): Promise<any[]>;
  updateBillSplitParticipant(id: number, updateData: any): Promise<any>;
  getBillSplits(userId: string): Promise<any[]>;
  getBillSplitsAsParticipant(userId: string): Promise<any[]>;
  createBillSplit(data: any): Promise<any>;
  createBillSplitParticipant(data: any): Promise<any>;
  getBillSplit(id: number): Promise<any>;
  updateBillSplit(id: number, updateData: any): Promise<any>;
  deleteBillSplit(id: number): Promise<boolean>;
  getUnlinkedParticipantsByEmail(email: string): Promise<any[]>;

  // Notification operations
  getNotifications(userId: string, options?: { limit?: number; offset?: number; category?: string; unreadOnly?: boolean }): Promise<any[]>;
  createNotification(insertNotification: any): Promise<any>;
  markNotificationAsRead(notificationId: number, userId: string): Promise<boolean>;
  markAllNotificationsAsRead(userId: string): Promise<boolean>;
  deleteNotification(notificationId: number, userId: string): Promise<boolean>;
  getUnreadNotificationCount(userId: string): Promise<number>;

  // User cleanup
  deleteUserData(userId: string): Promise<boolean>;

}

// Minimal placeholder storage to satisfy the interface and keep the project compiling.
// Replace with a real implementation (DatabaseStorage or MemStorage) when ready.
// (placeholder removed) storage is provided by DatabaseStorage below

export class DatabaseStorage implements IStorage {
  // In-memory maps used by some helper methods (kept for compatibility).
  private users = new Map<string, any>();
  private bankConnections = new Map<number, any>();
  private accounts = new Map<number, any>();
  private balances = new Map<number, any>();
  private transactions = new Map<number, any>();
  private creditScores = new Map<number, any>();
  private insuranceRisks = new Map<number, any>();
  private financialGoals = new Map<number, any>();
  private financialProducts = new Map<number, any>();
  private expenses = new Map<number, any>();
  private billSplits = new Map<number, any>();
  private billSplitParticipants = new Map<number, any>();
  private notifications = new Map<number, any>();

  private currentFinancialGoalId = 1;
  private currentFinancialProductId = 1;
  private currentNotificationId = 1;
  private currentExpenseId = 1;
  private currentBillSplitId = 1;
  private currentBillSplitParticipantId = 1;

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

    try {
      const [user] = await db.insert(users).values(userWithId).returning();
      return user;
    } catch (err: any) {
      // Handle concurrent insert race: Postgres unique_violation code is '23505'
      // SQLite unique constraint uses 'SQLITE_CONSTRAINT_UNIQUE' and message contains 'UNIQUE constraint failed'
      const isUniqueViolation = err && (err.code === '23505' || err.code === 'SQLITE_CONSTRAINT_UNIQUE' || String(err.message).includes('UNIQUE constraint failed'));
      if (isUniqueViolation) {
        // Try to fetch existing user by id or email
        let existing: any = null;
        if (userWithId.id) {
          const rows = await db.select().from(users).where(eq(users.id, userWithId.id));
          existing = rows && rows.length ? rows[0] : null;
        }
        if (!existing && userWithId.email) {
          const rows = await db.select().from(users).where(eq(users.email, userWithId.email));
          existing = rows && rows.length ? rows[0] : null;
        }
        if (existing) return existing;
      }
      throw err;
    }
  }

  async updateUser(id: string, updateData: Partial<InsertUser>): Promise<User | undefined> {
    if (!db) {
      return undefined;
    }
    
    const [updatedUser] = await db
      .update(users)
      .set({
        ...updateData,
        updatedAt: new Date().toISOString()
      })
      .where(eq(users.id, id))
      .returning();
    return updatedUser || undefined;
  }
  
  // Bank connection methods
  async getBankConnections(userId: string): Promise<BankConnection[]> {
    return Array.from(this.bankConnections.values()).filter(
      (connection) => connection.userId === userId,
    );
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
        lastUpdated: new Date().toISOString()
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
    const [acc] = await db.update(accounts).set({ ...account, updatedAt: new Date().toISOString() }).where(eq(accounts.id, id)).returning();
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
      result = result.filter((tx: any) => new Date(tx.postedAt) >= options.from!);
    }
    if (options?.to) {
      result = result.filter((tx: any) => new Date(tx.postedAt) <= options.to!);
    }
    // Sort ascending by postedAt
    result.sort((a: any, b: any) => new Date(a.postedAt).getTime() - new Date(b.postedAt).getTime());
    if (options?.offset) result = result.slice(options.offset);
    if (options?.limit) result = result.slice(0, options.limit);
    return result;
  }

  // Credit score operations
  async getCreditScore(userId: string): Promise<CreditScore | undefined> {
    if (!db) return undefined;
    const userIdStr = String(userId);
    const [creditScore] = await db
      .select()
      .from(creditScores)
      .where(eq(creditScores.userId, userIdStr));
    return creditScore || undefined;
  }
  
  async createCreditScore(insertCreditScore: InsertCreditScore): Promise<CreditScore> {
    if (!db) throw new Error("Database not available");
    const payload = { ...insertCreditScore, userId: String(insertCreditScore.userId) };
    logger.info(
      { payload, userId: payload.userId, score: payload.score, table: 'credit_scores', op: 'INSERT' },
      '[storage] credit_scores INSERT (valores exactos enviados a DB)'
    );
    try {
      const [creditScore] = await db
        .insert(creditScores)
        .values(payload)
        .returning();
      return creditScore;
    } catch (err: unknown) {
      const e = err as { message?: string; code?: string; detail?: string };
      logger.error(
        { err, message: e?.message, code: e?.code, detail: e?.detail, payload },
        '[storage] credit_scores INSERT falló (revisar tipos/permisos/constraints)'
      );
      throw err;
    }
  }

  async updateCreditScore(userId: string, creditScore: Partial<InsertCreditScore>): Promise<CreditScore | undefined> {
    if (!db) return undefined;
    const userIdStr = String(userId);
    const setPayload = {
      ...creditScore,
      lastUpdated: new Date().toISOString()
    };
    logger.info(
      { userId: userIdStr, setPayload, table: 'credit_scores', op: 'UPDATE' },
      '[storage] credit_scores UPDATE (valores exactos enviados a DB)'
    );
    try {
      const [updatedScore] = await db
        .update(creditScores)
        .set(setPayload)
        .where(eq(creditScores.userId, userIdStr))
        .returning();
      return updatedScore || undefined;
    } catch (err: unknown) {
      const e = err as { message?: string; code?: string; detail?: string };
      logger.error(
        { err, message: e?.message, code: e?.code, detail: e?.detail, userId: userIdStr, setPayload },
        '[storage] credit_scores UPDATE falló (revisar tipos/permisos/constraints)'
      );
      throw err;
    }
  }

  async getTransactionalScore(userId: string): Promise<any> {
    if (!db) return undefined;
    const [row] = await db
      .select()
      .from(transactionalScores)
      .where(eq(transactionalScores.userId, userId));
    if (!row) return undefined;
    return {
      transactionalScore: row.transactionalScore,
      metrics: row.metrics ? JSON.parse(row.metrics) : undefined,
      mainInsights: row.mainInsights ? JSON.parse(row.mainInsights) : undefined,
      recommendedProducts: row.recommendedProducts ? JSON.parse(row.recommendedProducts) : undefined,
      lastUpdated: row.lastUpdated,
    };
  }

  async upsertTransactionalScore(
    userId: string,
    data: { transactionalScore: number; metrics?: object; mainInsights?: string[]; recommendedProducts?: string[] }
  ): Promise<any> {
    if (!db) return undefined;
    const existing = await db.select().from(transactionalScores).where(eq(transactionalScores.userId, userId));
    const payload = {
      userId,
      transactionalScore: data.transactionalScore,
      metrics: data.metrics != null ? JSON.stringify(data.metrics) : null,
      mainInsights: data.mainInsights != null ? JSON.stringify(data.mainInsights) : null,
      recommendedProducts: data.recommendedProducts != null ? JSON.stringify(data.recommendedProducts) : null,
      lastUpdated: new Date().toISOString(),
    };
    if (existing.length > 0) {
      const [updated] = await db
        .update(transactionalScores)
        .set(payload)
        .where(eq(transactionalScores.userId, userId))
        .returning();
      return updated;
    }
    const [inserted] = await db.insert(transactionalScores).values(payload).returning();
    return inserted;
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
        lastUpdated: new Date().toISOString()
      })
      .where(eq(insuranceRisks.userId, userId))
      .returning();
    return updatedRisk || undefined;
  }
  
  // Financial goal methods
  async getFinancialGoals(userId: string): Promise<any[]> {
    return Array.from(this.financialGoals.values()).filter(
      (goal: any) => goal.userId === userId,
    );
  }
  async getFinancialGoal(id: number): Promise<any | undefined> {
    return this.financialGoals.get(id);
  }
  async createFinancialGoal(insertGoal: any): Promise<any> {
    const id = this.currentFinancialGoalId++;
    const now = new Date().toISOString();
    const goal: any = {
      ...insertGoal,
      id,
      createdAt: now,
      currentAmount: insertGoal.currentAmount ?? 0,
    };
    this.financialGoals.set(id, goal);
    return goal;
  }
  async updateFinancialGoal(id: number, goal: any): Promise<any | undefined> {
    const existingGoal = this.financialGoals.get(id);
    if (!existingGoal) return undefined;
    const updatedGoal: any = {
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
  async getFinancialProducts(category?: string): Promise<any[]> {
    const products = Array.from(this.financialProducts.values());
    if (category) {
      return products.filter((product: any) => product.category === category);
    }
    return products;
  }
  async getFinancialProduct(id: number): Promise<any | undefined> {
    return this.financialProducts.get(id);
  }
  async createFinancialProduct(insertProduct: any): Promise<any> {
    const id = this.currentFinancialProductId++;
    const product: any = {
      ...insertProduct,
      id,
      requirements: insertProduct.requirements ?? null,
      features: insertProduct.features ?? null,
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
      const insertObj: any = { ...product };
      if ('requirements' in product) {
        insertObj.requirements = product.requirements ? JSON.stringify(product.requirements) : null;
      }
      if ('features' in product) {
        insertObj.features = product.features ? JSON.stringify(product.features) : null;
      }
      this.createFinancialProduct(insertObj);
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
      const insertObj: any = { ...product };
      if ('requirements' in product) {
        insertObj.requirements = product.requirements ? JSON.stringify(product.requirements) : null;
      }
      if ('features' in product) {
        insertObj.features = product.features ? JSON.stringify(product.features) : null;
      }
      this.createFinancialProduct(insertObj);
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
      const insertObj: any = { ...product };
      if ('requirements' in product) {
        insertObj.requirements = product.requirements ? JSON.stringify(product.requirements) : null;
      }
      if ('features' in product) {
        insertObj.features = product.features ? JSON.stringify(product.features) : null;
      }
      this.createFinancialProduct(insertObj);
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
      const insertObj: any = { ...product };
      if ('requirements' in product) {
        insertObj.requirements = product.requirements ? JSON.stringify(product.requirements) : null;
      }
      if ('features' in product) {
        insertObj.features = product.features ? JSON.stringify(product.features) : null;
      }
      this.createFinancialProduct(insertObj);
    });
  }

  // Notification operations
  async getNotifications(userId: string, options?: { limit?: number; offset?: number; category?: string; unreadOnly?: boolean }): Promise<any[]> {
    let notifications = Array.from(this.notifications.values()).filter((notification: any) => notification.userId === userId);
    
    if (options?.category) {
      notifications = notifications.filter((notification: any) => notification.category === options.category);
    }
    
    if (options?.unreadOnly) {
      notifications = notifications.filter((notification: any) => !notification.isRead);
    }
    
    notifications.sort((a: any, b: any) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
    
    if (options?.offset) {
      notifications = notifications.slice(options.offset);
    }
    
    if (options?.limit) {
      notifications = notifications.slice(0, options.limit);
    }
    
    return notifications;
  }
  
  async createNotification(insertNotification: any): Promise<any> {
    const notification: any = {
      id: this.currentNotificationId++,
      ...insertNotification,
      createdAt: new Date().toISOString(),
      readAt: null,
      metadata: insertNotification.metadata ?? null,
      isRead: insertNotification.isRead ?? false,
      actionUrl: insertNotification.actionUrl ?? null,
    };
    this.notifications.set(notification.id, notification);
    return notification;
  }
  
  async markNotificationAsRead(notificationId: number, userId: string): Promise<boolean> {
    const notification: any = this.notifications.get(notificationId);
    if (!notification || notification.userId !== userId) {
      return false;
    }
    
    notification.isRead = true;
    notification.readAt = new Date().toISOString();
    this.notifications.set(notificationId, notification);
    return true;
  }
  
  async markAllNotificationsAsRead(userId: string): Promise<boolean> {
    const userNotifications = Array.from(this.notifications.values()).filter(
      (notification: any) => notification.userId === userId && !notification.isRead
    );
    
    const now = new Date().toISOString();
    userNotifications.forEach((notification: any) => {
      notification.isRead = true;
      notification.readAt = now;
      this.notifications.set(notification.id, notification);
    });
    
    return userNotifications.length > 0;
  }
  
  async deleteNotification(notificationId: number, userId: string): Promise<boolean> {
    const notification: any = this.notifications.get(notificationId);
    if (!notification || notification.userId !== userId) {
      return false;
    }
    
    return this.notifications.delete(notificationId);
  }
  
  async getUnreadNotificationCount(userId: string): Promise<number> {
    return Array.from(this.notifications.values())
      .filter((notification: any) => notification.userId === userId && !notification.isRead)
      .length;
  }

  // Expense implementations (DB if available, otherwise in-memory)
  async getExpenses(userId: string): Promise<any[]> {
    if (db) return await db.select().from(expenses).where(eq(expenses.userId, userId));
    return Array.from(this.expenses.values()).filter((e: any) => e.userId === userId);
  }

  async createExpense(expenseData: any): Promise<any> {
    if (db) {
      const toInsert: any = { ...expenseData };
      // Coerce boolean flags to integers expected by the DB schema
      if (typeof toInsert.isRecurring === 'boolean') toInsert.isRecurring = toInsert.isRecurring ? 1 : 0;
      if (typeof toInsert.isAutoClassified === 'boolean') toInsert.isAutoClassified = toInsert.isAutoClassified ? 1 : 0;
      // Ensure numeric amount
      if (typeof toInsert.amount === 'string') toInsert.amount = parseFloat(toInsert.amount);

      const [exp] = await db.insert(expenses).values(toInsert).returning();
      return exp;
    }
    const id = this.currentExpenseId++;
    const now = new Date().toISOString();
    const exp = { id, ...expenseData, createdAt: now };
    this.expenses.set(id, exp);
    return exp;
  }

  async getExpense(id: number): Promise<any | undefined> {
    if (db) {
      const [exp] = await db.select().from(expenses).where(eq(expenses.id, id));
      return exp || undefined;
    }
    return this.expenses.get(id);
  }

  async updateExpense(id: number, updateData: any): Promise<any | undefined> {
    if (db) {
      const toUpdate: any = { ...updateData };
      if (typeof toUpdate.isRecurring === 'boolean') toUpdate.isRecurring = toUpdate.isRecurring ? 1 : 0;
      if (typeof toUpdate.isAutoClassified === 'boolean') toUpdate.isAutoClassified = toUpdate.isAutoClassified ? 1 : 0;
      if (typeof toUpdate.amount === 'string') toUpdate.amount = parseFloat(toUpdate.amount);
      const [exp] = await db.update(expenses).set({ ...toUpdate }).where(eq(expenses.id, id)).returning();
      return exp || undefined;
    }
    const existing = this.expenses.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...updateData };
    this.expenses.set(id, updated);
    return updated;
  }

  async deleteExpense(id: number): Promise<boolean> {
    if (db) {
      await db.delete(expenses).where(eq(expenses.id, id));
      return true;
    }
    return this.expenses.delete(id);
  }

  // Bill split implementations (minimal, in-memory if no DB)
  async getBillSplitByShareCode(code: string): Promise<any | undefined> {
    if (db) {
      const [bs] = await db.select().from(billSplits).where(eq(billSplits.shareCode, code));
      return bs || undefined;
    }
    return Array.from(this.billSplits.values()).find(b => b.shareCode === code);
  }

  async getBillSplitParticipants(billSplitId: number): Promise<any[]> {
    if (db) {
      const rows = await db.select().from(billSplitParticipants).where(eq(billSplitParticipants.billSplitId, billSplitId));
      return rows.map((r: any) => ({
        ...r,
        isPaid: !!r.isPaid,
        amountPaid: r.amountPaid ? Number(r.amountPaid) : 0,
        amountOwed: r.amountOwed ? Number(r.amountOwed) : 0,
      }));
    }
    return Array.from(this.billSplitParticipants.values()).filter(p => p.billSplitId === billSplitId);
  }

  async updateBillSplitParticipant(id: number, updateData: any): Promise<any | undefined> {
    if (db) {
      const toUpdate: any = { ...updateData };
      if (typeof toUpdate.amountOwed === 'string') toUpdate.amountOwed = parseFloat(toUpdate.amountOwed);
      if (typeof toUpdate.amountPaid === 'string') toUpdate.amountPaid = parseFloat(toUpdate.amountPaid);
      if (typeof toUpdate.isPaid === 'boolean') toUpdate.isPaid = toUpdate.isPaid ? 1 : 0;
      const [p] = await db.update(billSplitParticipants).set(toUpdate).where(eq(billSplitParticipants.id, id)).returning();
      if (p) {
        p.isPaid = !!p.isPaid;
        p.amountPaid = p.amountPaid ? Number(p.amountPaid) : 0;
        p.amountOwed = p.amountOwed ? Number(p.amountOwed) : 0;
      }
      return p || undefined;
    }
    const existing = this.billSplitParticipants.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...updateData };
    this.billSplitParticipants.set(id, updated);
    return updated;
  }

  async getBillSplits(userId: string): Promise<any[]> {
    if (db) return await db.select().from(billSplits).where(eq(billSplits.createdBy, userId));
    return Array.from(this.billSplits.values()).filter(b => b.createdBy === userId);
  }

  async getBillSplitsAsParticipant(userId: string): Promise<any[]> {
    if (db) {
      // Get participant records for this user
      const participantRecords = await db.select().from(billSplitParticipants).where(eq(billSplitParticipants.userId, userId));
      
      // Get the unique bill split IDs
      const billSplitIds = [...new Set(participantRecords.map((p: any) => p.billSplitId))];
      
      if (billSplitIds.length === 0) {
        return [];
      }
      
      // Fetch the actual bill splits
      const splits = await db.select().from(billSplits).where(inArray(billSplits.id, billSplitIds));
      return splits;
    }
    // In-memory fallback: get participant records and then fetch corresponding bill splits
    const participantRecords = Array.from(this.billSplitParticipants.values()).filter((p: any) => p.userId === userId);
    const billSplitIds = [...new Set(participantRecords.map((p: any) => p.billSplitId))];
    return Array.from(this.billSplits.values()).filter((b: any) => billSplitIds.includes(b.id));
  }

  async createBillSplit(data: any): Promise<any> {
    if (db) {
      const toInsert: any = { ...data };
      // Coerce date to ISO string when Date instance provided
      if (toInsert.date instanceof Date) toInsert.date = toInsert.date.toISOString();
      if (typeof toInsert.date === 'string') {
        // leave as-is
      }
      // Ensure numeric totalAmount
      if (typeof toInsert.totalAmount === 'string') toInsert.totalAmount = parseFloat(toInsert.totalAmount);
      let [bs] = await db.insert(billSplits).values(toInsert).returning();
      // Some SQLite drivers may not return the inserted row; fall back to selecting the most recent matching row
      if ((!bs || !bs.id) && toInsert.createdBy) {
        const rows = await db.select().from(billSplits).where(eq(billSplits.createdBy, toInsert.createdBy));
        if (rows && rows.length) {
          rows.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          bs = rows[0];
        }
      }
      return bs;
    }
    const id = this.currentBillSplitId++;
    const now = new Date().toISOString();
    const bs = { id, ...data, createdAt: now };
    this.billSplits.set(id, bs);
    return bs;
  }

  async createBillSplitParticipant(data: any): Promise<any> {
    if (db) {
      const toInsert: any = { ...data };
      // Coerce numeric and boolean fields
      if (typeof toInsert.amountOwed === 'string') toInsert.amountOwed = parseFloat(toInsert.amountOwed);
      if (typeof toInsert.amountPaid === 'string') toInsert.amountPaid = parseFloat(toInsert.amountPaid);
      if (typeof toInsert.isPaid === 'boolean') toInsert.isPaid = toInsert.isPaid ? 1 : 0;
      // Ensure billSplitId is numeric
      if (typeof toInsert.billSplitId === 'string') toInsert.billSplitId = parseInt(toInsert.billSplitId as any);
      const [p] = await db.insert(billSplitParticipants).values(toInsert).returning();
      // If insert didn't return the row (SQLite fallback), try selecting by billSplitId and email/name
      let participant = p;
      if ((!participant || !participant.id) && toInsert.billSplitId) {
        const candidates = await db.select().from(billSplitParticipants).where(eq(billSplitParticipants.billSplitId, toInsert.billSplitId));
        if (candidates && candidates.length) {
          participant = candidates.find((c: any) => (toInsert.email && c.email === toInsert.email) || (toInsert.name && c.name === toInsert.name)) || candidates[0];
        }
      }
      // Normalize returned participant fields for consistent API responses
      const resp = participant || p;
      if (resp) {
        resp.isPaid = !!resp.isPaid;
        resp.amountPaid = resp.amountPaid ? Number(resp.amountPaid) : 0;
        resp.amountOwed = resp.amountOwed ? Number(resp.amountOwed) : 0;
      }
      return resp;
    }
    const id = this.currentBillSplitParticipantId++;
    const p = { id, ...data, createdAt: new Date().toISOString() };
    this.billSplitParticipants.set(id, p);
    return p;
  }

  async getBillSplit(id: number): Promise<any | undefined> {
    if (db) {
      const [bs] = await db.select().from(billSplits).where(eq(billSplits.id, id));
      return bs || undefined;
    }
    return this.billSplits.get(id);
  }

  async updateBillSplit(id: number, updateData: any): Promise<any | undefined> {
    if (db) {
      const toUpdate: any = { ...updateData };
      if (toUpdate.date instanceof Date) toUpdate.date = toUpdate.date.toISOString();
      if (typeof toUpdate.totalAmount === 'string') toUpdate.totalAmount = parseFloat(toUpdate.totalAmount);
      const [bs] = await db.update(billSplits).set(toUpdate).where(eq(billSplits.id, id)).returning();
      return bs || undefined;
    }
    const existing = this.billSplits.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...updateData };
    this.billSplits.set(id, updated);
    return updated;
  }

  async deleteBillSplit(id: number): Promise<boolean> {
    if (db) {
      await db.delete(billSplitParticipants).where(eq(billSplitParticipants.billSplitId, id));
      await db.delete(billSplits).where(eq(billSplits.id, id));
      return true;
    }
    // remove participants
    Array.from(this.billSplitParticipants.entries()).forEach(([pid, p]) => {
      if (p.billSplitId === id) this.billSplitParticipants.delete(pid);
    });
    return this.billSplits.delete(id);
  }

  async getUnlinkedParticipantsByEmail(email: string): Promise<any[]> {
    if (db) return await db.select().from(billSplitParticipants).where(eq(billSplitParticipants.email, email)).where(isNull(billSplitParticipants.userId));
    return Array.from(this.billSplitParticipants.values()).filter(p => p.email && p.email.toLowerCase() === email.toLowerCase() && !p.userId);
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
      logger.error({ err: error }, 'Error deleting user data');
      return false;
    }
  }
}

export const MemStorage = DatabaseStorage;

// Export a storage instance. In production this will still use the same
// implementation, but the informational SQLite log above is suppressed.
export const storage: IStorage = new DatabaseStorage();
