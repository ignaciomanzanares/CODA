# FinHealth - Financial Analysis Platform

## Overview

FinHealth is a comprehensive financial analysis platform that provides personalized insights into credit scores, insurance risk assessments, and financial goal tracking. The application connects to users' bank accounts to analyze financial data and offers product recommendations to help users make informed financial decisions.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter for client-side routing
- **State Management**: TanStack Query (React Query) for server state management
- **UI Components**: Radix UI primitives with shadcn/ui component library
- **Styling**: Tailwind CSS with custom theme configuration
- **Build Tool**: Vite for development and production builds

### Backend Architecture
- **Runtime**: Node.js with Express.js REST API
- **Database**: PostgreSQL with Drizzle ORM
- **Session Management**: Simple in-memory session storage
- **Authentication**: Basic username/password authentication with session tokens

### Database Design
The system uses PostgreSQL with the following core tables:
- `users`: User account information
- `bank_connections`: Connected bank account data
- `credit_scores`: Credit score calculations and factors
- `insurance_risks`: Insurance risk assessments
- `financial_goals`: User-defined financial objectives
- `financial_products`: Available financial products catalog

## Key Components

### Authentication System
- Session-based authentication with token management
- User registration and login functionality
- Protected routes requiring authentication

### Bank Connection Integration
- Simulated bank account connection interface
- Support for multiple account types (checking, savings, credit cards, etc.)
- Mock financial data analysis for demonstration purposes

### Credit Score Analysis
- Automated credit score calculation based on connected accounts
- Payment history, utilization, and credit age factor analysis
- Visual representation with progress rings and detailed breakdowns

### Insurance Risk Assessment
- Risk level calculation (Low, Medium, High)
- Health, property, and auto risk categorization
- Risk factors based on financial stability indicators

### Financial Goal Management
- CRUD operations for personal financial goals
- Progress tracking with target amounts and dates
- Goal categorization (Emergency Fund, Retirement, etc.)

### Expense Tracking & Classification
- Automatic expense categorization using rule-based AI classification
- Manual expense entry with rich metadata (merchant, tags, notes)
- Category-based filtering and search functionality
- Recurring expense tracking and payment method logging
- Confidence scoring for auto-classified transactions

### Bill Splitting System
- Create shared expenses among groups of friends
- Automatic equal split calculation with customizable amounts
- Participant management with email notifications
- Payment tracking and status updates
- Real-time progress monitoring for group expenses

### Product Recommendation Engine
- Financial product catalog (loans, credit cards, insurance)
- Filtering and comparison functionality
- Personalized recommendations based on user profile

## Data Flow

1. **User Onboarding**: Users register and connect bank accounts
2. **Data Analysis**: System analyzes connected account data to calculate credit scores and insurance risks
3. **Dashboard Display**: Processed financial insights are displayed on the main dashboard
4. **Goal Setting**: Users can create and track financial goals
5. **Product Discovery**: System recommends relevant financial products based on user profile
6. **Financial Planning**: Users can view personalized action plans and timelines

## External Dependencies

### Database
- **Neon Database**: Serverless PostgreSQL database hosting
- **Drizzle ORM**: Type-safe database operations and migrations

### UI Framework
- **Radix UI**: Accessible component primitives
- **Tailwind CSS**: Utility-first CSS framework
- **Lucide React**: Icon library

### Development Tools
- **TypeScript**: Type safety across the entire stack
- **ESBuild**: Fast JavaScript bundling for production
- **tsx**: TypeScript execution for development

## Deployment Strategy

### Development Environment
- Replit-based development with hot reload
- PostgreSQL database provisioned automatically
- Environment variables managed through Replit secrets

### Production Build
- Vite builds the frontend to `dist/public`
- ESBuild bundles the server code to `dist/index.js`
- Single deployment artifact with static file serving

### Database Management
- Drizzle migrations handle schema changes
- Database seeding with demo data on startup
- Connection pooling through Neon serverless

## User Preferences

Preferred communication style: Simple, everyday language.

## Changelog

### July 30, 2025
**Railway Backend Integration**
- Integrated Railway backend API at https://wegroup-backend-production.up.railway.app
- Created RailwayAPI service layer for financial profile and credit analysis data
- Added RailwayFinancialData component to display real user accounts, transactions, and credit scores
- Added RailwayHealthCheck component for monitoring backend API connectivity
- Updated Dashboard with tabs to show both Railway API data and local demo data
- Enhanced BankConnectionCard to use Railway API for real bank connections
- API endpoints: GET /api/mock/financial-profile?userId=<id>, GET /api/mock/credit-analysis?userId=<id>, GET /health

### June 24, 2025 
**Initial Setup & Core Features**
- Set up FinHealth financial analysis platform with credit score and insurance risk analysis
- Created user authentication system with session management
- Implemented financial goal tracking with progress monitoring

**Expense Tracking & Classification**
- Added automatic expense categorization using rule-based AI classification
- Created expense management interface with filtering, search, and detailed metadata
- Implemented confidence scoring for auto-classified transactions
- Added support for recurring expenses and payment method tracking

**Bill Splitting System**
- Built group expense sharing functionality with participant management
- Added automatic equal split calculation with payment status tracking
- Created real-time progress monitoring for group expenses
- Implemented participant email notification system

**Technical Implementation**
- Enhanced database schema with new expense and bill split tables
- Added comprehensive storage layer with in-memory implementation
- Created new API routes for expense and bill split operations
- Updated navigation to include new Expenses and Bill Split features