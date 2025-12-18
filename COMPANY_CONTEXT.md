# Company Context & Business Overview

**Last Updated**: October 30, 2025

## 📋 Executive Summary

This document consolidates key information from company meetings, legal documents, and strategic planning materials for the Weloan/FinHealth platform development.

---

## 🏢 Legal Structure

### Holding Company: WEGROUP HOLDING SpA
- **Founded**: October 17, 2025
- **RUT**: [Pending registration]
- **Legal Form**: Sociedad por Acciones (SpA)
- **Domicile**: Santiago, Región Metropolitana, Chile
- **Notary**: Wladimir Alejandro Schramm López, 49th Notary of Santiago
- **Duration**: Indefinite

**Shareholders** (Equal ownership - 33.33% each):
1. **Tomás Marín Álamos** - Chief Operating Officer (COO)
   - Chilean, married, Electrical Engineer
   - RUT: 18.936.130-0

2. **Ignacio Manzanares Banchero** - Chief Technology Officer (CTO)
   - Chilean, single, Student
   - RUT: 21.486.204-2
   - Address: Arquitecto Ictinos 612, Las Condes

3. **Thomas Schmidt Puga** - Chief Executive Officer (CEO)
   - Chilean, single, Lawyer
   - RUT: 19.137.676-5
   - Address: José Manuel Cousiño 1882, Providencia

**Capital**: $1,000,000 CLP divided into 1,000 ordinary shares

**Corporate Purpose**:
- Mobile and real estate investments (shares, bonds, debentures, credits, real estate)
- Take interest as partner in companies/societies of any nature
- Create, finance, promote and administer businesses
- Provide administration, management, and marketing services to subsidiary companies
- Support services to portfolio companies

**Administration**: Tomás Marín Álamos and Thomas Schmidt Puga (joint or individual with limitations)

---

### Operating Company: CHILE OPENDATA ANALYTICS SpA (CODA)
- **Commercial Name**: CODA SpA
- **Founded**: October 17, 2025
- **Legal Form**: Sociedad por Acciones (SpA)
- **Domicile**: Santiago, Región Metropolitana, Chile
- **Owner**: 100% owned by WEGROUP HOLDING SpA
- **Duration**: Indefinite

**Capital**: $1,000,000 CLP divided into 1,000 ordinary shares

**Corporate Purpose** (Main Business):
Develop, implement, commercialize and operate technological solutions and data analytics for **credit risk and insurance risk assessment** for individuals and legal entities, using:
- Open financial information (Open Banking/Open Finance)
- Transactional data
- Other authorized data sources

**Authorized Activities**:
1. Design, operate, maintain and commercialize digital platforms, applications and IT systems integrating Open Banking/Finance data
2. Develop and license software, algorithms and predictive models (AI/ML) for credit scoring, monitoring and financial risk management
3. Provide data analysis services, report generation, risk profiling and personalized recommendations for financial products and insurance
4. R&D activities, collaboration agreements, joint ventures (domestic and international)
5. Acquire, sell, lease, encumber or exploit any movable/immovable property necessary for business
6. Invest in complementary companies, societies or projects

**Administration**: Ignacio Manzanares Banchero, Tomás Marín Álamos, and Thomas Schmidt Puga (joint or individual with limitations)

---

## 📅 Meeting Minutes - October 17, 2025

### Key Decisions

#### 1. Internal Structure & Roles ✅
- **CEO**: Thomas Schmidt Puga
- **CTO**: Ignacio Manzanares Banchero  
- **COO**: Tomás Marín Álamos

#### 2. Legal Structure ✅
- Confirmed: Holding company (WEGROUP HOLDING SpA) with equal 3-way ownership
- Holding owns 100% of CODA (operating company)
- **Signing Date**: First week of December 2025 (pending Thomas's document review)

#### 3. Service Areas - Three Pillars

##### A) Services for Individuals (Personas) ✅ APPROVED
1. **Credit Risk Evaluator** - FICO-style scoring system
2. **Robo-Advisor** - Proprietary AI-based financial advisor
3. **Financial Product Comparator** - Generates leads for banks, insurers, AGFs
4. **Expense Allocation Tool** - Invoice/receipt scanning for financial assistant integration

##### B) Services for Businesses (Empresas) ✅ APPROVED
1. **Bank Reconciliation** - Consolidate bank accounts and financial products
2. **Accounting Assistant** - Automated bookkeeping
3. **Real-time Financial Statements** - Live P&L, balance sheet, key metrics
4. **SII Integration** - Connect with Chilean tax authority
5. **Invoice Provider Integration** - Connect with platforms like Shopify
6. **CFO Dashboard** - Real-time company monitoring for executives

##### C) Payment Initiation ⏳ UNDER REVIEW
- Status: Not decided yet
- Action: 2-week investigation to determine added value before final decision

#### 4. Cybersecurity 🔒
- Current: AWS deemed secure for this stage
- Action: Seek expert consultation on data protection
- Timeline: 1 week to identify consultants and schedule meeting

#### 5. Work Plan 📊
- **Weekly meetings**: Day/time set every Monday
- **Deliverables**: Each member prepares progress summary for weekly meeting
- **Sprint approach**: 2-week cycles per MVP

#### 6. Timeline 📅
- **Target**: February 2026 - All software developments completed
- **Approach**: MVP-driven development with 2-week sprints

---

## 🎯 MVP Development Plan (2-Week Sprints)

Each MVP includes: Software + Legal + Contracts + Operational Analysis

### Sprint 1: Credit Risk Evaluator
- Study existing credit scoring systems
- Apply AI and machine learning
- Build trustworthy evaluator for third parties (individuals → businesses later)
- **Goal**: Most accurate and reliable scoring possible

### Sprint 2: Robo-Advisor
- Train proprietary AI
- Coordinate tasks across team
- **Goal**: Basic MVP skeleton of functionality

### Sprint 3: Product Comparator
- Generate sales/leads for banks, insurers, AGFs, etc.
- **Goal**: Targeted marketing capabilities for providers

### Sprint 4: Business Bank Reconciliation
- Consolidate checking accounts and financial products
- SII connection
- Invoice provider integration (Shopify, etc.)
- **Goal**: Real-time financial statements and key metrics for CFO monitoring

### Sprint 5: Payment Initiation (Optional)
- **Goal**: Research and decide if it adds value (2 weeks)

### Sprint 6: Cybersecurity
- Identify expert consultants
- Have meeting and make decisions
- **Timeline**: 1 week for this phase

---

## 🏗️ Technology Architecture (From Development Document)

### Phase 1: Architecture & Provider Selection (July 27 - Aug 10)

| Component | Provider/Technology |
|-----------|---------------------|
| **Authentication/Consent** | Auth0 ✅ |
| **Database** | Supabase/Render/ [chosen: PostgreSQL on Render] ✅ |
| **Bank Connection** | Fintoc? [Currently mock implementation] |

### Phase 2: UX/UI Design (Aug 11 - Aug 25)
- Design user experience and interface

### Phase 3: Backend & Frontend Development (Aug 26 - Sep 23)
- Full-stack implementation
- React + TypeScript frontend
- Express.js + TypeScript backend
- ML pipeline integration

### Phase 4: Banking API & Regulator Integration (Sep 24 - ...)
- Real Open Banking provider integration
- SII (Chilean tax authority) integration
- Compliance requirements

---

## 🎯 Strategic Positioning

### Target Markets
1. **B2C (Individuals)**
   - Personal credit assessment
   - Financial planning via robo-advisor
   - Product comparison and recommendations
   - Expense tracking and budgeting

2. **B2B (Businesses)**
   - Credit risk evaluation for lending
   - Real-time financial dashboards
   - Accounting automation
   - Tax compliance (SII integration)

3. **B2B2C (Financial Institutions)**
   - Lead generation from product comparator
   - White-label credit scoring
   - Segmented marketing opportunities

### Competitive Advantages
- **Proprietary ML models**: Custom-trained AI for Chilean market
- **Open Banking integration**: Real financial data vs. self-reported
- **Real-time analytics**: Live dashboards for businesses
- **Full-stack solution**: From credit scoring to financial planning
- **Regulatory compliance**: Built for Chilean legal framework

### Revenue Streams
1. **Lead Generation**: Commissions from banks/insurers for qualified leads
2. **SaaS Subscriptions**: Monthly fees for business dashboards
3. **API Access**: Credit scoring API for financial institutions
4. **Premium Features**: Advanced analytics and insights

---

## 📊 Current Development Status (FinHealth Platform)

### ✅ Completed (as of Oct 30, 2025)
- Full-stack application architecture
- Auth0 enterprise authentication
- PostgreSQL database (19 tables)
- ML pipeline (XGBoost-based credit scoring)
- 19 engineered features for PD scoring
- ONNX model deployment
- Health check endpoint
- Structured logging (Pino)
- Rate limiting (4-tier security)
- Testing infrastructure (14 tests passing)
- CI/CD pipeline (GitHub Actions)
- Production-ready for Render deployment

### 🚧 In Progress / Next Steps
- Real Open Banking integration (replace mock provider)
- Production ML model training with real data
- Monitoring/observability setup (DataDog/New Relic)
- API documentation (OpenAPI/Swagger)
- Increase test coverage to >80%

### 🎯 Alignment with Business Goals
The current FinHealth platform implements **Sprint 1: Credit Risk Evaluator** from the MVP plan:
- ✅ AI/ML-based scoring (XGBoost + SHAP explanations)
- ✅ Feature engineering from transactional data
- ✅ Baseline PD (Probability of Default) model
- ✅ API endpoints for credit assessment
- ⏳ Ready for transition to real Open Banking data

**Next development phase** should focus on:
1. **Sprint 2**: Robo-Advisor implementation
2. **Sprint 3**: Product Comparator for lead generation
3. **Real data integration**: Move from mock to Fintoc or similar

---

## 🔐 Compliance & Legal Considerations

### Data Protection Requirements
- Chilean data protection law compliance
- User consent management (Auth0)
- Secure data storage (encrypted PostgreSQL)
- GDPR-like requirements for personal financial data

### Financial Regulations
- Open Banking regulation compliance
- Credit scoring transparency requirements
- Insurance intermediary licensing (if applicable)
- Consumer protection laws

### Pending Legal Work
- Company registration completion (December 2025)
- Terms of Service for platform
- Privacy Policy
- Data Processing Agreements with partners
- Banking/insurance partnership contracts

---

## 💡 Key Insights from Documents

1. **Equal Partnership**: All three founders have equal stake and clear role divisions (CEO, CTO, COO)

2. **Two-Entity Structure**: Holding company protects founders' interests while operating company (CODA) takes business risks

3. **Agile Development**: 2-week MVP sprints with complete deliverables (software + legal + operational)

4. **February 2026 Deadline**: Ambitious but clear target for software completion

5. **Chilean Market Focus**: Company structure, compliance, and initial integrations are Chile-specific

6. **Data-Driven Approach**: Heavy emphasis on AI/ML and open financial data

7. **B2B2C Strategy**: Serves end-users while generating revenue from financial institutions

---

## 📞 Next Actions for Team

### Thomas (CEO) - Week of Oct 28
- Review legal documents before December signing
- Identify cybersecurity consultant
- Schedule expert meeting within 1 week

### Ignacio (CTO) - Current Sprint
- Continue FinHealth platform development
- Prepare for Robo-Advisor sprint (Sprint 2)
- Set up monitoring/observability

### Tomás (COO) - Current Sprint
- Operational planning for product launch
- Partnership outreach (banks, insurers)
- Marketing strategy for product comparator

### All Team - Weekly Meetings
- Every Monday: Set meeting day/time for the week
- Prepare progress summaries
- Review 2-week sprint goals

---

## 📚 Reference Documents

- **Minuta Reunión 17.10.25.docx** - Meeting minutes
- **Desarrollo del Software_.docx** - Software development plan
- **EP - Constitucion Wegroup Holding.docx** - Holding company constitution
- **EP - Consitución CHILE OPENDATA ANALYTICS SPA.docx** - CODA company constitution
- **Extracto Wegroup Holding SpA.docx** - Holding company extract
- **Exctracto - CODA SpA.docx** - CODA company extract
- **Carta Gantt - Weloan Etapa I.xlsx** - Stage I Gantt chart (pending detailed review)

---

*This document synthesizes information from legal documents, meeting minutes, and technical specifications. Last reviewed: October 30, 2025.*
