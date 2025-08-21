<div align="center">
  <h1>🏦 FinHealth</h1>
  <p><strong>Intelligent Financial Health Platform by WeGroup 🇨🇱</strong></p>
  
  <p>A comprehensive financial analysis platform that provides personalized insights into credit scores, insurance risk assessments, expense tracking, and financial goal management.</p>

  ![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
  ![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)
  ![React](https://img.shields.io/badge/React-61DAFB?logo=react&logoColor=black)
  ![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)
  ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?logo=postgresql&logoColor=white)
  ![License](https://img.shields.io/badge/license-MIT-green.svg)
</div>

---

## ✨ Features

### 🎯 Core Financial Analysis
- **Credit Score Monitoring** - Real-time credit score analysis with detailed factor breakdowns
- **Insurance Risk Assessment** - Comprehensive risk evaluation for auto, home, health, and life insurance
- **Financial Goal Tracking** - Set, monitor, and achieve your financial objectives with progress visualization
- **Bank Account Integration** - Secure connection to multiple financial institutions

### 💰 Advanced Money Management
- **Expense Tracking & Classification** - AI-powered automatic categorization with confidence scoring
- **Bill Splitting System** - Smart group expense management with participant tracking
- **Financial Product Recommendations** - Personalized suggestions for loans, credit cards, and savings accounts
- **Railway API Integration** - Real-time financial data from external APIs

### 🔐 Security & Authentication
- **Auth0 Integration** - Enterprise-grade authentication and user management
- **Session Management** - Secure token-based sessions with automatic renewal
- **Data Encryption** - Bank-level security for all financial information

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- PostgreSQL 14+
- Auth0 account (for authentication)
- Railway API access (optional, for external data)

### 1. Clone & Install

```bash
git clone https://github.com/ignaciomanzanares/FinHealth.git
cd FinHealth
npm install
```

### 2. Environment Setup

Create a `.env` file in the root directory:

```env
# Database
DATABASE_URL="postgresql://username:password@localhost:5432/finhealth"

# Auth0 Configuration - Backend API
AUTH0_ISSUER_BASE_URL="https://your-domain.auth0.com/"
AUTH0_AUDIENCE="https://finhealth-api"

# Auth0 Configuration - Frontend
VITE_AUTH0_DOMAIN="your-domain.auth0.com"
VITE_AUTH0_CLIENT_ID="your-client-id"
VITE_AUTH0_AUDIENCE="https://finhealth-api"
VITE_AUTH0_REDIRECT_URI="http://localhost:5173"

# Auth0 Management API Configuration (Machine to Machine)
# Create a Machine to Machine application in Auth0 Dashboard
AUTH0_M2M_CLIENT_ID="your-m2m-client-id"
AUTH0_M2M_CLIENT_SECRET="your-m2m-client-secret"

# Railway API (Optional)
RAILWAY_API_URL="https://wegroup-backend-production.up.railway.app"

# Application
# The server always listens on port 5000 in this project
PORT=5000
NODE_ENV=development
```

### 3. Database Setup

```bash
# Push database schema
npm run db:push

# Seed with demo data
npm run db:seed
```

### 4. Development

```bash
# Start development server (backend + frontend via Express + Vite middleware)
npm run dev

# Or start the frontend dev server alone (API still proxied to http://localhost:5000):
npm run dev:frontend
```

### 5. Production Build

```bash
npm run build
npm start
```

---

## 🏗️ Architecture

### Frontend Stack
- **React 18** with TypeScript for type-safe development
- **Vite** for lightning-fast development and optimized builds
- **TanStack Query** for powerful server state management
- **Radix UI + shadcn/ui** for accessible, beautiful components
- **Tailwind CSS** with custom theming for consistent design
- **Wouter** for lightweight client-side routing

### Backend Stack
- **Express.js** REST API with TypeScript
- **PostgreSQL** with **Drizzle ORM** for type-safe database operations
- **Auth0** for enterprise authentication
- **Railway API** integration for real-time financial data
- **ESBuild** for optimized production bundles

### Database Design
```
├── users (Auth0 integrated)
├── bank_connections (Multi-bank support)
├── credit_scores (Real-time analysis)
├── insurance_risks (Comprehensive assessment)
├── financial_goals (Progress tracking)
├── expenses (AI classification)
├── bill_splits (Group management)
├── financial_products (Recommendation engine)
└── notifications (Real-time alerts)
```

---

## 📱 Screenshots

<details>
<summary>🖼️ View Application Screenshots</summary>

### Dashboard Overview
*Coming soon - Add screenshot of main dashboard*

### Credit Score Analysis
*Coming soon - Add screenshot of credit score visualization*

### Expense Tracking
*Coming soon - Add screenshot of expense management interface*

### Bill Splitting
*Coming soon - Add screenshot of bill splitting feature*

</details>

---

## 🛠️ Project Structure

```
FinHealth/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── pages/          # Application pages
│   │   ├── lib/            # Utilities and API clients
│   │   └── hooks/          # Custom React hooks
│   ├── public/             # Static assets
│   └── vite.config.ts      # Vite configuration
├── server/                 # Express backend
│   ├── index.ts            # Server entry point
│   ├── routes.ts           # API route definitions
│   ├── db.ts               # Database connection
│   └── storage.ts          # Data layer
├── shared/                 # Shared types and schemas
│   └── schema.ts           # Drizzle database schema
├── package.json            # Dependencies and scripts
└── drizzle.config.ts       # Database configuration
```

---

## 🔧 API Endpoints

### Authentication
Auth is handled via Auth0 JWT. There are no explicit `/api/auth/*` routes; instead, protected routes require a valid Bearer token.

### Financial Data
- `GET /api/credit-score` - Get credit score analysis
- `GET /api/insurance-risk` - Get insurance risk assessment
- `GET /api/bank-connections` - List connected accounts
- `POST /api/bank-connections` - Connect new account

### Goals & Planning
- `GET /api/financial-goals` - List user goals
- `POST /api/financial-goals` - Create new goal
- `PUT /api/financial-goals/:id` - Update goal
- `DELETE /api/financial-goals/:id` - Delete goal

### Expenses & Bills
- `GET /api/expenses` - List expenses with filtering
- `POST /api/expenses` - Add new expense
- `GET /api/bill-splits` - List bill splits
- `POST /api/bill-splits` - Create new bill split

### Public
- `GET /api/financial-products` - List financial products (optional category query)
- `GET /api/financial-products/:id` - Get product by ID
- `POST /api/utils/credit-score` - Calculate a score from provided bank data (demo)
- `POST /api/utils/insurance-risk` - Calculate risk from provided bank data and profile (demo)

---

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guidelines](CONTRIBUTING.md) for details.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🌟 Support

If you find this project helpful, please consider giving it a ⭐!

**Made with ❤️ by WeGroup 🇨🇱**

<div align="center">
  <p>For more information, visit our <a href="https://wegroup.cl">website</a> or contact us at <a href="mailto:contact@wegroup.cl">contact@wegroup.cl</a></p>
</div>
