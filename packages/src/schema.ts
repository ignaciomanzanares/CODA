import { sql } from "drizzle-orm";
import * as pgCore from "drizzle-orm/pg-core";
import * as sqliteCore from "drizzle-orm/sqlite-core";

// Producción (deploy/Render) = Postgres. Local = SQLite (poco uso).
const isProd = process.env.NODE_ENV === "production" || (!!process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith("postgres"));
const table = isProd ? pgCore.pgTable : sqliteCore.sqliteTable;
const text = isProd ? pgCore.text : sqliteCore.text;
const integer = isProd ? pgCore.integer : sqliteCore.integer;
const real = isProd ? pgCore.real : sqliteCore.real;
const serialOrInt = isProd
  ? pgCore.serial
  : (name: string) => sqliteCore.integer(name, { mode: "number" }).primaryKey({ autoIncrement: true });

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

// =============================================================================
// CODA EMPRESAS (misma BD, prefijo empresas_)
// =============================================================================

export const empresasCompanies = table('empresas_companies', {
  id: serialOrInt('id'),
  name: text('name').notNull(),
  rut: text('rut').notNull(),
  industry: text('industry'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const empresasUsers = table('empresas_users', {
  id: serialOrInt('id'),
  email: text('email').notNull(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const empresasMemberships = table('empresas_memberships', {
  id: serialOrInt('id'),
  userId: integer('user_id').notNull().references(() => empresasUsers.id),
  companyId: integer('company_id').notNull().references(() => empresasCompanies.id),
  role: text('role').notNull(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const empresasAuditLogs = table('empresas_audit_logs', {
  id: serialOrInt('id'),
  companyId: integer('company_id').notNull().references(() => empresasCompanies.id),
  userId: integer('user_id').references(() => empresasUsers.id),
  action: text('action').notNull(),
  entityType: text('entity_type'),
  entityId: integer('entity_id'),
  metadata: text('metadata'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const empresasBankAccounts = table('empresas_bank_accounts', {
  id: serialOrInt('id'),
  companyId: integer('company_id').notNull().references(() => empresasCompanies.id),
  bankName: text('bank_name').notNull(),
  accountNumber: text('account_number').notNull(),
  accountType: text('account_type'),
  currency: text('currency').default('CLP').notNull(),
  isActive: integer('is_active'),
  lastSyncAt: text('last_sync_at'),
  syncCursor: text('sync_cursor'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const empresasBankTransactions = table('empresas_bank_transactions', {
  id: serialOrInt('id'),
  companyId: integer('company_id').notNull().references(() => empresasCompanies.id),
  bankAccountId: integer('bank_account_id').notNull().references(() => empresasBankAccounts.id),
  externalId: text('external_id'),
  transactionDate: text('transaction_date').notNull(),
  postedDate: text('posted_date'),
  amount: real('amount').notNull(),
  currency: text('currency').default('CLP').notNull(),
  description: text('description'),
  counterpartyName: text('counterparty_name'),
  counterpartyRut: text('counterparty_rut'),
  reference: text('reference'),
  status: text('status'),
  category: text('category'),
  rawData: text('raw_data'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const empresasBankBalances = table('empresas_bank_balances', {
  id: serialOrInt('id'),
  bankAccountId: integer('bank_account_id').notNull().references(() => empresasBankAccounts.id),
  balanceDate: text('balance_date').notNull(),
  availableBalance: real('available_balance'),
  currentBalance: real('current_balance'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const empresasDteDocuments = table('empresas_dte_documents', {
  id: serialOrInt('id'),
  companyId: integer('company_id').notNull().references(() => empresasCompanies.id),
  documentType: text('document_type').notNull(),
  direction: text('direction').notNull(),
  folio: integer('folio').notNull(),
  emitterRut: text('emitter_rut').notNull(),
  emitterName: text('emitter_name'),
  receiverRut: text('receiver_rut').notNull(),
  receiverName: text('receiver_name'),
  issueDate: text('issue_date').notNull(),
  netAmount: real('net_amount').notNull(),
  vatAmount: real('vat_amount'),
  totalAmount: real('total_amount').notNull(),
  currency: text('currency').default('CLP').notNull(),
  status: text('status'),
  references: text('references'),
  rawPayload: text('raw_payload'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const empresasPurchaseOrders = table('empresas_purchase_orders', {
  id: serialOrInt('id'),
  companyId: integer('company_id').notNull().references(() => empresasCompanies.id),
  poNumber: text('po_number').notNull(),
  customerRut: text('customer_rut').notNull(),
  customerName: text('customer_name'),
  currency: text('currency').default('CLP').notNull(),
  totalAmount: real('total_amount').notNull(),
  invoicedAmount: real('invoiced_amount'),
  expectedInvoiceDate: text('expected_invoice_date'),
  status: text('status'),
  notes: text('notes'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const empresasReconciliationMatches = table('empresas_reconciliation_matches', {
  id: serialOrInt('id'),
  companyId: integer('company_id').notNull().references(() => empresasCompanies.id),
  bankTransactionId: integer('bank_transaction_id').notNull().references(() => empresasBankTransactions.id),
  dteDocumentId: integer('dte_document_id').references(() => empresasDteDocuments.id),
  matchScore: real('match_score'),
  matchType: text('match_type'),
  matchStatus: text('match_status'),
  matchedBy: integer('matched_by').references(() => empresasUsers.id),
  matchedAt: text('matched_at'),
  notes: text('notes'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const empresasReconciliationRules = table('empresas_reconciliation_rules', {
  id: serialOrInt('id'),
  companyId: integer('company_id').notNull().references(() => empresasCompanies.id),
  name: text('name').notNull(),
  priority: integer('priority'),
  conditions: text('conditions').notNull(),
  isActive: integer('is_active'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const empresasChartOfAccounts = table('empresas_chart_of_accounts', {
  id: serialOrInt('id'),
  companyId: integer('company_id').notNull().references(() => empresasCompanies.id),
  code: text('code').notNull(),
  name: text('name').notNull(),
  accountType: text('account_type').notNull(),
  parentId: integer('parent_id'),
  isActive: integer('is_active'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const empresasVendorCategoryMappings = table('empresas_vendor_category_mappings', {
  id: serialOrInt('id'),
  companyId: integer('company_id').notNull().references(() => empresasCompanies.id),
  vendorRut: text('vendor_rut'),
  category: text('category'),
  accountId: integer('account_id').notNull().references(() => empresasChartOfAccounts.id),
  classification: text('classification'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const empresasAccountingPeriods = table('empresas_accounting_periods', {
  id: serialOrInt('id'),
  companyId: integer('company_id').notNull().references(() => empresasCompanies.id),
  periodStart: text('period_start').notNull(),
  periodEnd: text('period_end').notNull(),
  status: text('status'),
  closedAt: text('closed_at'),
  closedBy: integer('closed_by').references(() => empresasUsers.id),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const empresasJournalEntries = table('empresas_journal_entries', {
  id: serialOrInt('id'),
  companyId: integer('company_id').notNull().references(() => empresasCompanies.id),
  periodId: integer('period_id').references(() => empresasAccountingPeriods.id),
  entryDate: text('entry_date').notNull(),
  description: text('description'),
  sourceType: text('source_type'),
  sourceId: integer('source_id'),
  isPosted: integer('is_posted'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const empresasJournalLines = table('empresas_journal_lines', {
  id: serialOrInt('id'),
  journalEntryId: integer('journal_entry_id').notNull().references(() => empresasJournalEntries.id),
  accountId: integer('account_id').notNull().references(() => empresasChartOfAccounts.id),
  debit: real('debit'),
  credit: real('credit'),
  description: text('description'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const empresasRiskScores = table('empresas_risk_scores', {
  id: serialOrInt('id'),
  companyId: integer('company_id').notNull().references(() => empresasCompanies.id),
  assessmentDate: text('assessment_date').notNull(),
  overallScore: real('overall_score'),
  rating: text('rating'),
  factors: text('factors').notNull(),
  redFlags: text('red_flags'),
  recommendations: text('recommendations'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const empresasRiskFactors = table('empresas_risk_factors', {
  id: serialOrInt('id'),
  name: text('name').notNull(),
  category: text('category').notNull(),
  weight: real('weight'),
  formula: text('formula'),
  thresholds: text('thresholds'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});