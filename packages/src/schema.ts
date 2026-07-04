import { sql } from "drizzle-orm";
import * as pgCore from "drizzle-orm/pg-core";
import * as sqliteCore from "drizzle-orm/sqlite-core";

// Producción (deploy/Render) = Postgres. Local = SQLite (poco uso).
const isProd = process.env.NODE_ENV === "production" || (!!process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith("postgres"));

// Sin mezclar tipos: cada dialecto usa sus tipos nativos. Cast solo para unión pg/sqlite en TS.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = (isProd ? pgCore.pgTable : sqliteCore.sqliteTable) as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const text = (isProd ? pgCore.text : sqliteCore.text) as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const integer = (isProd ? pgCore.integer : sqliteCore.integer) as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const real = (isProd ? pgCore.real : sqliteCore.real) as any;

// PK numérica: Postgres = serial("id").primaryKey(), SQLite = integer("id").primaryKey({ autoIncrement: true }).
// Misma definición para todas las tablas con id serial (bank_connections, consent_grants, accounts, etc.).
const serialPk = isProd
  ? (name: string) => pgCore.serial(name).primaryKey()
  : (name: string) => sqliteCore.integer(name, { mode: "number" }).primaryKey({ autoIncrement: true });

// --- Table Definitions ---
// users: PK text (id). bank_connections y consent_grants: PK serial/integer (id) — definición idéntica entre ellas.
export const users = table("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  displayName: text("display_name"),
  timezone: text("timezone").default("UTC"),
  language: text("language").default("English"),
  profilePicture: text("profile_picture"),
  userMetadata: text("user_metadata"),
  /** 0 = desactivado, 1 = activado (login con segundo factor). */
  twoFactorEnabled: integer("two_factor_enabled").notNull().default(0),
  /** JWT / producto: persona | empresa */
  role: text("role").notNull().default("persona"),
  /** TOTP (futuro); 0/1 */
  totpEnabled: integer("totp_enabled").notNull().default(0),
  totpSecret: text("totp_secret"),
  /** Códigos de respaldo (JSON o similar); mismo nombre que columna en Postgres */
  backupCodes: text("backup_codes"),
  /** Set on logout — any token with iat < this value is rejected (cross-device logout). */
  tokenInvalidatedAt: text("token_invalidated_at"),
  /** Onboarding KYC (mock por ahora): null | 'mock_completed'. Se pide una sola vez. */
  kycStatus: text("kyc_status"),
  /**
   * @deprecated Legacy: RUT chileno del titular EN TEXTO PLANO. Reemplazado por `rutHash`
   * (seudonimización, HMAC-SHA256 irreversible — ver services/crypto/identifierHashing.ts).
   * El código ya no lee ni escribe esta columna; se mantiene únicamente hasta que
   * `scripts/backfillRutHash.ts` confirme el backfill completo en producción, momento en el que
   * se agrega una migración para hacer DROP COLUMN y se borra este campo del schema.
   */
  rut: text("rut"),
  /** Hash HMAC-SHA256 (pepper RUT_HASH_PEPPER) del RUT del titular, normalizado. Se guarda al
   * primer upload de Informe CMF; uploads posteriores deben producir el mismo hash (binding de
   * identidad). Irreversible: no permite recuperar el RUT original. */
  rutHash: text("rut_hash"),
  /** 0/1 — flujo de primer ingreso (consentimiento + KYC + 2FA) finalizado. */
  onboardingCompleted: integer("onboarding_completed").notNull().default(0),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const bankConnections = table("bank_connections", {
  id: serialPk("id"),
  userId: text("user_id").notNull().references(() => users.id),
  bankName: text("bank_name").notNull(),
  accountType: text("account_type").notNull(),
  status: text("status").notNull().default("connected"),
  connectionData: text("connection_data"),
  lastUpdated: text("last_updated").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

/** Consentimientos SFA (RAR + Grant Management). Vinculados a userId; scope en authorization_details. */
export const consentGrants = table("consent_grants", {
  id: serialPk("id"),
  userId: text("user_id").notNull().references(() => users.id),
  status: text("status").notNull().default("pending"),
  authorizationDetails: text("authorization_details").notNull(),
  purpose: text("purpose").notNull(),
  policyVersion: text("policy_version").notNull(),
  externalGrantId: text("external_grant_id"),
  ipiId: text("ipi_id"),
  expiresAt: text("expires_at"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

/**
 * Registro auditable de consentimientos por finalidad (CMF / Ley 19.628), distinto del consentimiento SFA bancario.
 * Append-only: cada aceptación o revocación es un evento con versión de política, IP y user-agent.
 */
export const privacyConsentEvents = table("privacy_consent_events", {
  id: serialPk("id"),
  userId: text("user_id").notNull().references(() => users.id),
  purpose: text("purpose").notNull(),
  policyVersion: text("policy_version").notNull(),
  action: text("action").notNull(),
  channel: text("channel").notNull().default("web"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const accounts = table('accounts', {
  id: serialPk("id"),
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
  id: serialPk("id"),
  accountId: integer('account_id').notNull().references(() => accounts.id),
  asOf: text('as_of').default(sql`CURRENT_TIMESTAMP`).notNull(),
  current: real('current').notNull(),
  available: real('available'),
  creditLimit: real('credit_limit'),
  currency: text('currency'),
});

export const transactions = table('transactions', {
  id: serialPk("id"),
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
  // Trazabilidad de categorización (migración 022).
  categoryConfidence: real('category_confidence'),
  categoryRuleId: text('category_rule_id'),
  categorizerVersion: text('categorizer_version'),
  // Normalización de cartolas (migración 025).
  /** 1 = traspaso entre productos propios (pago de tarjeta, divisas). No es ingreso/gasto real. */
  isInternalTransfer: integer('is_internal_transfer').notNull().default(0),
  /** id del score_document_uploads que originó esta transacción (borrado en cascada). */
  sourceDocumentId: text('source_document_id'),
  /** Metadata moneda original (TC internacional USD): monto/moneda nativos + tasa + CLP. */
  originalAmount: real('original_amount'),
  originalCurrency: text('original_currency'),
  amountClp: real('amount_clp'),
  fxRate: real('fx_rate'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const creditScores = table('credit_scores', {
  id: serialPk("id"),
  // .unique(): una fila por usuario. Requerido para INSERT ... ON CONFLICT (user_id) en upsertCreditScore.
  // En Postgres el constraint ya existe vía migrations/0002_credit_scores_user_id_unique.sql;
  // declararlo aquí lo hace existir también en la BD SQLite de tests/dev (construida desde este schema).
  userId: text('user_id').notNull().references(() => users.id).unique(),
  score: integer('score').notNull(),
  maxScore: integer('max_score').notNull().default(850),
  paymentHistory: text('payment_history').notNull(),
  utilization: text('utilization').notNull(),
  ageOfCredit: text('age_of_credit').notNull(),
  lastUpdated: text('last_updated').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const creditScoreHistory = table('credit_score_history', {
  id: serialPk("id"),
  userId: text('user_id').notNull().references(() => users.id),
  score: integer('score').notNull(),
  maxScore: integer('max_score').notNull().default(850),
  calculatedAt: text('calculated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  factors: text('factors'),
});

export const insuranceRisks = table('insurance_risks', {
  id: serialPk("id"),
  userId: text('user_id').notNull().references(() => users.id),
  riskLevel: text('risk_level').notNull(),
  healthRisk: text('health_risk').notNull(),
  propertyRisk: text('property_risk').notNull(),
  autoRisk: text('auto_risk').notNull(),
  lastUpdated: text('last_updated').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

/** Score transaccional SFA por usuario (cartolas). Una fila por usuario; se actualiza en cada carga. */
export const transactionalScores = table('transactional_scores', {
  id: serialPk("id"),
  userId: text('user_id').notNull().references(() => users.id).unique(),
  transactionalScore: integer('transactional_score').notNull(),
  metrics: text('metrics'), // JSON: averageMonthlyBalanceClp, monthsWithAbonos, etc.
  mainInsights: text('main_insights'), // JSON array
  recommendedProducts: text('recommended_products'), // JSON array
  lastUpdated: text('last_updated').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const riskFactors = table('risk_factors', {
  id: serialPk("id"),
  userId: text('user_id').references(() => users.id),
  type: text('type').notNull(),
  value: text('value').notNull(),
  score: integer('score'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const financialGoals = table('financial_goals', {
  id: serialPk("id"),
  userId: text('user_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  targetAmount: integer('target_amount').notNull(),
  currentAmount: integer('current_amount').notNull().default(0),
  targetDate: text('target_date').notNull(),
  category: text('category').notNull(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const goalProgress = table('goal_progress', {
  id: serialPk("id"),
  goalId: integer('goal_id').notNull().references(() => financialGoals.id),
  userId: text('user_id').notNull().references(() => users.id),
  amount: integer('amount').notNull(),
  progressDate: text('progress_date').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const expenses = table('expenses', {
  id: serialPk("id"),
  userId: text('user_id').references(() => users.id).notNull(),
  name: text('name'),
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
  id: serialPk("id"),
  name: text('name').notNull().unique(),
  parentId: integer('parent_id'),
  description: text('description'),
});

export const billSplits = table('bill_splits', {
  id: serialPk("id"),
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
  id: serialPk("id"),
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
  id: serialPk("id"),
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
  // Eligibility criteria for matching algorithm
  minCreditScore: integer('min_credit_score'),
  maxCreditScore: integer('max_credit_score'),
  minIncome: integer('min_income'),
  maxDebtToIncome: real('max_debt_to_income'), // Max DTI ratio (e.g., 0.4 = 40%)
  // Monetization (pricing model from TAM/Pricing sheet)
  leadFee: integer('lead_fee'), // CLP per qualified lead
  successFeeBps: integer('success_fee_bps'), // Basis points on disbursed amount
  successFeeFlat: integer('success_fee_flat'), // Flat CPA (for cards, accounts)
  activationBonus: integer('activation_bonus'), // Bonus for activation (cards)
  // Performance metrics
  approvalRate: real('approval_rate'), // Historical approval rate (0.0-1.0)
  avgProcessingDays: integer('avg_processing_days'),
  // Matching algorithm weights (JSON: {creditScore: 0.4, income: 0.3, ...})
  matchingWeights: text('matching_weights'),
  // Product management
  isActive: integer('is_active').default(1),
  priority: integer('priority').default(50), // Higher = shown first (0-100)
  externalUrl: text('external_url'), // Link to institution's application page
  logoUrl: text('logo_url'),
  /** Clave natural estable del producto (slug), p.ej. "bancoe-cta-vista". Idempotencia del seed
   *  (scripts/seedProductCatalog.ts hace upsert por slug) y referencia legible desde el front. */
  slug: text('slug'),
  /** Texto legal de disclosure del producto (patrocinio/afiliación), mostrado en el marketplace. */
  disclosure: text('disclosure'),
  /** Procedencia: 'seed_verified' (catálogo verificado) | 'placeholder' (monetización por defaults
   *  de categoría, sin acuerdo comercial aún). Para el dashboard admin. */
  dataSource: text('data_source'),
  /** Fecha ISO de última verificación de los datos del producto (tasas/costos). */
  lastVerified: text('last_verified'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const productRecommendations = table('product_recommendations', {
  id: serialPk("id"),
  userId: text('user_id').notNull().references(() => users.id),
  productId: integer('product_id').notNull().references(() => financialProducts.id),
  recommendedAt: text('recommended_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  reason: text('reason'),
  status: text('status').default('pending'),
});

// Lead tracking: records all user interactions with products (views, clicks, applications)
export const leadTracking = table('lead_tracking', {
  id: serialPk("id"),
  userId: text('user_id').notNull().references(() => users.id),
  productId: integer('product_id').notNull().references(() => financialProducts.id),
  eventType: text('event_type').notNull(), // 'view' | 'click' | 'application' | 'approval' | 'rejection'
  matchScore: real('match_score'), // 0-100: how well the product matches user profile
  userCreditScore: integer('user_credit_score'), // Credit score at time of event
  userTransactionalScore: integer('user_transactional_score'), // Transactional score at time of event
  metadata: text('metadata'), // JSON: additional context (source page, filters applied, etc.)
  timestamp: text('timestamp').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Product applications: formal applications submitted by users
export const productApplications = table('product_applications', {
  id: serialPk("id"),
  userId: text('user_id').notNull().references(() => users.id),
  productId: integer('product_id').notNull().references(() => financialProducts.id),
  status: text('status').notNull().default('pending'), // pending | delivered | accepted | approved | rejected | expired | withdrawn
  applicationData: text('application_data'), // JSON: form data submitted
  externalApplicationId: text('external_application_id'), // ID from financial institution
  appliedAt: text('applied_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  respondedAt: text('responded_at'),
  revenueEarned: integer('revenue_earned'), // CLP earned from this application (lead fee + success fee)
  revenueType: text('revenue_type'), // 'lead_fee' | 'success_fee' | 'activation_bonus'
  notes: text('notes'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

/**
 * API keys de instituciones financieras para la API de leads (Fase 2). Cada key se asocia a un
 * `provider` (nombre de institución en financial_products.provider) y solo puede ver/responder los
 * leads de sus propios productos. Se guarda solo el HASH SHA-256 de la key (nunca la key en claro).
 */
export const institutionApiKeys = table('institution_api_keys', {
  id: serialPk("id"),
  /** Institución dueña de la key; matchea financial_products.provider. */
  provider: text('provider').notNull(),
  /** SHA-256 (hex) de la API key. La key en claro se muestra una sola vez al generarla. */
  keyHash: text('key_hash').notNull(),
  /** Etiqueta legible (p.ej. "Integración producción BancoEstado"). */
  label: text('label'),
  /** 0/1 — permite revocar sin borrar. */
  active: integer('active').notNull().default(1),
  lastUsedAt: text('last_used_at'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const notifications = table('notifications', {
  id: serialPk("id"),
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

export const pushSubscriptions = table('push_subscriptions', {
  id: serialPk("id"),
  userId: text('user_id').references(() => users.id).notNull(),
  endpoint: text('endpoint').notNull(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  userAgent: text('user_agent'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const auditLogs = table('audit_logs', {
  id: serialPk("id"),
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
  id: serialPk("id"),
  name: text('name').notNull(),
  rut: text('rut').notNull(),
  industry: text('industry'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const empresasUsers = table('empresas_users', {
  id: serialPk("id"),
  email: text('email').notNull(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const empresasMemberships = table('empresas_memberships', {
  id: serialPk("id"),
  userId: integer('user_id').notNull().references(() => empresasUsers.id),
  companyId: integer('company_id').notNull().references(() => empresasCompanies.id),
  role: text('role').notNull(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const empresasAuditLogs = table('empresas_audit_logs', {
  id: serialPk("id"),
  companyId: integer('company_id').notNull().references(() => empresasCompanies.id),
  userId: integer('user_id').references(() => empresasUsers.id),
  action: text('action').notNull(),
  entityType: text('entity_type'),
  entityId: integer('entity_id'),
  metadata: text('metadata'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const empresasBankAccounts = table('empresas_bank_accounts', {
  id: serialPk("id"),
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
  id: serialPk("id"),
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
  id: serialPk("id"),
  bankAccountId: integer('bank_account_id').notNull().references(() => empresasBankAccounts.id),
  balanceDate: text('balance_date').notNull(),
  availableBalance: real('available_balance'),
  currentBalance: real('current_balance'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const empresasDteDocuments = table('empresas_dte_documents', {
  id: serialPk("id"),
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
  id: serialPk("id"),
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
  dteDocumentId: integer('dte_document_id').references(() => empresasDteDocuments.id),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const empresasReconciliationMatches = table('empresas_reconciliation_matches', {
  id: serialPk("id"),
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
  id: serialPk("id"),
  companyId: integer('company_id').notNull().references(() => empresasCompanies.id),
  name: text('name').notNull(),
  priority: integer('priority'),
  conditions: text('conditions').notNull(),
  isActive: integer('is_active'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const empresasChartOfAccounts = table('empresas_chart_of_accounts', {
  id: serialPk("id"),
  companyId: integer('company_id').notNull().references(() => empresasCompanies.id),
  code: text('code').notNull(),
  name: text('name').notNull(),
  accountType: text('account_type').notNull(),
  parentId: integer('parent_id'),
  isActive: integer('is_active'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const empresasVendorCategoryMappings = table('empresas_vendor_category_mappings', {
  id: serialPk("id"),
  companyId: integer('company_id').notNull().references(() => empresasCompanies.id),
  vendorRut: text('vendor_rut'),
  category: text('category'),
  accountId: integer('account_id').notNull().references(() => empresasChartOfAccounts.id),
  classification: text('classification'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const empresasAccountingPeriods = table('empresas_accounting_periods', {
  id: serialPk("id"),
  companyId: integer('company_id').notNull().references(() => empresasCompanies.id),
  periodStart: text('period_start').notNull(),
  periodEnd: text('period_end').notNull(),
  status: text('status'),
  closedAt: text('closed_at'),
  closedBy: integer('closed_by').references(() => empresasUsers.id),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const empresasJournalEntries = table('empresas_journal_entries', {
  id: serialPk("id"),
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
  id: serialPk("id"),
  journalEntryId: integer('journal_entry_id').notNull().references(() => empresasJournalEntries.id),
  accountId: integer('account_id').notNull().references(() => empresasChartOfAccounts.id),
  debit: real('debit'),
  credit: real('credit'),
  description: text('description'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const empresasRiskScores = table('empresas_risk_scores', {
  id: serialPk("id"),
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
  id: serialPk("id"),
  name: text('name').notNull(),
  category: text('category').notNull(),
  weight: real('weight'),
  formula: text('formula'),
  thresholds: text('thresholds'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// --- Trazabilidad algorítmica (CMF / NCG 502): versiones de modelo + registro de predicciones ---
export const algorithmModelVersions = table('algorithm_model_versions', {
  id: text('id').primaryKey(),
  modelType: text('model_type').notNull(),
  version: text('version').notNull(),
  deployedAt: text('deployed_at').notNull(),
  deployedBy: text('deployed_by').notNull(),
  isActive: integer('is_active').notNull().default(0),
  changelog: text('changelog'),
  // Ciclo de vida del registro de modelo (Frente C: promover sin redeploy).
  // 'candidate' = entrenado/evaluado, no sirve tráfico. 'production' = el que carga
  // modelRegistry al boot. 'archived' = histórico. `isActive` se conserva por
  // compatibilidad; `lifecycle` es la fuente de verdad nueva.
  lifecycle: text('lifecycle').default('candidate'),
  /** URI del artefacto en el blob store (s3://… o pg://stored_blobs/<id>). Null = artefacto local en filesystem (legacy). */
  artifactUri: text('artifact_uri'),
  auc: real('auc'),
  /** sha256 del CSV de entrenamiento (reproducibilidad, #39). */
  datasetHash: text('dataset_hash'),
  /** Hash del set de features para detectar skew train/serving. */
  featureSetHash: text('feature_set_hash'),
  /** Porcentaje de tráfico asignado a esta versión para A/B testing (0-100). Default 100 = todo el tráfico. */
  abTrafficPct: real('ab_traffic_pct').default(100),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

/**
 * Almacén de blobs en Postgres — backend de fallback de `services/storage/blobStore.ts`
 * cuando no hay bucket S3/R2 configurado (`BLOB_BACKEND` != 's3'). Los bytes se guardan
 * cifrados (AES-256-GCM, base64) en `data`. Pensado para artefactos ML y documentos
 * originales con TTL; no para alto volumen. `expires_at` lo usa el job de retención (#21).
 */
export const storedBlobs = table('stored_blobs', {
  key: text('key').primaryKey(),
  contentType: text('content_type'),
  /** Bytes cifrados en base64 (fieldEncryption). */
  data: text('data').notNull(),
  sizeBytes: integer('size_bytes'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  /** ISO timestamp; null = sin expiración. El job de retención borra los vencidos. */
  expiresAt: text('expires_at'),
});

export const algorithmPredictionLogs = table('algorithm_prediction_logs', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  requestId: text('request_id').notNull(),
  /** credit_cmf | transactional_sfa | product_recommendation | product_interaction | product_application */
  kind: text('kind').notNull(),
  modelVersionId: text('model_version_id')
    .notNull()
    .references(() => algorithmModelVersions.id),
  modelVersion: text('model_version').notNull(),
  modelType: text('model_type').notNull(),
  inputFeatures: text('input_features').notNull(),
  outputSnapshot: text('output_snapshot').notNull(),
  cmfData: text('cmf_data'),
  sfaData: text('sfa_data'),
  topFactors: text('top_factors'),
  processingTimeMs: integer('processing_time_ms'),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

/** PDFs parseados (cartola, certificado CMF, liquidación). `parsed_data` = JSON serializado. */
export const documentUploads = table('document_uploads', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  tipo: text('tipo').notNull(),
  banco: text('banco'),
  periodoDesde: text('periodo_desde'),
  periodoHasta: text('periodo_hasta'),
  parsedData: text('parsed_data').notNull(),
  parseStatus: text('parse_status').default('success'),
  normalizationStatus: text('normalization_status'),
  /** Estado de revisión de la importación: 'not_required' | 'required' | 'reviewed'. */
  reviewStatus: text('review_status').notNull().default('not_required'),
  /** Razón interna de por qué se requiere revisión (p. ej. 'generic_parser', 'low_confidence'). */
  reviewReason: text('review_reason'),
  /** ISO timestamp de cuando el usuario marcó la importación como revisada. */
  reviewedAt: text('reviewed_at'),
  uploadedAt: text('uploaded_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

/** Documentos subidos al Score Dual (aislados del pipeline de movimientos/gastos). */
export const scoreDocumentUploads = table('score_document_uploads', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  sourceDocumentUploadId: text('source_document_upload_id').references(() => documentUploads.id),
  tipo: text('tipo').notNull(),
  banco: text('banco'),
  periodoDesde: text('periodo_desde'),
  periodoHasta: text('periodo_hasta'),
  parsedData: text('parsed_data').notNull(),
  parseStatus: text('parse_status').default('success'),
  uploadedAt: text('uploaded_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

/**
 * Originales (PDF/imagen) subidos, cifrados en el blob store con TTL (#21). Esta tabla solo
 * guarda la referencia (`blob_key`) y el vencimiento; los bytes viven en `stored_blobs` (o S3/R2)
 * cifrados. El job de retención borra los vencidos; el cierre de cuenta los borra de inmediato.
 */
export const documentOriginals = table('document_originals', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  blobKey: text('blob_key').notNull(),
  contentType: text('content_type'),
  sizeBytes: integer('size_bytes'),
  /** ISO timestamp; el job de retención borra cuando expira (TTL 30 días por defecto). */
  expiresAt: text('expires_at'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

/**
 * Resultado de cada intento de parseo de documento (#32): éxito/fallo, banco detectado, tier de
 * detección, confianza, conteo de transacciones y mensaje de error. Sirve para (a) dar feedback
 * claro al usuario y (b) detectar qué bancos/formatos fallan más y priorizar mejoras del parser.
 */
export const documentParseOutcomes = table('document_parse_outcomes', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  /** 'success' | 'failed' | 'partial' */
  status: text('status').notNull(),
  /** 'cartola' | 'cmf' | 'unknown' */
  documentType: text('document_type'),
  banco: text('banco'),
  detectionTier: text('detection_tier'),
  parseConfidence: real('parse_confidence'),
  transactionCount: integer('transaction_count'),
  errorMessage: text('error_message'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

/**
 * Correcciones de categoría hechas por el usuario (#31): cuando reclasifica un movimiento, se
 * guarda el texto normalizado + la categoría correcta. Alimenta el clasificador incremental
 * (Naive Bayes sobre estas filas) que mejora la categorización por sobre las reglas regex.
 */
export const transactionCategoryCorrections = table('transaction_category_corrections', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  /** Descripción/merchant normalizado (uppercase, sin ruido) — la "feature" de texto. */
  normalizedText: text('normalized_text').notNull(),
  originalCategory: text('original_category'),
  correctedCategory: text('corrected_category').notNull(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

/**
 * Snapshot de cada hábito recomendado al usuario (#34): guarda los ratios de salud financiera al
 * momento de recomendar, para luego medir efectividad comparando contra el siguiente ciclo
 * (¿bajó la deuda?, ¿subió el ahorro?, ¿se regularizó la mora?).
 */
export const habitRecommendationsLog = table('habit_recommendations_log', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  habitKey: text('habit_key').notNull(),
  nivel: integer('nivel'),
  deudaFlujo: real('deuda_flujo'),
  deudaActivos: real('deuda_activos'),
  ahorroIngreso: real('ahorro_ingreso'),
  diasMora: integer('dias_mora'),
  moraActiva: integer('mora_activa'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

/**
 * Pesos de ranking de productos por conversión real (#35). Cada corrida del job inserta una fila
 * por producto (no actualiza) → historial versionado y auditable: se puede ver cómo cambió el
 * peso de cada producto en el tiempo y con qué tasa de conversión se calculó.
 */
export const productRankingWeights = table('product_ranking_weights', {
  id: text('id').primaryKey(),
  productId: integer('product_id').notNull(),
  /** Multiplicador del rankingScore (acotado, p.ej. 0.5–1.5). 1.0 = neutro. */
  weight: real('weight').notNull(),
  /** Tasa de conversión global usada para calcular el peso (snapshot). */
  conversionRate: real('conversion_rate'),
  /** Identificador de la corrida (batch) — agrupa los pesos calculados juntos. */
  version: text('version').notNull(),
  computedAt: text('computed_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

/** Historial de scores combinados (transaccional 0–100 + crediticio 0–850) por cálculo. */
export const userScores = table('user_scores', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  scoreCrediticio: integer('score_crediticio'),
  scoreTransaccional: integer('score_transaccional'),
  categoria: text('categoria'),
  componentes: text('componentes'),
  insights: text('insights'),
  documentosUsados: text('documentos_usados'),
  calculadoAt: text('calculado_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  periodoAnalizadoDesde: text('periodo_analizado_desde'),
  periodoAnalizadoHasta: text('periodo_analizado_hasta'),
});

/** Activos declarados del usuario (propiedades, vehículos, cripto, inversiones). */
export const userAssets = table('user_assets', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  type: text('type').notNull(),
  name: text('name').notNull(),
  acquisitionCostClp: integer('acquisition_cost_clp').notNull(),
  estimatedValueClp: integer('estimated_value_clp'),
  hasLien: integer('has_lien').notNull().default(0),
  lienAmountClp: integer('lien_amount_clp'),
  currency: text('currency').notNull().default('CLP'),
  documentId: text('document_id'),
  notes: text('notes'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Jobs de OCR de inscripción (CBR escaneada). El OCR mupdf+tesseract tarda
// demasiado para correr sincrónico (~200s en Render free → timeout del request);
// solo las inscripciones SIN capa de texto lo disparan. El endpoint encola un job
// y responde 202; el worker en proceso lo completa fuera del ciclo del request.
// `result` guarda el payload del prefill como JSON en text — el esquema es dual
// SQLite/Postgres (no hay helper jsonb) y todo el JSON del proyecto se persiste así.
export const inscripcionJobs = table('inscripcion_jobs', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  status: text('status').notNull().default('processing'), // processing | done | error
  result: text('result'),  // JSON (payload del prefill) cuando status=done
  message: text('message'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

/** Memoria del asistente IA por usuario: resumen rolling de conversaciones pasadas. */
export const assistantSummaries = table('assistant_summaries', {
  userId: text('user_id').primaryKey().references(() => users.id),
  summary: text('summary').notNull(),
  exchangeCount: integer('exchange_count').notNull().default(0),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

/** Feedback del usuario sobre respuestas del asistente IA (thumbs up/down). */
export const assistantFeedback = table('assistant_feedback', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  rating: text('rating').notNull(), // 'up' | 'down'
  userMessage: text('user_message').notNull(),
  assistantMessage: text('assistant_message').notNull(),
  provider: text('provider'),
  comment: text('comment'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

/** Feedback del usuario sobre hábitos financieros recomendados (thumbs up/down), por `habitKey` estable del catálogo en `services/habits/habitCatalog.ts`. Un "down" reciente excluye ese hábito de futuras recomendaciones (feedback loop). */
export const habitFeedback = table('habit_feedback', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  habitKey: text('habit_key').notNull(),
  rating: text('rating').notNull(), // 'up' | 'down'
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

/**
 * Caché de indicadores económicos (UF, dólar) por fecha, en CLP.
 * Fuente: mindicador.cl. `id` = `${kind}:${date}` (date = ISO yyyy-mm-dd) para
 * evitar refetch. valueClp = valor en pesos de 1 unidad del indicador ese día.
 */
export const indicatorValues = table('indicator_values', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull(), // 'uf' | 'usd'
  date: text('date').notNull(), // ISO yyyy-mm-dd
  valueClp: real('value_clp').notNull(),
  fetchedAt: text('fetched_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

/** Diagnósticos de detección de banco (metadata de parseo — sin contenido del PDF ni transacciones). */
export const parserDiagnostics = table("parser_diagnostics", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id),
  timestamp: text("timestamp").default(sql`CURRENT_TIMESTAMP`).notNull(),
  detectedBank: text("detected_bank"),
  confidenceScore: real("confidence_score").notNull(),
  signalsEvaluated: text("signals_evaluated").notNull(), // JSON array of signal names
  tier: text("tier").notNull(), // HIGH | MEDIUM | LOW
  fileSize: integer("file_size"),
  pageCount: integer("page_count"),
  textLength: integer("text_length"),
  userAction: text("user_action"),  // accepted | rejected | pending | null
});


/** Eventos de conversión de productos financieros para función de pérdida CTR × tasa conversión. */
export const productConversionEvents = table("product_conversion_events", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  productId: text("product_id").notNull(),
  eventType: text("event_type").notNull(), // 'view' | 'click' | 'apply' | 'convert'
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
