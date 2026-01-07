You are a senior full stack engineer + solution architect building a personal finance and credit-risk web app for Chilean individual users. The app must provide real-time credit score monitoring with ML-powered analysis, insurance risk assessment, expense tracking with AI-powered categorization, financial goal tracking, bank account integration via Open Banking, bill splitting for group expenses, and personalized financial product recommendations.

GOAL
Build an MVP that works end-to-end with mock connectors first, then real connectors. Deliver a clean, modular codebase that can scale. Prioritize correctness, user privacy, security, and an excellent UX.

TECH STACK
- Backend: Node.js (TypeScript) + Express.js
- Frontend: React 18 + Vite + TanStack Query
- Database: PostgreSQL with Drizzle ORM
- Auth: Simple JWT authentication (self-contained)
- ML: XGBoost models with ONNX Runtime for PD scoring
- UI: Radix UI + shadcn/ui + Tailwind CSS

CORE MODULES (monorepo structure)

1) Identity & Access Control
- Single-tenant per user (one user = one account)
- Simple JWT authentication with jsonwebtoken
- Secure session management with token blacklist
- Audit logging for sensitive operations

2) Data Ingestion Layer (Connectors)
A) Open Banking Connector
- Data: accounts, balances, transactions from Chilean banks
- Normalize to internal schema
- Support incremental sync and full refresh
- Handle duplicates, reversals, pagination

B) Bank Integration
- Secure connection to multiple financial institutions
- Real-time balance and transaction syncing
- Transaction categorization and merchant identification

3) Financial Analysis Engine
A) Credit Score Monitoring
- Real-time ML-powered credit analysis using XGBoost
- Feature vector extraction from user financial data
- PD (Probability of Default) scoring
- Detailed factor breakdowns and SHAP explanations
- Credit score trends and history tracking

B) Insurance Risk Assessment
- Comprehensive risk evaluation for:
  - Auto insurance
  - Home insurance
  - Health insurance
  - Life insurance
- Risk scoring based on financial behavior patterns
- Personalized recommendations

C) Expense Tracking & Classification
- AI-powered automatic expense categorization
- Confidence scoring for classifications
- Category management and custom tags
- Merchant identification and mapping
- Spending patterns and trends analysis

D) Financial Goal Tracking
- Set savings goals with target amounts and deadlines
- Progress visualization and milestone tracking
- Goal recommendations based on financial health
- Notifications for goal progress and achievements

E) Bill Splitting System
- Create and manage group expenses
- Track participant contributions and payments
- Email invitations to non-users
- Payment status tracking and reminders
- Automatic settlement calculations

4) Financial Products & Recommendations
- Personalized product recommendations:
  - Loans (personal, auto, mortgage)
  - Credit cards
  - Savings accounts
  - Investment products
- Comparison engine with rates, terms, requirements
- Application tracking and status updates

5) Metrics & Dashboard
- Real-time financial health overview
- Income vs expenses trends
- Net worth tracking
- Cash flow analysis
- Budget vs actual spending
- Savings rate and emergency fund status

DELIVERABLES
1) Repository structure (monorepo):
```
CODA/
├── apps/
│   ├── api/          # Express backend (port 5000)
│   └── web/          # React + Vite frontend (port 5173)
├── packages/
│   └── db/           # Drizzle ORM schema + migrations
```

2) Database schema covering:
- users (JWT authenticated)
- bank_accounts, bank_connections, transactions
- credit_scores, credit_score_history
- insurance_risks, risk_factors
- expenses, expense_categories
- financial_goals, goal_progress
- bill_splits, bill_split_participants
- financial_products, product_recommendations
- notifications
- audit_logs

3) ML/AI Features:
- XGBoost model for PD scoring (ONNX format)
- Feature engineering pipeline
- SHAP explainability for credit decisions
- Model registry and versioning
- Automatic expense classification

4) Security & Privacy:
- Bank-level encryption for financial data
- Simple JWT authentication with token management
- Rate limiting on API endpoints
- Input validation with Zod schemas
- Audit logging for sensitive operations
- Secure session management with token blacklist

5) UX/UI Requirements:
- Mobile-responsive design
- Accessibility (ARIA labels, keyboard navigation)
- Loading states and error boundaries
- Real-time updates with WebSocket (where applicable)
- Progressive Web App (PWA) capabilities
- Dark mode support

DEVELOPMENT PRINCIPLES
- Type safety: Full TypeScript coverage
- Testing: Unit tests for business logic, integration tests for APIs
- Code quality: ESLint + Prettier, consistent formatting
- Documentation: JSDoc comments for complex functions
- Error handling: Structured error responses, user-friendly messages
- Performance: Optimized queries, caching strategies, lazy loading
- Scalability: Modular architecture, separation of concerns

DEPLOYMENT
- Development: npm run dev (both frontend and backend)
- Production: Build optimized bundles, environment-based config
- Monitoring: Health check endpoint, error tracking
- Database: Migration scripts, seed data for testing
