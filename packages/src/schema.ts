import { sql } from "drizzle-orm";

// --- Environment-aware table factory ---
const isProd = process.env.NODE_ENV === 'production' || (process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith('postgres'));
let table: any, serialOrInt: any, text: any, integer: any, real: any;
if (isProd) {
  const pgCore = await import('drizzle-orm/pg-core');
  table = (pgCore as any).pgTable;
  serialOrInt = (pgCore as any).serial;
  text = (pgCore as any).text;
  integer = (pgCore as any).integer;
  real = (pgCore as any).real;
} else {
  const sqliteCore = await import('drizzle-orm/sqlite-core');
  table = (sqliteCore as any).sqliteTable;
  integer = (sqliteCore as any).integer;
  text = (sqliteCore as any).text;
  real = (sqliteCore as any).real;
  serialOrInt = (name: string) => (integer as any)(name, { mode: 'number' }).primaryKey({ autoIncrement: true });
}

// --- Table Definitions ---
export const users = table('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  firstName: text('first_name'),
  lastName: text('last_name'),
  displayName: text('display_name'),
  timezone: text('timezone').default('UTC'),
  language: text('language').default('English'),
  profilePicture: text('profile_picture'),
  userMetadata: text('user_metadata'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const bankConnections = table('bank_connections', {
  id: serialOrInt('id'),
  userId: text('user_id').notNull().references(() => users.id),
  bankName: text('bank_name').notNull(),
  accountType: text('account_type').notNull(),
  status: text('status').notNull().default('connected'),
  connectionData: text('connection_data'),
  lastUpdated: text('last_updated').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const accounts = table('accounts', {
  id: serialOrInt('id'),
  userId: text('user_id').notNull().references(() => users.id),
  bankConnectionId: integer('bank_connection_id').references(() => bankConnections.id),
  providerAccountId: text('provider_account_id'),
  name: text('name'),
  officialName: text('official_name'),
  type: text('type'),
  subtype: text('subtype'),
  currency: text('currency'),
  mask: text('mask'),
  status: text('status').default('active'),
  openedAt: text('opened_at'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const balances = table('balances', {
  id: serialOrInt('id'),
  accountId: integer('account_id').notNull().references(() => accounts.id),
  asOf: text('as_of').default(sql`CURRENT_TIMESTAMP`).notNull(),
  current: real('current').notNull(),
  available: real('available'),
  creditLimit: real('credit_limit'),
  currency: text('currency'),
});

export const transactions = table('transactions', {
  id: serialOrInt('id'),
  accountId: integer('account_id').notNull().references(() => accounts.id),
  externalId: text('external_id'),
  postedAt: text('posted_at').notNull(),
  description: text('description'),
  merchantName: text('merchant_name'),
  amount: real('amount').notNull(),
  currency: text('currency'),
  category: text('category'),
  subcategory: text('subcategory'),
  pending: integer('pending'),
  raw: text('raw'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const creditScores = table('credit_scores', {
  id: serialOrInt('id'),
  userId: text('user_id').notNull().references(() => users.id),
  score: integer('score').notNull(),
  maxScore: integer('max_score').notNull().default(850),
  paymentHistory: text('payment_history').notNull(),
  utilization: text('utilization').notNull(),
  ageOfCredit: text('age_of_credit').notNull(),
  lastUpdated: text('last_updated').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const creditScoreHistory = table('credit_score_history', {
  id: serialOrInt('id'),
  userId: text('user_id').notNull().references(() => users.id),
  score: integer('score').notNull(),
  maxScore: integer('max_score').notNull().default(850),
  calculatedAt: text('calculated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  factors: text('factors'),
});

export const insuranceRisks = table('insurance_risks', {
  id: serialOrInt('id'),
  userId: text('user_id').notNull().references(() => users.id),
  riskLevel: text('risk_level').notNull(),
  healthRisk: text('health_risk').notNull(),
  propertyRisk: text('property_risk').notNull(),
  autoRisk: text('auto_risk').notNull(),
  lastUpdated: text('last_updated').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const riskFactors = table('risk_factors', {
  id: serialOrInt('id'),
  userId: text('user_id').references(() => users.id),
  type: text('type').notNull(),
  value: text('value').notNull(),
  score: integer('score'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const financialGoals = table('financial_goals', {
  id: serialOrInt('id'),
  userId: text('user_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  targetAmount: integer('target_amount').notNull(),
  currentAmount: integer('current_amount').notNull().default(0),
  targetDate: text('target_date').notNull(),
  category: text('category').notNull(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const goalProgress = table('goal_progress', {
  id: serialOrInt('id'),
  goalId: integer('goal_id').notNull().references(() => financialGoals.id),
  userId: text('user_id').notNull().references(() => users.id),
  amount: integer('amount').notNull(),
  progressDate: text('progress_date').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const expenses = table('expenses', {
  id: serialOrInt('id'),
  userId: text('user_id').references(() => users.id).notNull(),
  amount: real('amount').notNull(),
  description: text('description').notNull(),
  category: text('category').notNull(),
  subcategory: text('subcategory'),
  merchantName: text('merchant_name'),
  date: text('date').notNull(),
  paymentMethod: text('payment_method'),
  isRecurring: integer('is_recurring'),
  tags: text('tags'),
  notes: text('notes'),
  isAutoClassified: integer('is_auto_classified'),
  confidence: real('confidence'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const expenseCategories = table('expense_categories', {
  id: serialOrInt('id'),
  name: text('name').notNull().unique(),
  parentId: integer('parent_id'),
  description: text('description'),
});

export const billSplits = table('bill_splits', {
  id: serialOrInt('id'),
  name: text('name').notNull(),
  totalAmount: real('total_amount').notNull(),
  description: text('description'),
  date: text('date').notNull(),
  createdBy: text('created_by').references(() => users.id).notNull(),
  status: text('status').default('active'),
  shareCode: text('share_code'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const billSplitParticipants = table('bill_split_participants', {
  id: serialOrInt('id'),
  billSplitId: integer('bill_split_id').references(() => billSplits.id).notNull(),
  userId: text('user_id').references(() => users.id),
  name: text('name').notNull(),
  email: text('email'),
  amountOwed: real('amount_owed').notNull(),
  amountPaid: real('amount_paid'),
  isPaid: integer('is_paid'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const financialProducts = table('financial_products', {
  id: serialOrInt('id'),
  productName: text('product_name').notNull(),
  provider: text('provider').notNull(),
  productType: text('product_type').notNull(),
  category: text('category').notNull(),
  interestRate: real('interest_rate'),
  term: integer('term'),
  termUnit: text('term_unit'),
  monthlyPayment: integer('monthly_payment'),
  loanAmount: integer('loan_amount'),
  description: text('description'),
  requirements: text('requirements'),
  features: text('features'),
});

export const productRecommendations = table('product_recommendations', {
  id: serialOrInt('id'),
  userId: text('user_id').notNull().references(() => users.id),
  productId: integer('product_id').notNull().references(() => financialProducts.id),
  recommendedAt: text('recommended_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  reason: text('reason'),
  status: text('status').default('pending'),
});

export const notifications = table('notifications', {
  id: serialOrInt('id'),
  userId: text('user_id').references(() => users.id).notNull(),
  title: text('title').notNull(),
  message: text('message').notNull(),
  type: text('type').notNull(),
  category: text('category').notNull(),
  isRead: integer('is_read'),
  actionUrl: text('action_url'),
  metadata: text('metadata'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  readAt: text('read_at'),
});

export const auditLogs = table('audit_logs', {
  id: serialOrInt('id'),
  userId: text('user_id').references(() => users.id),
  action: text('action').notNull(),
  entity: text('entity'),
  entityId: text('entity_id'),
  timestamp: text('timestamp').default(sql`CURRENT_TIMESTAMP`).notNull(),
  details: text('details'),
  ip: text('ip'),
});