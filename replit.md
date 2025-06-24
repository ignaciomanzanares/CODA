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

Changelog:
- June 24, 2025. Initial setup